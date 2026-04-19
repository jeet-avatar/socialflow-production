"""
Video provider adapters — one file per ``route_via`` value.

Each adapter module exports the same two callables:

    submit(model_id, api_key, prompt, duration, ratio) -> str (provider_job_id)
    poll(model_id, api_key, provider_job_id)           -> ProviderResult

Where ``ProviderResult`` is:

    {
        "status":   "queued" | "running" | "completed" | "failed",
        "video_url": Optional[str],   # mp4 URL on success
        "error":     Optional[str],   # message on failure
        "raw":       Optional[dict],  # last upstream payload, for debugging
    }

The dispatcher ``get_adapter(route_via)`` returns the module so generation
tasks can stay provider-agnostic:

    adapter = get_adapter(provider.route_via)
    job_id  = adapter.submit(model_id, key, prompt, dur, ratio)
    result  = adapter.poll(model_id, key, job_id)
"""

from typing import TypedDict, Literal, Optional, Callable, Any
from types import ModuleType

from . import fal_provider
from . import runway_provider


class ProviderResult(TypedDict, total=False):
    status: Literal["queued", "running", "completed", "failed"]
    video_url: Optional[str]
    error: Optional[str]
    raw: Optional[dict]


_ADAPTERS: dict[str, ModuleType] = {
    "fal": fal_provider,
    "runway": runway_provider,
}


class AdapterNotAvailable(Exception):
    """Raised when no adapter is wired for a given route_via yet."""


def get_adapter(route_via: str) -> ModuleType:
    mod = _ADAPTERS.get(route_via)
    if mod is None:
        raise AdapterNotAvailable(
            f"no adapter wired for route_via='{route_via}' "
            f"(available: {sorted(_ADAPTERS)})"
        )
    return mod


__all__ = ["get_adapter", "AdapterNotAvailable", "ProviderResult"]
