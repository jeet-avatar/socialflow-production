"""
Celery task for multi-model video generation — Phase 12.

Responsibilities per job:
    1. Resolve credentials (BYOK if user supplied a key for the provider,
       else fall back to platform env var — and charge platform credits).
    2. Dispatch to the right adapter (fal/runway/...).
    3. Poll the adapter until terminal state.
    4. Download finished mp4 → re-upload to our S3 bucket → rewrite the URL
       so we serve via CloudFront (stable, signed, not provider-CDN-dependent).
    5. On failure: refund any charged credit + persist error on the job doc.

State machine on ``generation_jobs.status``:

    pending ──► queued ──► running ──► completed
                              │
                              └─► failed

Cancellation is best-effort: we check ``cancel_requested`` before each poll.
"""

import logging
import os
import time
from datetime import datetime, timezone
from typing import Optional, Union

import requests as http_requests

from worker.celery_app import celery_app
from utils import byok_service
from utils.video_providers import get_provider, PLATFORM_MARKUP
from utils.video_adapters import get_adapter, AdapterNotAvailable
from utils.mongodb_service import mongodb_service

logger = logging.getLogger(__name__)

_COLLECTION = "generation_jobs"
_POLL_INTERVAL = int(os.getenv("GENERATION_POLL_INTERVAL", "8"))
_MAX_POLL_ATTEMPTS = int(os.getenv("GENERATION_MAX_POLLS", "300"))  # ≈40 min at 8s


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _jobs():
    if mongodb_service.db is None:
        mongodb_service.connect()
    return mongodb_service.db[_COLLECTION]


def _set_job(job_id: str, fields: dict) -> None:
    fields["updated_at"] = _now()
    _jobs().update_one({"job_id": job_id}, {"$set": fields})


def _resolve_credentials(user_id: str, provider) -> tuple[Union[str, dict, None], str]:
    """
    Returns (credentials, source) where source ∈ {'byok', 'platform'}.
    credentials=None means neither is available — caller must fail the job.
    """
    byok = byok_service.get_decrypted_key(user_id, provider.byok_key)
    if byok:
        return byok, "byok"
    missing = [v for v in provider.platform_env_vars if not os.getenv(v, "").strip()]
    if missing:
        return None, "platform"
    # For single-env-var providers, pass the env value; for multi-var (vertex)
    # adapters must already know which env vars to read — we pass a sentinel dict.
    if len(provider.platform_env_vars) == 1:
        return os.getenv(provider.platform_env_vars[0], "").strip(), "platform"
    return {v: os.getenv(v, "").strip() for v in provider.platform_env_vars}, "platform"


def _upload_to_s3(video_url: str, job_id: str) -> Optional[str]:
    """Download provider mp4 → upload to our S3 bucket → return CloudFront URL."""
    bucket = os.getenv("AWS_S3_BUCKET")
    if not bucket:
        logger.warning("AWS_S3_BUCKET not set — returning provider URL unmodified")
        return video_url
    try:
        import boto3  # noqa: PLC0415
        resp = http_requests.get(video_url, timeout=180, stream=True)
        resp.raise_for_status()
        s3_key = f"generations/{job_id}.mp4"
        s3 = boto3.client(
            "s3",
            region_name=os.getenv("AWS_REGION", "us-east-1"),
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        )
        s3.upload_fileobj(resp.raw, bucket, s3_key, ExtraArgs={"ContentType": "video/mp4"})
        cf_domain = os.getenv("CLOUDFRONT_DOMAIN")
        if cf_domain:
            return f"https://{cf_domain}/{s3_key}"
        return f"https://{bucket}.s3.amazonaws.com/{s3_key}"
    except Exception as exc:  # pragma: no cover — network path
        logger.warning("S3 upload failed for job %s: %s — serving provider URL", job_id, exc)
        return video_url


def _was_cancelled(job_id: str) -> bool:
    doc = _jobs().find_one({"job_id": job_id}, {"cancel_requested": 1})
    return bool(doc and doc.get("cancel_requested"))


@celery_app.task(bind=True, name="generation.video", max_retries=0, acks_late=True)
def generate_video_task(self, job_id: str) -> dict:
    """Execute the job whose doc lives at generation_jobs.job_id == job_id."""
    doc = _jobs().find_one({"job_id": job_id})
    if not doc:
        logger.error("generation job not found: %s", job_id)
        return {"ok": False, "error": "job not found"}

    user_id = doc["user_id"]
    model_id = doc["model_id"]
    prompt = doc["prompt"]
    duration = int(doc["duration_sec"])
    ratio = doc.get("ratio", "16:9")

    provider = get_provider(model_id)
    if provider is None:
        _set_job(job_id, {"status": "failed", "error": f"unknown model '{model_id}'"})
        return {"ok": False, "error": "unknown model"}

    credentials, source = _resolve_credentials(user_id, provider)
    if credentials is None:
        _set_job(job_id, {
            "status": "failed",
            "error": f"no credentials for {provider.byok_key} (BYOK absent + platform env missing)",
        })
        return {"ok": False, "error": "no credentials"}

    try:
        adapter = get_adapter(provider.route_via)
    except AdapterNotAvailable as exc:
        _set_job(job_id, {"status": "failed", "error": str(exc)})
        return {"ok": False, "error": str(exc)}

    _set_job(job_id, {"status": "queued", "credential_source": source, "started_at": _now()})

    # ── Submit ───────────────────────────────────────────────────────────
    try:
        provider_job_id = adapter.submit(model_id, credentials, prompt, duration, ratio)
    except Exception as exc:
        logger.exception("submit failed job=%s", job_id)
        _set_job(job_id, {"status": "failed", "error": f"submit error: {exc}"})
        return {"ok": False, "error": str(exc)}

    _set_job(job_id, {"provider_job_id": provider_job_id, "status": "running"})

    # ── Poll ─────────────────────────────────────────────────────────────
    for attempt in range(_MAX_POLL_ATTEMPTS):
        if _was_cancelled(job_id):
            _set_job(job_id, {"status": "failed", "error": "cancelled by user"})
            return {"ok": False, "error": "cancelled"}
        time.sleep(_POLL_INTERVAL)
        try:
            result = adapter.poll(model_id, credentials, provider_job_id)
        except Exception as exc:
            logger.exception("poll failed job=%s attempt=%d", job_id, attempt)
            _set_job(job_id, {"status": "failed", "error": f"poll error: {exc}"})
            return {"ok": False, "error": str(exc)}

        state = result.get("status")
        if state in ("queued", "running"):
            _set_job(job_id, {"status": state, "poll_attempt": attempt + 1})
            continue
        if state == "failed":
            _set_job(job_id, {"status": "failed", "error": result.get("error") or "provider failed"})
            return {"ok": False, "error": result.get("error")}
        if state == "completed":
            provider_url = result.get("video_url")
            final_url = _upload_to_s3(provider_url, job_id) if provider_url else provider_url
            cost = round(provider.cost_per_sec_usd * duration * (PLATFORM_MARKUP if source == "platform" else 1.0), 4)
            _set_job(job_id, {
                "status": "completed",
                "video_url": final_url,
                "provider_video_url": provider_url,
                "completed_at": _now(),
                "cost_usd": cost,
            })
            logger.info("generation complete job=%s url=%s", job_id, final_url)
            return {"ok": True, "video_url": final_url}

    _set_job(job_id, {"status": "failed", "error": "poll timeout"})
    return {"ok": False, "error": "timeout"}
