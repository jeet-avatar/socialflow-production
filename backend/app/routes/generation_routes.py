"""
Multi-Model Generation Routes — /api/models, /api/generate, /api/byok, /api/credits.

Phase 12 Step 1: GET /api/models (public)
Phase 12 Step 3: BYOK CRUD (auth-protected)
Generation, credits, and Stripe purchase land in subsequent steps.
"""

import logging
from typing import Annotated, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, Field

from utils.middleware.auth_middleware import auth_middleware
from utils.video_providers import list_models_public, PROVIDER_REGISTRY
from utils import byok_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["generation"])


_NO_AUTH = "Authentication required"
_TOKEN_INVALID = "Invalid or expired token"
_VALID_PROVIDERS = {p.byok_key for p in PROVIDER_REGISTRY}


def get_current_user(authorization: Annotated[Optional[str], Header()] = None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail=_NO_AUTH)
    user_info = auth_middleware.verify_token(authorization)
    if not user_info:
        raise HTTPException(status_code=401, detail=_TOKEN_INVALID)
    return user_info["user_id"]


CurrentUser = Annotated[str, Depends(get_current_user)]


def _check_provider(provider: str) -> None:
    if provider not in _VALID_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"unknown provider '{provider}'. valid: {sorted(_VALID_PROVIDERS)}",
        )


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

@router.get("/models")
def list_models() -> dict:
    """Public list of available video-generation models."""
    return {"models": list_models_public()}


# ---------------------------------------------------------------------------
# BYOK CRUD
# ---------------------------------------------------------------------------

class StoreKeyRequest(BaseModel):
    """
    Single-key providers send {api_key: "..."}.
    Multi-field providers (kling, vertex) send {access, secret} or {key, project_id}.
    """
    api_key: Optional[str] = Field(None, description="Single-string API key")
    access: Optional[str] = Field(None, description="kling: access key")
    secret: Optional[str] = Field(None, description="kling: secret key")
    key: Optional[str] = Field(None, description="vertex: service-account JSON or base64")
    project_id: Optional[str] = Field(None, description="vertex: GCP project id")


@router.get("/byok")
def list_byok(user_id: CurrentUser) -> dict:
    return {"providers": byok_service.list_keys(user_id)}


@router.put("/byok/{provider}")
def store_byok(provider: str, body: StoreKeyRequest, user_id: CurrentUser) -> dict:
    _check_provider(provider)
    material: Union[str, dict]
    if provider == "kling":
        if not body.access or not body.secret:
            raise HTTPException(status_code=400, detail="kling requires {access, secret}")
        material = {"access": body.access, "secret": body.secret}
    elif provider == "vertex":
        if not body.key or not body.project_id:
            raise HTTPException(status_code=400, detail="vertex requires {key, project_id}")
        material = {"key": body.key, "project_id": body.project_id}
    else:
        if not body.api_key:
            raise HTTPException(status_code=400, detail=f"{provider} requires {{api_key}}")
        material = body.api_key

    try:
        return byok_service.store_key(user_id, provider, material)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.delete("/byok/{provider}")
def delete_byok(provider: str, user_id: CurrentUser) -> dict:
    _check_provider(provider)
    deleted = byok_service.delete_key(user_id, provider)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"no stored key for {provider}")
    return {"deleted": True}


@router.post("/byok/{provider}/validate")
def validate_byok(provider: str, user_id: CurrentUser) -> dict:
    _check_provider(provider)
    return byok_service.revalidate(user_id, provider)
