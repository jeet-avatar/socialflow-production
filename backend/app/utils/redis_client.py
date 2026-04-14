"""
Shared Redis client for SocialFlow.

Uses Redis DB 2 (separate from Celery broker DB 0 and result backend DB 1)
to avoid key collisions. All progress keys have a 7200s (2h) TTL matching
the previous in-memory prune logic in content_routes.py.
"""
import json
import os
import time
from typing import Optional

import redis as redis_lib

_PROGRESS_TTL = 7200  # 2 hours — matches old _progress_store prune cutoff
_FAL_REQ_TTL = 14400  # 4 hours — fal.ai job IDs expire after ~1h, keep longer for safety

_redis_url = os.getenv("REDIS_URL", "redis://redis:6379/2")
_client: Optional[redis_lib.Redis] = None


def _get_client() -> redis_lib.Redis:
    """Lazy singleton Redis client (avoids connection at import time)."""
    global _client
    if _client is None:
        _client = redis_lib.from_url(_redis_url, decode_responses=True)
    return _client


# ── Progress helpers ────────────────────────────────────────────────────────

def set_progress(job_id: str, percent: int, stage: str, detail: str = "") -> None:
    """Write progress for a render job to Redis with TTL. No-op if job_id is empty."""
    if not job_id:
        return
    payload = json.dumps({"percent": percent, "stage": stage, "detail": detail, "ts": time.time()})
    _get_client().setex(f"progress:{job_id}", _PROGRESS_TTL, payload)


def get_progress(job_id: str) -> dict:
    """Read progress for a render job from Redis. Returns {} if key not found."""
    raw = _get_client().get(f"progress:{job_id}")
    return json.loads(raw) if raw else {}


# ── fal.ai idempotency helpers ───────────────────────────────────────────────

def set_fal_request_id(job_id: str, scene_idx: int, fal_request_id: str) -> None:
    """Store fal.ai request_id before polling so retries can resume, not re-submit."""
    key = f"fal_req:{job_id}:{scene_idx}"
    _get_client().setex(key, _FAL_REQ_TTL, fal_request_id)


def get_fal_request_id(job_id: str, scene_idx: int) -> Optional[str]:
    """Return previously stored fal.ai request_id, or None if not found."""
    return _get_client().get(f"fal_req:{job_id}:{scene_idx}")
