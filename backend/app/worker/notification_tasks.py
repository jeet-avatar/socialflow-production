"""
Celery tasks for creator review notifications.

send_review_reminder — fires at 80% of a video's review window.
Writes to notifications collection + sends email if user email is resolvable.
"""
import logging
from datetime import datetime, timezone

from worker.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="worker.notification_tasks.send_review_reminder", bind=True, max_retries=2)
def send_review_reminder(self, user_id: str, channel_id: str, job_id: str):
    """
    Fired by APScheduler countdown at 80% of the review window.
    Skips if the video is already approved/rejected (creator acted early).
    Writes in-app notification and sends email.
    """
    try:
        from utils.mongodb_service import mongodb_service  # noqa: PLC0415

        db = mongodb_service.get_database()

        # Guard: MongoDB not connected
        if db is None:
            logger.warning(f"send_review_reminder: MongoDB not connected — skipping job_id={job_id}")
            return

        # Check if video is still pending (skip if already acted on)
        video = db["queued_videos"].find_one({"job_id": job_id})
        if not video:
            logger.info(f"send_review_reminder: job_id={job_id} not found — skipping")
            return
        if video.get("status") not in ("pending_review",):
            logger.info(
                f"send_review_reminder: job_id={job_id} status={video['status']} — already handled"
            )
            return

        # Write in-app notification
        now = datetime.now(timezone.utc)
        db["notifications"].insert_one({
            "user_id": user_id,
            "channel_id": channel_id,
            "video_id": job_id,
            "type": "review_reminder",
            "message": "Your video approval is expiring soon — review it before it expires.",
            "read": False,
            "created_at": now,
        })

        # Send email (best-effort, non-fatal)
        _send_reminder_email(user_id, channel_id)

    except Exception as exc:
        logger.error(f"send_review_reminder: failed for job_id={job_id}: {exc}")
        raise self.retry(exc=exc, countdown=60)


def _send_reminder_email(user_id: str, channel_id: str) -> None:
    """Resolve user email and send review reminder email. Non-fatal on any error."""
    try:
        from utils.user_service import user_service  # noqa: PLC0415
        user = user_service.get_user_by_supabase_id(user_id)
        if not user:
            return
        to_email = user.get("email")
        if not to_email:
            return

        from bson import ObjectId  # noqa: PLC0415
        from utils.mongodb_service import mongodb_service  # noqa: PLC0415
        # ObjectId required — channel_id is a string, MongoDB _id is ObjectId
        ch = mongodb_service.get_database()["channels"].find_one({"_id": ObjectId(channel_id)})
        channel_name = ch.get("name", "your channel") if ch else "your channel"

        # _send() is the correct internal mailer — send_notification() does not exist
        from utils.notifications import _send  # noqa: PLC0415
        _send(
            to_email=to_email,
            subject=f"[SocialFlow] Video approval expiring — {channel_name}",
            html=(
                f"<p>Hi,</p>"
                f"<p>A video generated for <strong>{channel_name}</strong> is expiring soon.</p>"
                f"<p>Log in to SocialFlow to review and approve or discard it before the window closes.</p>"
                f"<p>— The SocialFlow team</p>"
            ),
            plain=(
                f"Hi,\n\nA video generated for '{channel_name}' is expiring soon.\n"
                "Log in to SocialFlow to review and approve or discard it.\n\n"
                "— The SocialFlow team"
            ),
        )
    except Exception as exc:
        logger.warning(f"_send_reminder_email: failed (non-fatal): {exc}")
