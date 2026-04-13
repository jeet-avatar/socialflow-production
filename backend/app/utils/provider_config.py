"""
Provider configuration resolver for AI model layer.

Reads per-channel model config from MongoDB (model_configs collection) and
returns a ModelConfig dataclass with safe defaults when the DB is unavailable
or the user has no saved preference.
"""
import os
from dataclasses import dataclass, field
from typing import Optional

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

DEFAULT_VOICE_ID = "2EiwWnXFnvU5JabPnv8n"
DEFAULT_FAL_MODEL = "fal-ai/kling-video/v1.6/standard/text-to-video"


# ---------------------------------------------------------------------------
# ModelConfig dataclass
# ---------------------------------------------------------------------------

@dataclass
class ModelConfig:
    script_model: str = "claude-sonnet-4-6"
    voice_provider: str = "elevenlabs"
    voice_id: str = DEFAULT_VOICE_ID
    video_bg_provider: str = "fal_kling"
    research_provider: str = "serper"

    # API keys — always sourced from env vars, never from DB
    anthropic_api_key: str = field(default_factory=lambda: os.getenv("ANTHROPIC_API_KEY", ""))
    openai_api_key: str = field(default_factory=lambda: os.getenv("OPENAI_API_KEY", ""))
    elevenlabs_api_key: str = field(default_factory=lambda: os.getenv("ELEVENLABS_API_KEY", ""))
    fal_api_key: str = field(default_factory=lambda: os.getenv("FAL_API_KEY", ""))

    @property
    def fal_model_id(self) -> str:
        """Map video_bg_provider to the actual fal.ai model string."""
        _MAP = {
            "fal_kling": "fal-ai/kling-video/v1.6/standard/text-to-video",
            "runway_gen3": "fal-ai/runway-gen3",
        }
        return _MAP.get(self.video_bg_provider, DEFAULT_FAL_MODEL)


# ---------------------------------------------------------------------------
# Resolver
# ---------------------------------------------------------------------------

def resolve_model_config(user_id: str, channel_id: Optional[str] = None) -> ModelConfig:
    """
    Look up the model config for (user_id, channel_id) from MongoDB.

    Fallback priority:
      1. Channel-specific config (user_id + channel_id)
      2. User-level default config (user_id + channel_id=None)
      3. Hard-coded defaults via ModelConfig()

    Any DB error silently falls back to ModelConfig() — the pipeline must
    never crash because of a missing config document.
    """
    try:
        from utils.mongodb_service import mongodb_service
        col = mongodb_service.get_database()["model_configs"]

        doc = col.find_one({"user_id": user_id, "channel_id": channel_id})
        if doc is None and channel_id is not None:
            doc = col.find_one({"user_id": user_id, "channel_id": None})

        if doc:
            return ModelConfig(
                script_model=doc.get("script_model", "claude-sonnet-4-6"),
                voice_provider=doc.get("voice_provider", "elevenlabs"),
                voice_id=doc.get("voice_id", DEFAULT_VOICE_ID),
                video_bg_provider=doc.get("video_bg_provider", "fal_kling"),
                research_provider=doc.get("research_provider", "serper"),
                # API keys always from env vars — never from DB doc
                anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", ""),
                openai_api_key=os.getenv("OPENAI_API_KEY", ""),
                elevenlabs_api_key=os.getenv("ELEVENLABS_API_KEY", ""),
                fal_api_key=os.getenv("FAL_API_KEY", ""),
            )
    except Exception:
        # DB unavailable — fall through to defaults
        pass

    return ModelConfig()
