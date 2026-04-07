"""
Authentication Routes for User Management
Handles user login sync with MongoDB
"""

from fastapi import APIRouter, Depends, HTTPException, Header, Request
from pydantic import BaseModel
from typing import Annotated, Optional
import logging
import json
from datetime import datetime, timezone
from utils.user_service import user_service
from utils.middleware.auth_middleware import auth_middleware
from utils.utils import client as openai_client
from utils.notifications import (
    send_login_notification,
    send_password_reset_notification,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["authentication"])

# ---------------------------------------------------------------------------
# String constants (S1192)
# ---------------------------------------------------------------------------
_NO_AUTH = "No authorization token provided"
_TOKEN_INVALID = "Invalid or expired token"
_USER_NOT_FOUND = "User not found"

_PROFILE_FIELD_LABELS = [
    ("full_name", "Name"),
    ("job_title", "Job Title"),
    ("personal_bio", "Bio"),
    ("skills", "Skills & Expertise"),
    ("value_proposition", "Value Proposition"),
    ("company_name", "Company"),
    ("company_industry", "Industry"),
    ("company_description", "Company Description"),
    ("company_size", "Company Size"),
    ("company_tagline", "Tagline"),
    ("company_headquarters", "HQ"),
    ("company_website", "Website"),
    ("target_audience", "Target Audience"),
]

_PROFILE_SUMMARY_SYSTEM_PROMPT = """You are an expert B2B sales and personal branding strategist.
Given a user's professional profile, produce a concise, insightful summary structured in 4 sections.
Return ONLY valid JSON with exactly these keys:
- professional_identity: 2-3 sentences describing who this person is professionally, their strengths and positioning
- company_positioning: 2-3 sentences about the company's market position, what makes it stand out, and its core offering
- outreach_angles: 3 bullet points (as an array of strings) — specific, compelling angles this person can use when reaching out to prospects
- ideal_customer_profile: 2-3 sentences describing their ideal customer — who they are, their pain points, and why they need this person's solution
Keep each section punchy, specific, and actionable. Avoid generic filler."""


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class UserLoginRequest(BaseModel):
    """Request model for user login sync"""
    supabase_user_id: str
    email: str
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    provider: Optional[str] = "email"
    email_confirmed_at: Optional[str] = None
    last_sign_in_at: Optional[str] = None
    user_metadata: Optional[dict] = {}
    app_metadata: Optional[dict] = {}

class UserResponse(BaseModel):
    """Response model for user data"""
    success: bool
    message: str
    user: Optional[dict] = None
    stats: Optional[dict] = None


# ---------------------------------------------------------------------------
# Auth dependency (S8410)
# ---------------------------------------------------------------------------

def get_current_user(authorization: Annotated[Optional[str], Header()] = None) -> dict:
    """Dependency to get current authenticated user."""
    if not authorization:
        raise HTTPException(status_code=401, detail=_NO_AUTH)
    user_info = auth_middleware.verify_token(authorization)
    if not user_info:
        raise HTTPException(status_code=401, detail=_TOKEN_INVALID)
    return user_info


CurrentUser = Annotated[dict, Depends(get_current_user)]


# ---------------------------------------------------------------------------
# Helper (S3776 — extracted to reduce cognitive complexity)
# ---------------------------------------------------------------------------

def _build_profile_context(profile_data: dict) -> list:
    """Build context parts list from profile data fields."""
    return [
        f"{label}: {profile_data[field]}"
        for field, label in _PROFILE_FIELD_LABELS
        if profile_data.get(field)
    ]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post(
    "/sync-user",
    response_model=UserResponse,
    responses={500: {"description": "User sync failed"}},
)
async def sync_user_login(user_data: UserLoginRequest):
    """Sync user login with MongoDB. Called from frontend after successful Auth0 authentication."""
    try:
        logger.info(f" Syncing user login: {user_data.email}")

        user_dict = {
            "id": user_data.supabase_user_id,
            "email": user_data.email,
            "full_name": user_data.full_name,
            "avatar_url": user_data.avatar_url,
            "email_confirmed_at": user_data.email_confirmed_at,
            "last_sign_in_at": user_data.last_sign_in_at,
            "user_metadata": user_data.user_metadata or {},
            "app_metadata": user_data.app_metadata or {"provider": user_data.provider}
        }

        user = user_service.create_or_update_user(user_dict)
        stats = user_service.get_user_stats(user_data.supabase_user_id)

        logger.info(f" User sync successful: {user_data.email}")
        return UserResponse(
            success=True,
            message="User synchronized successfully",
            user=user,
            stats=stats
        )

    except Exception as e:
        logger.error(f"ERROR: User sync failed: {e}")
        raise HTTPException(status_code=500, detail=f"User sync failed: {str(e)}")


@router.get(
    "/user-profile",
    response_model=UserResponse,
    responses={
        401: {"description": _NO_AUTH},
        404: {"description": _USER_NOT_FOUND},
        500: {"description": "Internal server error"},
    },
)
async def get_user_profile(user_info: CurrentUser):
    """Get current user profile and statistics. Requires authentication token."""
    try:
        user = user_service.get_user_by_supabase_id(user_info['user_id'])
        if not user:
            raise HTTPException(status_code=404, detail=_USER_NOT_FOUND)

        stats = user_service.get_user_stats(user_info['user_id'])
        return UserResponse(
            success=True,
            message="User profile retrieved successfully",
            user=user,
            stats=stats
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ERROR: Error getting user profile: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get user profile: {str(e)}")


@router.put(
    "/user-profile",
    responses={
        401: {"description": _NO_AUTH},
        404: {"description": _USER_NOT_FOUND},
        500: {"description": "Internal server error"},
    },
)
async def update_user_profile(request: Request, user_info: CurrentUser):
    """Update user profile (full_name, company_name, etc.)"""
    try:
        body = await request.json()

        update_fields = {"updated_at": datetime.now(timezone.utc)}
        for field in ('full_name', 'company_name', 'timezone', 'avatar_url'):
            if field in body:
                update_fields[field] = body[field]
        if 'sender_identity' in body:
            update_fields['sender_identity'] = body['sender_identity']
        if 'ai_summary' in body:
            update_fields['ai_summary'] = body['ai_summary']

        user_id = user_info['user_id']
        email = user_info.get('email')

        result = user_service.users_collection.update_one(
            {"supabase_user_id": user_id},
            {"$set": update_fields}
        )

        if result.matched_count == 0 and email:
            existing = user_service.users_collection.find_one({"email": email})
            if existing:
                logger.info(f"Migrating supabase_user_id to Auth0 sub for {email}")
                update_fields["supabase_user_id"] = user_id
                result = user_service.users_collection.update_one(
                    {"email": email},
                    {"$set": update_fields}
                )

        if result.matched_count > 0:
            logger.info(f"✅ Updated profile for user: {email}")
            return {"success": True, "message": "Profile updated successfully"}
        raise HTTPException(status_code=404, detail=_USER_NOT_FOUND)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ERROR: Error updating profile: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update profile: {str(e)}")


@router.put(
    "/user-subscription",
    responses={
        401: {"description": _NO_AUTH},
        404: {"description": _USER_NOT_FOUND},
        500: {"description": "Internal server error"},
    },
)
async def update_user_subscription(plan: str, status: str, user_info: CurrentUser):
    """Update user subscription plan and status."""
    try:
        success = user_service.update_user_subscription(user_info['user_id'], plan, status)
        if success:
            return {"success": True, "message": "Subscription updated successfully"}
        raise HTTPException(status_code=404, detail=_USER_NOT_FOUND)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ERROR: Error updating subscription: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update subscription: {str(e)}")


@router.delete(
    "/user-account",
    responses={
        401: {"description": _NO_AUTH},
        404: {"description": _USER_NOT_FOUND},
        500: {"description": "Internal server error"},
    },
)
async def delete_user_account(user_info: CurrentUser):
    """Delete user account and all associated data."""
    try:
        success = user_service.delete_user(user_info['user_id'])
        if success:
            return {"success": True, "message": "User account deleted successfully"}
        raise HTTPException(status_code=404, detail=_USER_NOT_FOUND)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ERROR: Error deleting user account: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete user account: {str(e)}")


@router.post(
    "/profile-summary",
    responses={
        401: {"description": _NO_AUTH},
        400: {"description": "Profile data is empty"},
        500: {"description": "Internal server error"},
    },
)
async def generate_profile_summary(request: Request, user_info: CurrentUser):
    """
    Generate an AI-powered summary of the user's professional profile.
    Returns structured insights: identity, company positioning, outreach angles, ICP.
    """
    try:
        body = await request.json()
        profile_data = body.get("profile", {})

        context_parts = _build_profile_context(profile_data)
        if not context_parts:
            raise HTTPException(status_code=400, detail="Profile data is empty. Please fill in your profile first.")

        context = "\n".join(context_parts)

        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": _PROFILE_SUMMARY_SYSTEM_PROMPT},
                {"role": "user", "content": f"Here is my profile:\n\n{context}"}
            ],
            response_format={"type": "json_object"},
            max_tokens=800,
        )

        content = response.choices[0].message.content.strip()  # type: ignore
        result = json.loads(content)

        logger.info(f"✅ Profile summary generated for: {user_info.get('email')}")
        return {"success": True, "summary": result}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ERROR: Failed to generate profile summary: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate profile summary: {str(e)}")


# ---------------------------------------------------------------------------
# Notification endpoints
# ---------------------------------------------------------------------------

class NotifyLoginRequest(BaseModel):
    email: str
    name: Optional[str] = None

class PasswordResetRequest(BaseModel):
    email: str
    name: Optional[str] = None


@router.post("/notify-login", tags=["notifications"])
async def notify_login(request: NotifyLoginRequest):
    """Send a sign-in notification email to the user. Called once per session from the frontend."""
    try:
        result = send_login_notification(email=request.email, name=request.name or "")
        if not result.get("success"):
            logger.warning(f"Login notification failed for {request.email}: {result.get('error')}")
        return {"success": True}
    except Exception as e:
        logger.error(f"notify_login error: {e}")
        return {"success": False}


@router.post("/notify-password-reset", tags=["notifications"])
async def notify_password_reset(request: PasswordResetRequest):
    """Send a password-reset security notice to the user. Called when the user triggers a reset."""
    try:
        result = send_password_reset_notification(email=request.email, name=request.name or "")
        if not result.get("success"):
            logger.warning(f"Password reset notification failed for {request.email}: {result.get('error')}")
        return {"success": True}
    except Exception as e:
        logger.error(f"notify_password_reset error: {e}")
        return {"success": False}
