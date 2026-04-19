"""
Video Provider Registry — single source of truth for multi-model AI video generation.

Adding a new model = append one entry to PROVIDER_REGISTRY. The /api/models endpoint
returns this list and the FE picker iterates it. Every field documented in
.planning/phases/12-multi-model-generation/SPEC.md §1.
"""

import os
from dataclasses import dataclass, asdict
from typing import Optional


@dataclass(frozen=True)
class VideoProvider:
    model_id: str                       # FE+BE constant, e.g. 'veo3-fal'
    display_name: str                   # human label, e.g. 'Veo 3 (fal)'
    route_via: str                      # 'fal' | 'vertex' | 'kuaishou' | 'runway' | 'luma' | 'higgsfield' | 'openai'
    platform_env_vars: tuple[str, ...]  # env var names that must be set for platform-pay flow
    byok_key: str                       # row in user_api_keys.provider for BYOK flow
    endpoint_url: str                   # provider HTTP endpoint
    auth_header_template: str           # 'Authorization: Key {key}' or 'Authorization: Bearer {key}'
    durations_sec: tuple[int, ...]      # supported output lengths
    ratios: tuple[str, ...]             # '16:9' | '9:16' | '1:1'
    cost_per_sec_usd: float             # provider cost — platform adds 25% markup
    where_to_get_url: str               # docs link shown in Settings → API Keys panel
    brand_color: str                    # hex, used by FE card accent
    enabled: bool = True                # set False to hide a model from registry without deleting


PROVIDER_REGISTRY: list[VideoProvider] = [
    VideoProvider(
        model_id="veo3-fal",
        display_name="Veo 3 (fal)",
        route_via="fal",
        platform_env_vars=("FAL_KEY",),
        byok_key="fal",
        endpoint_url="https://queue.fal.run/fal-ai/veo3",
        auth_header_template="Authorization: Key {key}",
        durations_sec=(8,),
        ratios=("16:9", "9:16", "1:1"),
        cost_per_sec_usd=0.50,
        where_to_get_url="https://fal.ai/dashboard/keys",
        brand_color="#a855f7",
    ),
    VideoProvider(
        model_id="veo3-vertex",
        display_name="Veo 3 (Google native)",
        route_via="vertex",
        platform_env_vars=("VERTEX_AI_KEY", "VERTEX_AI_PROJECT_ID"),
        byok_key="vertex",
        endpoint_url=(
            "https://us-central1-aiplatform.googleapis.com/v1/projects/{proj}/"
            "locations/us-central1/publishers/google/models/veo-3.0-generate-001:predictLongRunning"
        ),
        auth_header_template="Authorization: Bearer {gcp_oauth_token}",
        durations_sec=(8,),
        ratios=("16:9", "9:16"),
        cost_per_sec_usd=0.40,
        where_to_get_url="https://console.cloud.google.com/apis/credentials",
        brand_color="#4285f4",
    ),
    VideoProvider(
        model_id="kling2-fal",
        display_name="Kling 2.0 Master",
        route_via="fal",
        platform_env_vars=("FAL_KEY",),
        byok_key="fal",
        endpoint_url="https://queue.fal.run/fal-ai/kling-video/v2/master/text-to-video",
        auth_header_template="Authorization: Key {key}",
        durations_sec=(5, 10),
        ratios=("16:9", "9:16", "1:1"),
        cost_per_sec_usd=0.35,
        where_to_get_url="https://fal.ai/dashboard/keys",
        brand_color="#06b6d4",
    ),
    VideoProvider(
        model_id="kling2-direct",
        display_name="Kling 2.0 (direct)",
        route_via="kuaishou",
        platform_env_vars=("KLING_ACCESS_KEY", "KLING_SECRET_KEY"),
        byok_key="kling",
        endpoint_url="https://api.klingai.com/v1/videos/text2video",
        auth_header_template="Authorization: Bearer {jwt_signed_with_secret}",
        durations_sec=(5, 10),
        ratios=("16:9", "9:16", "1:1"),
        cost_per_sec_usd=0.30,
        where_to_get_url="https://klingai.com/dev",
        brand_color="#0891b2",
    ),
    VideoProvider(
        model_id="runway-gen4",
        display_name="Runway Gen-4 Turbo",
        route_via="runway",
        platform_env_vars=("RUNWAY_API_KEY",),
        byok_key="runway",
        endpoint_url="https://api.dev.runwayml.com/v1/text_to_video",
        auth_header_template="Authorization: Bearer {key}",
        durations_sec=(5, 10),
        ratios=("16:9", "9:16"),
        cost_per_sec_usd=0.50,
        where_to_get_url="https://app.runwayml.com/account",
        brand_color="#10b981",
    ),
    # Luma deferred — free Luma accounts have no API access. Keep the row but disabled
    # so when the user adds a paid Luma key we just flip enabled=True.
    VideoProvider(
        model_id="luma-dream",
        display_name="Luma Dream Machine",
        route_via="luma",
        platform_env_vars=("LUMA_API_KEY",),
        byok_key="luma",
        endpoint_url="https://api.lumalabs.ai/dream-machine/v1/generations",
        auth_header_template="Authorization: Bearer {key}",
        durations_sec=(5, 9),
        ratios=("16:9", "9:16", "1:1"),
        cost_per_sec_usd=0.30,
        where_to_get_url="https://lumalabs.ai/dream-machine/api/keys",
        brand_color="#f59e0b",
        enabled=False,
    ),
    VideoProvider(
        model_id="pika2-fal",
        display_name="Pika 2.0",
        route_via="fal",
        platform_env_vars=("FAL_KEY",),
        byok_key="fal",
        endpoint_url="https://queue.fal.run/fal-ai/pika/v2/turbo/text-to-video",
        auth_header_template="Authorization: Key {key}",
        durations_sec=(5,),
        ratios=("16:9", "9:16", "1:1"),
        cost_per_sec_usd=0.20,
        where_to_get_url="https://fal.ai/dashboard/keys",
        brand_color="#ec4899",
    ),
    VideoProvider(
        model_id="hailuo-fal",
        display_name="MiniMax Hailuo 02",
        route_via="fal",
        platform_env_vars=("FAL_KEY",),
        byok_key="fal",
        endpoint_url="https://queue.fal.run/fal-ai/minimax/hailuo-02/standard/text-to-video",
        auth_header_template="Authorization: Key {key}",
        durations_sec=(6,),
        ratios=("16:9",),
        cost_per_sec_usd=0.25,
        where_to_get_url="https://fal.ai/dashboard/keys",
        brand_color="#ef4444",
    ),
    VideoProvider(
        model_id="higgsfield",
        display_name="Higgsfield",
        route_via="higgsfield",
        platform_env_vars=("HIGGSFIELD_API_KEY",),
        byok_key="higgsfield",
        endpoint_url="https://platform.higgsfield.ai/v1/text2video",
        auth_header_template="Authorization: Bearer {key}",
        durations_sec=(5, 8),
        ratios=("16:9", "9:16"),
        cost_per_sec_usd=0.45,
        where_to_get_url="https://platform.higgsfield.ai",
        brand_color="#8b5cf6",
    ),
    VideoProvider(
        model_id="sora2-openai",
        display_name="Sora 2",
        route_via="openai",
        platform_env_vars=("OPENAI_API_KEY",),
        byok_key="openai",
        endpoint_url="https://api.openai.com/v1/videos",
        auth_header_template="Authorization: Bearer {key}",
        durations_sec=(4, 8, 12),
        ratios=("16:9", "9:16", "1:1"),
        cost_per_sec_usd=0.50,
        where_to_get_url="https://platform.openai.com/api-keys",
        brand_color="#000000",
    ),
]


PLATFORM_MARKUP = 1.25  # 25% markup on platform-pay flow; BYOK has 0% markup.


def get_provider(model_id: str) -> Optional[VideoProvider]:
    for p in PROVIDER_REGISTRY:
        if p.model_id == model_id and p.enabled:
            return p
    return None


def has_platform_key(provider: VideoProvider) -> bool:
    """Whether all platform env vars for this provider are set."""
    return all(os.getenv(var, "").strip() for var in provider.platform_env_vars)


def estimate_cost_usd(model_id: str, duration_sec: int, use_byok: bool) -> float:
    """
    Estimate cost shown to user before submit.
    Platform-pay: provider_cost * duration * 1.25 (markup).
    BYOK: 0 (user is billed directly by provider).
    """
    provider = get_provider(model_id)
    if not provider:
        return 0.0
    if use_byok:
        return 0.0
    return round(provider.cost_per_sec_usd * duration_sec * PLATFORM_MARKUP, 2)


def serialize_for_api(provider: VideoProvider) -> dict:
    """
    Public projection — what /api/models returns. Drops auth/endpoint internals
    so we never leak provider URLs or header templates to the client.
    """
    return {
        "model_id": provider.model_id,
        "display_name": provider.display_name,
        "route_via": provider.route_via,
        "byok_key": provider.byok_key,
        "durations_sec": list(provider.durations_sec),
        "ratios": list(provider.ratios),
        "cost_per_sec_usd": provider.cost_per_sec_usd,
        "where_to_get_url": provider.where_to_get_url,
        "brand_color": provider.brand_color,
        "platform_key_available": has_platform_key(provider),
        "byok_only": not has_platform_key(provider),
    }


def list_models_public() -> list[dict]:
    return [serialize_for_api(p) for p in PROVIDER_REGISTRY if p.enabled]
