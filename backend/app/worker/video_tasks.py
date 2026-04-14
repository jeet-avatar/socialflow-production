"""
Celery tasks for video generation pipeline.

WHISPER OOM GUARD: Do NOT import whisper at module level.
Load whisper model inside the task function body only.
"""
import json
import logging
import os
import time
from typing import Optional

import httpx
import requests as http_requests

from worker.celery_app import celery_app
from utils.redis_client import set_progress, set_fal_request_id, get_fal_request_id

logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    name="video.render",
    max_retries=2,
    autoretry_for=(
        http_requests.Timeout,
        http_requests.ConnectionError,
        httpx.TimeoutException,
        httpx.ConnectError,
    ),
    retry_backoff=True,       # Celery 5.x exponential backoff
    retry_backoff_max=60,     # Cap backoff at 60s
    retry_jitter=True,        # Add jitter to avoid thundering herd
)
def render_video_task(self, user_id: str, job_id: str, body: dict) -> dict:
    """
    Run the full Remotion video pipeline asynchronously.

    All external API calls (ElevenLabs, Whisper, DALL-E, fal.ai, Remotion, S3)
    happen here, not in the HTTP handler. Progress is written to Redis DB 2
    via set_progress() so the polling endpoint reads consistent state across
    worker processes.

    Args:
        user_id: Clerk user ID (string, JSON-safe)
        job_id:  Client-supplied or server-generated UUID for progress polling
        body:    Original request JSON body (all primitive types)

    Returns:
        {"success": True, "video_url": str, "video_id": str} on success
    """
    # WHISPER NOTE: whisper is imported inside this function (not at module level)
    # to avoid loading the ML model (~74MB–1.5GB) in every worker process at startup.
    # This prevents OOM kills when concurrency=2+ workers start simultaneously.

    set_progress(job_id, 5, "Starting")

    try:
        # ── Lazy imports — keep at top of function body, NOT at module level ──
        # Whisper OOM guard: import inside task function
        import whisper as _whisper  # noqa: PLC0415

        # Import pipeline helpers from their source modules
        # (Do NOT import from content_routes to avoid circular imports)
        from utils.mongodb_service import mongodb_service
        from utils.s3_service import s3_service
        from utils.videos_service import videos_service
        from utils.provider_config import resolve_model_config

        set_progress(job_id, 10, "Loading config")

        # ── Extract all args from body (JSON primitives only) ──
        dialogue        = body.get("dialogue", "")
        company_name    = body.get("company_name", "")
        channel_id      = body.get("channel_id")
        bgm_url         = body.get("bgm")
        template_url    = body.get("template")
        use_ai_clips    = body.get("use_ai_clips", False)
        scenes          = body.get("scenes") or []

        # ── Resolve model config (DB or env fallback — never crashes) ──
        try:
            model_cfg = resolve_model_config(user_id, channel_id)
        except Exception:
            model_cfg = None  # Will use env-var fallback inside helpers

        set_progress(job_id, 15, "Pipeline started", "Handing off to video generator")

        # ── Delegate to the existing pipeline utility ──
        # The pipeline logic lives in routes/content_routes.py (generate_video_remotion_endpoint).
        # Rather than duplicate it here, import the pipeline function directly.
        # SAFE: content_routes.py does not import from worker/ — no circular import.
        from routes.content_routes import _run_video_pipeline  # noqa: PLC0415

        result = _run_video_pipeline(
            user_id=user_id,
            job_id=job_id,
            body=body,
            model_cfg=model_cfg,
            whisper_module=_whisper,
        )

        set_progress(job_id, 100, "Done")
        return result

    except Exception as exc:
        set_progress(job_id, -1, "Failed", str(exc)[:300])
        raise  # Let Celery handle retry / FAILURE state
