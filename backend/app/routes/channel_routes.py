"""Channel CRUD API — /channels"""
import logging
from datetime import datetime, timezone
from typing import Annotated, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from utils.middleware.auth_middleware import auth_middleware
from utils.mongodb_service import mongodb_service
from worker.scheduler import sync_channel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/channels", tags=["channels"])

PLATFORMS = {"youtube", "instagram", "facebook", "tiktok", "linkedin"}
POSTING_FREQUENCIES = {"daily", "3x_week", "weekly"}


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
# Request / Response models
# ---------------------------------------------------------------------------

class ChannelCreate(BaseModel):
    name: str
    platform: str
    niche: Optional[str] = None
    posting_frequency: Optional[str] = "weekly"
    auto_post: Optional[bool] = False
    review_window_minutes: Optional[int] = 60


class ChannelUpdate(BaseModel):
    name: Optional[str] = None
    niche: Optional[str] = None
    posting_frequency: Optional[str] = None
    auto_post: Optional[bool] = None
    review_window_minutes: Optional[int] = None
    setup_complete: Optional[bool] = None   # wizard final step


def _to_doc(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


def _col():
    return mongodb_service.get_database()["channels"]


def _qv_col():
    """queued_videos collection."""
    return mongodb_service.get_database()["queued_videos"]


def _notif_col():
    """notifications collection."""
    return mongodb_service.get_database()["notifications"]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/")
def list_channels(user_id: CurrentUser):
    docs = list(_col().find({"user_id": user_id}))
    return [_to_doc(d) for d in docs]


@router.post("/", status_code=201)
def create_channel(body: ChannelCreate, user_id: CurrentUser):
    if body.platform not in PLATFORMS:
        raise HTTPException(status_code=422, detail=f"platform must be one of {sorted(PLATFORMS)}")
    if body.posting_frequency and body.posting_frequency not in POSTING_FREQUENCIES:
        raise HTTPException(status_code=422, detail=f"posting_frequency must be one of {sorted(POSTING_FREQUENCIES)}")

    now = datetime.now(timezone.utc)
    doc = {
        "user_id": user_id,
        "name": body.name,
        "platform": body.platform,
        "niche": body.niche,
        "posting_frequency": body.posting_frequency,
        "auto_post": body.auto_post,
        "review_window_minutes": body.review_window_minutes,
        "created_at": now,
        "updated_at": now,
    }
    result = _col().insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    return doc


@router.put("/{channel_id}")
def update_channel(channel_id: str, body: ChannelUpdate, user_id: CurrentUser):
    try:
        oid = ObjectId(channel_id)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid channel_id")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=422, detail="No fields to update")

    if "posting_frequency" in updates and updates["posting_frequency"] not in POSTING_FREQUENCIES:
        raise HTTPException(status_code=422, detail=f"posting_frequency must be one of {sorted(POSTING_FREQUENCIES)}")

    updates["updated_at"] = datetime.now(timezone.utc)
    existing_doc = _col().find_one({"_id": oid, "user_id": user_id}) or {}
    result = _col().update_one({"_id": oid, "user_id": user_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Channel not found")

    # Sync scheduler with merged state
    effective_auto_post = updates.get("auto_post", existing_doc.get("auto_post", False))
    effective_frequency = updates.get("posting_frequency", existing_doc.get("posting_frequency", "weekly"))
    sync_channel(channel_id, bool(effective_auto_post), str(effective_frequency))
    return {"success": True}


@router.delete("/{channel_id}")
def delete_channel(channel_id: str, user_id: CurrentUser):
    try:
        oid = ObjectId(channel_id)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid channel_id")

    result = _col().delete_one({"_id": oid, "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Channel not found")

    # Also remove any model_config tied to this channel
    db = mongodb_service.get_database()
    db["model_configs"].delete_many({"channel_id": channel_id, "user_id": user_id})

    return {"success": True}


# ---------------------------------------------------------------------------
# Channel video review queue
# ---------------------------------------------------------------------------

@router.get("/{channel_id}/videos")
def list_channel_videos(
    channel_id: str,
    user_id: CurrentUser,
    status: Optional[str] = None,
):
    """
    List queued_videos for a channel.
    Optional ?status=pending_review,expired (comma-separated).
    Only returns videos belonging to the authenticated user's channel.
    """
    try:
        oid = ObjectId(channel_id)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid channel_id")

    # Verify channel ownership
    ch = _col().find_one({"_id": oid, "user_id": user_id})
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")

    query: dict = {"channel_id": channel_id, "user_id": user_id}
    if status:
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        query["status"] = {"$in": statuses}

    docs = list(_qv_col().find(query).sort("created_at", -1).limit(50))
    for d in docs:
        d["id"] = str(d.pop("_id"))
        if "review_deadline" in d and hasattr(d["review_deadline"], "isoformat"):
            d["review_deadline"] = d["review_deadline"].isoformat()
        if "created_at" in d and hasattr(d["created_at"], "isoformat"):
            d["created_at"] = d["created_at"].isoformat()
    return docs


@router.post("/{channel_id}/videos/{video_id}/approve")
def approve_video(channel_id: str, video_id: str, user_id: CurrentUser):
    """
    Approve a queued video — sets status=approved.
    Does NOT post to platform (platform OAuth is a future phase).
    Verifies: channel.user_id == user_id AND video.channel_id == channel_id.
    """
    try:
        c_oid = ObjectId(channel_id)
        v_oid = ObjectId(video_id)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid id")

    ch = _col().find_one({"_id": c_oid, "user_id": user_id})
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")

    video = _qv_col().find_one({"_id": v_oid, "channel_id": channel_id, "user_id": user_id})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    now = datetime.now(timezone.utc)
    result = _qv_col().update_one(
        {"_id": v_oid},
        {"$set": {"status": "approved", "approved_at": now}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Video not found")
    return {"success": True}


@router.post("/{channel_id}/videos/{video_id}/reject")
def reject_video(channel_id: str, video_id: str, user_id: CurrentUser):
    """
    Reject/discard a queued video — sets status=rejected.
    Same ownership checks as approve.
    """
    try:
        c_oid = ObjectId(channel_id)
        v_oid = ObjectId(video_id)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid id")

    ch = _col().find_one({"_id": c_oid, "user_id": user_id})
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")

    video = _qv_col().find_one({"_id": v_oid, "channel_id": channel_id, "user_id": user_id})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    _qv_col().update_one(
        {"_id": v_oid},
        {"$set": {"status": "rejected", "rejected_at": datetime.now(timezone.utc)}},
    )
    return {"success": True}


@router.post("/{channel_id}/accept-disclaimer")
def accept_auto_post_disclaimer(channel_id: str, user_id: CurrentUser):
    """
    Record creator's explicit acceptance of auto-post disclaimer.
    Sets auto_post_disclaimer_accepted=True and auto_post=True on channel.
    """
    try:
        oid = ObjectId(channel_id)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid channel_id")

    ch = _col().find_one({"_id": oid, "user_id": user_id})
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")

    now = datetime.now(timezone.utc)
    _col().update_one(
        {"_id": oid},
        {"$set": {
            "auto_post": True,
            "auto_post_disclaimer_accepted": True,
            "auto_post_disclaimer_accepted_at": now,
            "updated_at": now,
        }},
    )
    # Sync scheduler
    sync_channel(channel_id, auto_post=True, posting_frequency=ch.get("posting_frequency", "weekly"))
    return {"success": True}
