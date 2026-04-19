"""
Multi-Model Generation Routes — /api/models, /api/generate, /api/byok, /api/credits.

Phase 12 Step 1: GET /api/models (public)
Phase 12 Step 3: BYOK CRUD (auth-protected)
Generation, credits, and Stripe purchase land in subsequent steps.
"""

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, Field

from utils.middleware.auth_middleware import auth_middleware
from utils.video_providers import (
    list_models_public,
    PROVIDER_REGISTRY,
    get_provider,
    estimate_cost_usd,
)
from utils import byok_service
from utils.mongodb_service import mongodb_service

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


# ---------------------------------------------------------------------------
# Generation — /api/generate
# ---------------------------------------------------------------------------

class GenerateRequest(BaseModel):
    model_id: str = Field(..., description="From /api/models")
    prompt: str = Field(..., min_length=3, max_length=2000)
    duration_sec: int = Field(..., ge=3, le=30)
    ratio: str = Field("16:9", description="16:9 | 9:16 | 1:1")
    pay_with: str = Field("credits", description="credits | byok")


def _jobs_col():
    if mongodb_service.db is None:
        mongodb_service.connect()
    return mongodb_service.db["generation_jobs"]


def _serialize_job(doc: dict) -> dict:
    """Public projection — strips credential_source/raw internals."""
    def _iso(k):
        v = doc.get(k)
        return v.isoformat() if hasattr(v, "isoformat") else v
    return {
        "job_id": doc.get("job_id"),
        "model_id": doc.get("model_id"),
        "prompt": doc.get("prompt"),
        "duration_sec": doc.get("duration_sec"),
        "ratio": doc.get("ratio"),
        "status": doc.get("status"),
        "video_url": doc.get("video_url"),
        "error": doc.get("error"),
        "cost_usd": doc.get("cost_usd"),
        "estimated_cost_usd": doc.get("estimated_cost_usd"),
        "pay_with": doc.get("pay_with"),
        "created_at": _iso("created_at"),
        "started_at": _iso("started_at"),
        "completed_at": _iso("completed_at"),
    }


@router.post("/generate")
def enqueue_generation(body: GenerateRequest, user_id: CurrentUser) -> dict:
    provider = get_provider(body.model_id)
    if provider is None:
        raise HTTPException(status_code=400, detail=f"unknown or disabled model: {body.model_id}")
    if body.duration_sec not in provider.durations_sec:
        raise HTTPException(
            status_code=400,
            detail=f"{body.model_id} supports durations {list(provider.durations_sec)}s",
        )
    if body.ratio not in provider.ratios:
        raise HTTPException(
            status_code=400,
            detail=f"{body.model_id} supports ratios {list(provider.ratios)}",
        )
    if body.pay_with not in ("credits", "byok"):
        raise HTTPException(status_code=400, detail="pay_with must be 'credits' or 'byok'")

    # Verify credentials are actually available for the chosen path.
    if body.pay_with == "byok":
        key = byok_service.get_decrypted_key(user_id, provider.byok_key)
        if not key:
            raise HTTPException(
                status_code=400,
                detail=f"no BYOK key stored for {provider.byok_key} — add one in Settings → API Keys",
            )
    else:
        missing = [v for v in provider.platform_env_vars if not os.getenv(v, "").strip()]
        if missing:
            # Platform key not provisioned; point user to BYOK.
            raise HTTPException(
                status_code=402,
                detail=(
                    f"platform billing not available for {provider.display_name}. "
                    f"Add your own {provider.byok_key} API key in Settings."
                ),
            )

    job_id = f"gen_{uuid.uuid4().hex[:16]}"
    now = datetime.now(timezone.utc)
    cost = estimate_cost_usd(body.model_id, body.duration_sec, use_byok=(body.pay_with == "byok"))

    _jobs_col().insert_one({
        "job_id": job_id,
        "user_id": user_id,
        "model_id": body.model_id,
        "prompt": body.prompt,
        "duration_sec": body.duration_sec,
        "ratio": body.ratio,
        "pay_with": body.pay_with,
        "status": "pending",
        "estimated_cost_usd": cost,
        "created_at": now,
        "updated_at": now,
    })

    # Enqueue Celery task. Import here to avoid pulling celery into the route
    # module at import time (keeps /api/models working even if broker is down).
    try:
        from worker.generation_tasks import generate_video_task  # noqa: PLC0415
        generate_video_task.delay(job_id)
    except Exception as exc:
        logger.exception("failed to enqueue generation task job=%s", job_id)
        _jobs_col().update_one(
            {"job_id": job_id},
            {"$set": {"status": "failed", "error": f"enqueue failed: {exc}", "updated_at": datetime.now(timezone.utc)}},
        )
        raise HTTPException(status_code=503, detail="generation service unavailable") from exc

    doc = _jobs_col().find_one({"job_id": job_id})
    return _serialize_job(doc)


@router.get("/generate")
def list_generations(user_id: CurrentUser, limit: int = 20) -> dict:
    limit = max(1, min(limit, 100))
    rows = (
        _jobs_col()
        .find({"user_id": user_id})
        .sort("created_at", -1)
        .limit(limit)
    )
    return {"jobs": [_serialize_job(r) for r in rows]}


@router.get("/generate/{job_id}")
def get_generation(job_id: str, user_id: CurrentUser) -> dict:
    doc = _jobs_col().find_one({"job_id": job_id, "user_id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="job not found")
    return _serialize_job(doc)


@router.post("/generate/{job_id}/cancel")
def cancel_generation(job_id: str, user_id: CurrentUser) -> dict:
    doc = _jobs_col().find_one({"job_id": job_id, "user_id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="job not found")
    if doc.get("status") in ("completed", "failed"):
        return {"cancelled": False, "status": doc.get("status"), "reason": "job already terminal"}
    _jobs_col().update_one(
        {"job_id": job_id},
        {"$set": {"cancel_requested": True, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"cancelled": True, "status": doc.get("status")}
