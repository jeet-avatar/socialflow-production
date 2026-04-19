"""
Runway Gen-4 Turbo adapter — ``route_via="runway"``.

Runway API protocol:
    POST https://api.dev.runwayml.com/v1/text_to_video   -> {id}
    GET  https://api.dev.runwayml.com/v1/tasks/{id}       -> {status, output:[url]}

Headers:
    Authorization: Bearer <key>
    X-Runway-Version: 2024-11-06
    Content-Type: application/json
"""

import logging
from typing import Optional

import requests

logger = logging.getLogger(__name__)

_BASE = "https://api.dev.runwayml.com/v1"
_API_VERSION = "2024-11-06"
_TIMEOUT_SUBMIT = 30
_TIMEOUT_POLL = 15

# Runway uses explicit ratio strings; map our canonical ratio to Runway's.
_RATIO_MAP = {
    "16:9": "1280:720",
    "9:16": "720:1280",
}


def _headers(api_key: str) -> dict:
    return {
        "Authorization": f"Bearer {api_key}",
        "X-Runway-Version": _API_VERSION,
        "Content-Type": "application/json",
    }


def submit(model_id: str, api_key: str, prompt: str, duration: int, ratio: str) -> str:
    if duration not in (5, 10):
        raise ValueError(f"runway supports 5s or 10s only, got {duration}")
    runway_ratio = _RATIO_MAP.get(ratio)
    if not runway_ratio:
        raise ValueError(f"runway does not support ratio '{ratio}' (use 16:9 or 9:16)")

    body = {
        "model": "gen4_turbo",
        "promptText": prompt,
        "duration": duration,
        "ratio": runway_ratio,
    }
    resp = requests.post(
        f"{_BASE}/text_to_video",
        headers=_headers(api_key),
        json=body,
        timeout=_TIMEOUT_SUBMIT,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"runway submit failed {resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    task_id = data.get("id")
    if not task_id:
        raise RuntimeError(f"runway submit returned no id: {data}")
    logger.info("runway submit model=%s task_id=%s", model_id, task_id)
    return task_id


def poll(model_id: str, api_key: str, provider_job_id: str) -> dict:
    """
    Runway task statuses: PENDING, RUNNING, SUCCEEDED, FAILED, CANCELLED, THROTTLED.
    """
    resp = requests.get(
        f"{_BASE}/tasks/{provider_job_id}",
        headers=_headers(api_key),
        timeout=_TIMEOUT_POLL,
    )
    if resp.status_code >= 400:
        return {
            "status": "failed",
            "error": f"runway task HTTP {resp.status_code}: {resp.text[:200]}",
            "raw": None,
        }
    payload = resp.json()
    upstream = (payload.get("status") or "").upper()

    if upstream in ("PENDING", "THROTTLED"):
        return {"status": "queued", "raw": payload}
    if upstream == "RUNNING":
        return {"status": "running", "raw": payload}
    if upstream in ("FAILED", "CANCELLED"):
        return {
            "status": "failed",
            "error": payload.get("failure") or payload.get("error") or f"runway {upstream}",
            "raw": payload,
        }
    if upstream != "SUCCEEDED":
        logger.warning("runway unknown status '%s' for %s", upstream, provider_job_id)
        return {"status": "running", "raw": payload}

    video_url = _extract_video_url(payload)
    if not video_url:
        return {
            "status": "failed",
            "error": f"runway SUCCEEDED but no video URL: {str(payload)[:200]}",
            "raw": payload,
        }
    return {"status": "completed", "video_url": video_url, "raw": payload}


def _extract_video_url(payload: dict) -> Optional[str]:
    output = payload.get("output")
    if isinstance(output, list) and output:
        first = output[0]
        if isinstance(first, str):
            return first
        if isinstance(first, dict):
            return first.get("url")
    if isinstance(output, dict):
        return output.get("url")
    return None
