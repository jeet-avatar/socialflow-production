"""
User identity routes — sender identity for AI outreach personalisation.
"""
from fastapi import APIRouter, HTTPException, Header, Request, Depends
from typing import Annotated, Optional
import logging
from datetime import datetime, timezone
from utils.middleware.auth_middleware import auth_middleware
from utils.user_service import user_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/user", tags=["user"])

_NO_AUTH = "No authorization token provided"
_TOKEN_INVALID = "Invalid or expired token"


def get_current_user(authorization: Annotated[Optional[str], Header()] = None) -> dict:
    """Dependency to get current authenticated user."""
    if not authorization:
        raise HTTPException(status_code=401, detail=_NO_AUTH)
    user_info = auth_middleware.verify_token(authorization)
    if not user_info:
        raise HTTPException(status_code=401, detail=_TOKEN_INVALID)
    return user_info


CurrentUser = Annotated[dict, Depends(get_current_user)]


@router.get(
    "/sender-identity",
    responses={
        401: {"description": _NO_AUTH},
        500: {"description": "Internal server error"},
    },
)
async def get_sender_identity(user_info: CurrentUser):
    """Return the stored sender identity for the current user."""
    try:
        user = user_service.users_collection.find_one(
            {"supabase_user_id": user_info["user_id"]},
            {"sender_identity": 1, "_id": 0},
        )
        identity = user.get("sender_identity", {}) if user else {}
        return {"success": True, "identity": identity}
    except Exception as e:
        logger.error(f"get_sender_identity error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put(
    "/sender-identity",
    responses={
        401: {"description": _NO_AUTH},
        500: {"description": "Internal server error"},
    },
)
async def update_sender_identity(request: Request, user_info: CurrentUser):
    """Persist the sender identity for the current user."""
    try:
        body = await request.json()
        user_service.users_collection.update_one(
            {"supabase_user_id": user_info["user_id"]},
            {
                "$set": {
                    "sender_identity": body,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
        return {"success": True, "message": "Identity saved"}
    except Exception as e:
        logger.error(f"update_sender_identity error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
