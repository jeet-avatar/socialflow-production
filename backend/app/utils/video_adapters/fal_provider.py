"""
fal.ai queue adapter — handles all models with ``route_via="fal"``.

fal queue protocol (uniform across every fal-ai model):
    POST https://queue.fal.run/{model_path}              -> {request_id}
    GET  https://queue.fal.run/{model_path}/requests/{id}/status
    GET  https://queue.fal.run/{model_path}/requests/{id}    (when status=COMPLETED)

Each model has a slightly different request body shape; that is handled by
``_build_body``. Response shape is uniform: ``{"video": {"url": "..."}}``.
"""

import logging
from typing import Optional

import requests

from utils.video_providers import get_provider

logger = logging.getLogger(__name__)

_TIMEOUT_SUBMIT = 30
_TIMEOUT_POLL = 15

# Two paths per fal model:
#   submit_path → used for POST (full model path, may include /text-to-video)
#   poll_path   → used for GET status/result (fal drops method-specific segments
#                 in queue URLs, so we must use the shorter org/model prefix)
# Verified against fal queue responses (their status_url response field).
_MODEL_PATHS = {
    "veo3-fal":   {"submit": "fal-ai/veo3",                                     "poll": "fal-ai/veo3"},
    "kling2-fal": {"submit": "fal-ai/kling-video/v2/master/text-to-video",      "poll": "fal-ai/kling-video"},
    "pika2-fal":  {"submit": "fal-ai/pika/v2/turbo/text-to-video",              "poll": "fal-ai/pika"},
    "hailuo-fal": {"submit": "fal-ai/minimax/hailuo-02/standard/text-to-video", "poll": "fal-ai/minimax"},
}


def _submit_url(model_id: str) -> str:
    paths = _MODEL_PATHS.get(model_id)
    if not paths:
        raise ValueError(f"fal adapter: unknown model_id '{model_id}'")
    return f"https://queue.fal.run/{paths['submit']}"


def _poll_base(model_id: str) -> str:
    paths = _MODEL_PATHS.get(model_id)
    if not paths:
        raise ValueError(f"fal adapter: unknown model_id '{model_id}'")
    return f"https://queue.fal.run/{paths['poll']}"


def _headers(api_key: str) -> dict:
    return {
        "Authorization": f"Key {api_key}",
        "Content-Type": "application/json",
    }


def _build_body(model_id: str, prompt: str, duration: int, ratio: str) -> dict:
    """Per-model request body — fal has no single schema across models."""
    provider = get_provider(model_id)
    if provider is None:
        raise ValueError(f"fal adapter: model '{model_id}' not in registry")

    # Defend against unsupported ratios/durations so errors fail-fast client-side.
    if ratio not in provider.ratios:
        raise ValueError(f"{model_id} does not support ratio '{ratio}' (allowed: {provider.ratios})")
    if duration not in provider.durations_sec:
        raise ValueError(f"{model_id} does not support duration {duration}s (allowed: {provider.durations_sec})")

    if model_id == "veo3-fal":
        # veo3 expects duration as string like "8s"
        return {"prompt": prompt, "aspect_ratio": ratio, "duration": f"{duration}s"}
    if model_id == "kling2-fal":
        return {"prompt": prompt, "duration": str(duration), "aspect_ratio": ratio}
    if model_id == "pika2-fal":
        return {"prompt": prompt, "aspect_ratio": ratio}
    if model_id == "hailuo-fal":
        # hailuo is 16:9 only + fixed 6s — body just needs prompt
        return {"prompt": prompt, "prompt_optimizer": True}
    raise ValueError(f"fal adapter: no body shape for '{model_id}'")


def submit(model_id: str, api_key: str, prompt: str, duration: int, ratio: str) -> str:
    """POST to fal queue, return provider request_id."""
    url = _submit_url(model_id)
    body = _build_body(model_id, prompt, duration, ratio)
    resp = requests.post(url, headers=_headers(api_key), json=body, timeout=_TIMEOUT_SUBMIT)
    if resp.status_code >= 400:
        raise RuntimeError(f"fal submit failed {resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    request_id = data.get("request_id")
    if not request_id:
        raise RuntimeError(f"fal submit returned no request_id: {data}")
    logger.info("fal submit model=%s request_id=%s", model_id, request_id)
    return request_id


def poll(model_id: str, api_key: str, provider_job_id: str) -> dict:
    """
    Return {status, video_url?, error?, raw}.

    Status mapping from fal → our canonical set:
        IN_QUEUE          -> queued
        IN_PROGRESS       -> running
        COMPLETED         -> completed  (fetches result URL)
        FAILED            -> failed
    """
    base = _poll_base(model_id)
    headers = _headers(api_key)

    status_resp = requests.get(
        f"{base}/requests/{provider_job_id}/status",
        headers=headers,
        timeout=_TIMEOUT_POLL,
    )
    if status_resp.status_code >= 400:
        return {
            "status": "failed",
            "error": f"fal status HTTP {status_resp.status_code}: {status_resp.text[:200]}",
            "raw": None,
        }

    payload = status_resp.json()
    upstream = (payload.get("status") or "").upper()

    if upstream in ("IN_QUEUE",):
        return {"status": "queued", "raw": payload}
    if upstream in ("IN_PROGRESS",):
        return {"status": "running", "raw": payload}
    if upstream == "FAILED":
        return {
            "status": "failed",
            "error": payload.get("error") or payload.get("message") or "fal reported FAILED",
            "raw": payload,
        }
    if upstream != "COMPLETED":
        # Unknown state — treat as still running so caller polls again.
        logger.warning("fal unknown status '%s' for %s", upstream, provider_job_id)
        return {"status": "running", "raw": payload}

    # COMPLETED — fetch the result body which contains the video URL.
    result_resp = requests.get(
        f"{base}/requests/{provider_job_id}",
        headers=headers,
        timeout=_TIMEOUT_POLL,
    )
    if result_resp.status_code >= 400:
        return {
            "status": "failed",
            "error": f"fal result HTTP {result_resp.status_code}: {result_resp.text[:200]}",
            "raw": payload,
        }
    result = result_resp.json()
    video_url = _extract_video_url(result)
    if not video_url:
        return {
            "status": "failed",
            "error": f"fal completed but no video URL in result: {str(result)[:200]}",
            "raw": result,
        }
    return {"status": "completed", "video_url": video_url, "raw": result}


def _extract_video_url(result: dict) -> Optional[str]:
    """
    fal result shapes seen in the wild:
        {"video": {"url": "..."}}          — veo3, kling, pika
        {"video_url": "..."}                — some older endpoints
        {"output": [{"url": "..."}]}        — hailuo sometimes
    """
    if isinstance(result.get("video"), dict) and result["video"].get("url"):
        return result["video"]["url"]
    if result.get("video_url"):
        return result["video_url"]
    output = result.get("output")
    if isinstance(output, list) and output and isinstance(output[0], dict):
        return output[0].get("url")
    if isinstance(output, dict) and output.get("url"):
        return output["url"]
    return None
