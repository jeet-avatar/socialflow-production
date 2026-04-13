"""
Seedance Studio Routes — /api/seedance/*
Prompt generation for Higgsfield Seedance 2.0 AI video.
"""

import logging
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, Field

from utils.middleware.auth_middleware import auth_middleware
from utils.seedance_service import generate_prompt, get_all_styles

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/seedance", tags=["seedance-studio"])

# ---------------------------------------------------------------------------
# Auth dependency (same pattern as other routes)
# ---------------------------------------------------------------------------

_NO_AUTH = "Authentication required"
_TOKEN_INVALID = "Invalid or expired token"


def get_current_user(authorization: Annotated[Optional[str], Header()] = None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail=_NO_AUTH)
    user_info = auth_middleware.verify_token(authorization)
    if not user_info:
        raise HTTPException(status_code=401, detail=_TOKEN_INVALID)
    return user_info["user_id"]


CurrentUser = Annotated[str, Depends(get_current_user)]

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

PLATFORMS = {"youtube", "tiktok", "instagram", "facebook", "linkedin", "shorts", "reels"}


class PromptRequest(BaseModel):
    style_id: str = Field(..., description="One of the 15 Seedance style IDs")
    concept: str = Field(..., min_length=10, max_length=2000, description="What the video should show/communicate")
    platform: str = Field("youtube", description="Target platform for optimization")
    duration_seconds: int = Field(10, ge=4, le=15, description="Output duration 4-15 seconds")
    channel_name: Optional[str] = Field(None, max_length=100, description="Channel/brand name to weave in")


class PromptResponse(BaseModel):
    prompt: str
    style_name: str
    style_emoji: str
    style_id: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/styles")
def list_styles():
    """
    Public — returns all 15 Seedance styles for the frontend picker.
    No auth required.
    """
    return {"styles": get_all_styles()}


@router.post("/generate-prompt", response_model=PromptResponse)
def generate_seedance_prompt(body: PromptRequest, _user_id: CurrentUser):
    """
    Authenticated — generate a Seedance 2.0 prompt via Claude.
    Returns the full paste-ready prompt for Higgsfield.
    """
    platform = body.platform.lower()
    if platform not in PLATFORMS:
        raise HTTPException(
            status_code=422,
            detail=f"platform must be one of: {', '.join(sorted(PLATFORMS))}",
        )

    try:
        result = generate_prompt(
            style_id=body.style_id,
            concept=body.concept,
            platform=platform,
            duration_seconds=body.duration_seconds,
            channel_name=body.channel_name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except RuntimeError as exc:
        logger.error(f"[SeedanceRoutes] Generation error: {exc}")
        raise HTTPException(status_code=503, detail="Prompt generation unavailable — check ANTHROPIC_API_KEY")

    return PromptResponse(
        prompt=result["prompt"],
        style_name=result["style_name"],
        style_emoji=result["style_emoji"],
        style_id=body.style_id,
    )
