"""AI model config API — /model-config"""
import logging
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from utils.middleware.auth_middleware import auth_middleware
from utils.mongodb_service import mongodb_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/model-config", tags=["model-config"])

SCRIPT_MODELS = {"gpt-4o", "claude-sonnet-4-6", "gemini-2.0-flash"}
VOICE_PROVIDERS = {"elevenlabs", "openai_tts", "playht"}
VIDEO_BG_PROVIDERS = {"fal_kling", "runway_gen3", "dalle3"}
RESEARCH_PROVIDERS = {"serper", "brave", "perplexity"}


# ---------------------------------------------------------------------------
# Auth dependency (same pattern as videos_routes.py)
# ---------------------------------------------------------------------------

def get_current_user(authorization: Annotated[Optional[str], Header()] = None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_info = auth_middleware.verify_token(authorization)
    if not user_info:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if not user_info.get("user_id"):
        raise HTTPException(status_code=401, detail="Invalid token - no user_id")
    return user_info["user_id"]


CurrentUser = Annotated[str, Depends(get_current_user)]


# ---------------------------------------------------------------------------
# Request model
# ---------------------------------------------------------------------------

class ModelConfigUpsert(BaseModel):
    channel_id: Optional[str] = None  # None = user-level default
    script_model: Optional[str] = None
    voice_provider: Optional[str] = None
    voice_id: Optional[str] = None
    video_bg_provider: Optional[str] = None
    research_provider: Optional[str] = None


def _col():
    return mongodb_service.get_database()["model_configs"]


def _to_doc(doc: dict) -> dict:
    if doc is None:
        return None
    doc["id"] = str(doc.pop("_id"))
    return doc


def _get_config(user_id: str, channel_id: Optional[str]) -> Optional[dict]:
    return _col().find_one({"user_id": user_id, "channel_id": channel_id})


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/")
def get_default_config(user_id: CurrentUser):
    """Get the user's default model config (channel_id = None)."""
    doc = _get_config(user_id, None)
    return _to_doc(doc) if doc else {}


@router.get("/providers")
def list_providers():
    """Return the complete list of valid provider options — no auth required."""
    return {
        "script_models": sorted(SCRIPT_MODELS),
        "voice_providers": sorted(VOICE_PROVIDERS),
        "video_bg_providers": sorted(VIDEO_BG_PROVIDERS),
        "research_providers": sorted(RESEARCH_PROVIDERS),
    }


@router.get("/{channel_id}")
def get_channel_config(channel_id: str, user_id: CurrentUser):
    """Get channel-specific model config; falls back to user default if not set."""
    doc = _get_config(user_id, channel_id)
    if not doc:
        doc = _get_config(user_id, None)
    return _to_doc(doc) if doc else {}


@router.post("/", status_code=200)
def upsert_config(body: ModelConfigUpsert, user_id: CurrentUser):
    """Create or update a model config (upsert on user_id + channel_id)."""
    if body.script_model and body.script_model not in SCRIPT_MODELS:
        raise HTTPException(status_code=422, detail=f"script_model must be one of {sorted(SCRIPT_MODELS)}")
    if body.voice_provider and body.voice_provider not in VOICE_PROVIDERS:
        raise HTTPException(status_code=422, detail=f"voice_provider must be one of {sorted(VOICE_PROVIDERS)}")
    if body.video_bg_provider and body.video_bg_provider not in VIDEO_BG_PROVIDERS:
        raise HTTPException(status_code=422, detail=f"video_bg_provider must be one of {sorted(VIDEO_BG_PROVIDERS)}")
    if body.research_provider and body.research_provider not in RESEARCH_PROVIDERS:
        raise HTTPException(status_code=422, detail=f"research_provider must be one of {sorted(RESEARCH_PROVIDERS)}")

    updates = {k: v for k, v in body.model_dump().items() if k != "channel_id" and v is not None}
    updates["updated_at"] = datetime.now(timezone.utc)

    _col().update_one(
        {"user_id": user_id, "channel_id": body.channel_id},
        {
            "$set": updates,
            "$setOnInsert": {"user_id": user_id, "channel_id": body.channel_id, "created_at": updates["updated_at"]},
        },
        upsert=True,
    )
    doc = _get_config(user_id, body.channel_id)
    return _to_doc(doc)
