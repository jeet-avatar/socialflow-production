"""
Per-channel cron scheduling via APScheduler 3.x.

ISOLATION RULE: Do NOT import render_video_task or generate_marketing_package
at module level. Import inside _run_channel_pipeline() body only — same
circular-import guard as video_tasks.py uses for whisper.

MULTI-PROCESS WARNING: APScheduler MongoDBJobStore does NOT provide
distributed locking. With 2+ ECS tasks, both will fire the same job.
In production (Phase 10), set SCHEDULER_ENABLED=false on all but one task.
"""
import logging
import os
from contextlib import asynccontextmanager

from apscheduler.jobstores.mongodb import MongoDBJobStore
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

# Frequency string → CronTrigger kwargs
FREQUENCY_CRON: dict[str, dict] = {
    "daily":   {"hour": 9, "minute": 0},
    "3x_week": {"day_of_week": "mon,wed,fri", "hour": 9, "minute": 0},
    "weekly":  {"day_of_week": "mon", "hour": 9, "minute": 0},
}

_scheduler: AsyncIOScheduler | None = None


def get_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is None:
        raise RuntimeError("Scheduler not initialized — scheduler_lifespan must be entered first")
    return _scheduler


@asynccontextmanager
async def scheduler_lifespan():
    """
    Enter in FastAPI startup_event to start APScheduler with MongoDBJobStore.
    On startup: re-registers all channels with auto_post=True.
    On shutdown: gracefully stops the scheduler.
    """
    global _scheduler
    if os.getenv("SCHEDULER_ENABLED", "true").lower() != "true":
        logger.info("APScheduler disabled via SCHEDULER_ENABLED=false — skipping")
        yield None
        return

    mongo_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    jobstores = {
        "default": MongoDBJobStore(
            database="socialflow",
            collection="apscheduler_jobs",
            host=mongo_uri,
        )
    }
    _scheduler = AsyncIOScheduler(jobstores=jobstores, timezone="UTC")
    _scheduler.start()
    logger.info("APScheduler started with MongoDBJobStore (apscheduler_jobs)")

    await _load_active_channels()

    try:
        yield _scheduler
    finally:
        _scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped")


async def _load_active_channels() -> None:
    """Re-register cron jobs for every auto_post=True channel on startup."""
    try:
        from utils.mongodb_service import mongodb_service  # noqa: PLC0415
        col = mongodb_service.get_database()["channels"]
        channels = list(col.find({"auto_post": True}))
        for ch in channels:
            _upsert_job(str(ch["_id"]), ch.get("posting_frequency", "weekly"))
        logger.info(f"APScheduler: loaded {len(channels)} scheduled channel(s)")
    except Exception as exc:
        logger.warning(f"APScheduler: failed to load channels on startup (non-fatal): {exc}")


def _upsert_job(channel_id: str, posting_frequency: str) -> None:
    """Add or replace the cron job for a single channel. Safe to call repeatedly."""
    cron_kwargs = FREQUENCY_CRON.get(posting_frequency, FREQUENCY_CRON["weekly"])
    get_scheduler().add_job(
        _run_channel_pipeline,
        CronTrigger(**cron_kwargs, timezone="UTC"),
        id=f"channel:{channel_id}",
        args=[channel_id],
        replace_existing=True,
        misfire_grace_time=3600,  # Fire up to 1h late if backend was down
        coalesce=True,            # Skip accumulated missed fires (not all at once)
    )
    logger.info(f"APScheduler: job registered channel:{channel_id} ({posting_frequency})")


def sync_channel(channel_id: str, auto_post: bool, posting_frequency: str) -> None:
    """
    Called by channel_routes.py after any successful PUT /{channel_id}.
    Adds, replaces, or removes the cron job to keep scheduler in sync with DB.
    Safe to call even if SCHEDULER_ENABLED=false (_scheduler will be None → skip).
    """
    if _scheduler is None:
        return
    job_id = f"channel:{channel_id}"
    if auto_post:
        _upsert_job(channel_id, posting_frequency)
    else:
        try:
            _scheduler.remove_job(job_id)
            logger.info(f"APScheduler: removed job {job_id}")
        except Exception:
            pass  # Job may not exist if auto_post was already False


async def _run_channel_pipeline(channel_id: str) -> None:
    """
    Cron job callback. Generates dialogue from channel niche, then fires
    render_video_task with a valid dialogue field.

    WHY niche-to-dialogue step is mandatory:
    _run_video_pipeline (content_routes.py:2229) returns
    {"error": "dialogue is required"} immediately when dialogue is absent.
    Passing only niche to render_video_task would cause every scheduled cron
    fire to fail silently inside Celery. We generate dialogue here, before
    dispatching, so the task always receives a fully-formed body.

    Imports are inside the function body to avoid circular imports at module load.
    """
    import uuid  # noqa: PLC0415
    try:
        from utils.mongodb_service import mongodb_service  # noqa: PLC0415
        from bson import ObjectId  # noqa: PLC0415
        col = mongodb_service.get_database()["channels"]
        ch = col.find_one({"_id": ObjectId(channel_id)})
        if not ch or not ch.get("auto_post"):
            logger.info(f"APScheduler: channel {channel_id} auto_post=False at fire time, skipping")
            return

        user_id = ch["user_id"]
        niche = ch.get("niche") or ""

        # ── Step 1: Generate dialogue from channel niche ──────────────────
        # generate_marketing_package returns {"video_dialogue": str, "video_title": str, ...}
        # Fallback prompt used when niche is empty.
        niche_prompt = (
            niche if niche.strip()
            else "Create an engaging short-form social media video that showcases our services and drives audience action."
        )

        from utils.personalised_message import generate_marketing_package  # noqa: PLC0415
        package = generate_marketing_package(
            prompt=niche_prompt,
            user_id=user_id,
            sender_mode="company",
            target_duration="short",
        )

        dialogue = package.get("video_dialogue", "")
        if not dialogue:
            logger.error(
                f"APScheduler: dialogue generation returned empty for channel {channel_id} "
                f"(niche='{niche[:80]}') — skipping render_video_task dispatch"
            )
            return

        logger.info(
            f"APScheduler: generated dialogue ({len(dialogue)} chars) for channel={channel_id}"
        )

        # ── Step 2: Dispatch render_video_task with valid dialogue ────────
        from worker.video_tasks import render_video_task  # noqa: PLC0415
        job_id = str(uuid.uuid4())
        render_video_task.delay(
            user_id=user_id,
            job_id=job_id,
            body={
                "channel_id": channel_id,
                "dialogue": dialogue,
                "niche": niche,
            },
        )
        logger.info(f"APScheduler: dispatched render_video_task channel={channel_id} job_id={job_id}")
    except Exception as exc:
        logger.error(f"APScheduler: failed to dispatch pipeline for channel {channel_id}: {exc}")
