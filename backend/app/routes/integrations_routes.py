"""
Integrations API Routes — social platform credential management and OAuth flows.
"""

import asyncio
import base64
import json
import logging
import os
import re

import requests
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Depends, Header, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from typing import Annotated, Dict, Optional

from utils.integrations_service import integrations_service
from utils.middleware.auth_middleware import auth_middleware
from utils.subscription_service import subscription_service

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))  # backend/.env
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))        # backend/app/.env fallback

logger = logging.getLogger(__name__)

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://socialflow.network")
# BACKEND_URL is the public-facing base URL for OAuth callbacks.
# In production both point to the same domain (FastAPI serves everything).
# In local dev, the callback route lives on the backend (port 8000), not Vite (5173).
BACKEND_URL = os.getenv("BACKEND_URL", FRONTEND_URL)

router = APIRouter(prefix="/api/integrations", tags=["integrations"])

_PHONE_RE = re.compile(r"^\+\d{10,15}$")
_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@gmail\.com$")


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------

def get_current_user(authorization: Annotated[Optional[str], Header()] = None) -> str:
    """Dependency to get current authenticated user."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_info = auth_middleware.verify_token(authorization)
    if not user_info:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user_info["user_id"]


CurrentUser = Annotated[str, Depends(get_current_user)]


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class SaveIntegrationRequest(BaseModel):
    platform: str
    credentials: Dict[str, str]
    is_connected: bool = True


class IntegrationResponse(BaseModel):
    user_id: str
    platform: str
    is_connected: bool
    last_updated: str
    last_tested: Optional[str] = None
    created_at: Optional[str] = None


class ConnectionTestRequest(BaseModel):
    platform: str
    credentials: Dict[str, str]


# ---------------------------------------------------------------------------
# Platform credential testers (sync — called via asyncio.to_thread)
# ---------------------------------------------------------------------------

def _resolve_person_urn(sub: str, fallback: Optional[str]) -> str:
    """Build a LinkedIn Person URN from the ``sub`` claim."""
    if sub.startswith("urn:li:"):
        return sub
    if sub:
        return f"urn:li:person:{sub}"
    return fallback or ""


def test_facebook_credentials(credentials: dict) -> dict:
    """Test Facebook credentials by calling the Graph API."""
    access_token = credentials.get("accessToken")
    page_id = credentials.get("pageId", "").strip()

    logger.info(f"Testing Facebook credentials for page: {page_id or '(auto-detect)'}")

    try:
        response = requests.get(
            "https://graph.facebook.com/v25.0/me/accounts",
            params={"access_token": access_token},
            timeout=10,
        )
    except requests.exceptions.Timeout:
        logger.error("Facebook API timeout")
        return {"success": False, "message": "Facebook API timeout. Please try again.", "is_connected": False}
    except requests.exceptions.RequestException as e:
        logger.error(f"Facebook API error: {e}")
        return {"success": False, "message": f"Facebook API error: {e}", "is_connected": False}

    if response.status_code != 200:
        error_msg = response.json().get("error", {}).get("message", "Invalid access token")
        logger.error(f"Facebook test failed: {error_msg}")
        return {"success": False, "message": f"Facebook credentials invalid: {error_msg}", "is_connected": False}

    pages = response.json().get("data", [])
    if not pages:
        return {
            "success": False,
            "message": "No Facebook Pages found for this token. Make sure your account manages at least one Page.",
            "is_connected": False,
        }

    if page_id:
        target_page = next((p for p in pages if p.get("id") == page_id), None)
        if not target_page:
            return {"success": False, "message": f"Page ID {page_id} not found. Please check your Page ID.", "is_connected": False}
    else:
        target_page = pages[0]

    detected_id = target_page["id"]
    detected_name = target_page.get("name", "Unknown")
    logger.info(f"Facebook page found: {detected_name} ({detected_id})")

    return {
        "success": True,
        "message": f"Facebook connected! Page: {detected_name}",
        "is_connected": True,
        "detected": {"pageId": detected_id},
        "account_info": {"pageName": detected_name, "pageId": detected_id},
        "all_pages": [{"id": p.get("id"), "name": p.get("name")} for p in pages],
    }


def _detect_instagram_account_id(access_token: str) -> str:
    """Auto-detect Instagram Business Account ID via Facebook Pages."""
    pages_resp = requests.get(
        "https://graph.facebook.com/v25.0/me/accounts",
        params={"access_token": access_token},
        timeout=10,
    )
    if pages_resp.status_code != 200:
        error_msg = pages_resp.json().get("error", {}).get("message", "Invalid access token")
        raise ValueError(f"Token error: {error_msg}")

    for page in pages_resp.json().get("data", []):
        ig_resp = requests.get(
            f"https://graph.facebook.com/v25.0/{page['id']}",
            params={"fields": "instagram_business_account", "access_token": access_token},
            timeout=10,
        )
        if ig_resp.status_code == 200:
            ig_id = ig_resp.json().get("instagram_business_account", {}).get("id")
            if ig_id:
                logger.info(f"Auto-detected Instagram account ID: {ig_id} from page {page.get('name')}")
                return ig_id

    raise ValueError(
        "No Instagram Business Account found. This usually means: "
        "(1) You entered an Instagram token instead of a Facebook User Access Token — "
        "use the Facebook Graph API Explorer to generate a token starting with 'EAA', "
        "(2) Your token is missing 'pages_show_list' or 'instagram_basic' permissions, or "
        "(3) Your Instagram account is not a Business/Creator account linked to a Facebook Page."
    )


def _classify_instagram_error(error_message: str) -> str:
    """Map an Instagram API error to a user-friendly message."""
    msg_lower = error_message.lower()
    if "access token" in msg_lower or "invalid" in msg_lower:
        return "Invalid access token. Please generate a new long-lived access token from Facebook Developer Console."
    if "permissions" in msg_lower:
        return "Insufficient permissions. Make sure your token has 'instagram_content_publish' permission."
    if "account" in msg_lower:
        return "Invalid Instagram Business Account ID. Please verify the ID in Facebook Business Manager."
    return f"Instagram API error: {error_message}"


def test_instagram_credentials(credentials: dict) -> dict:
    """Test Instagram Graph API credentials."""
    access_token = credentials.get("accessToken")
    instagram_account_id = credentials.get("instagramAccountId", "").strip()

    logger.info(f"Testing Instagram credentials for account: {instagram_account_id or '(auto-detect)'}")

    if not access_token:
        return {"success": False, "message": "Missing access token", "is_connected": False}

    try:
        if not instagram_account_id:
            instagram_account_id = _detect_instagram_account_id(access_token)

        response = requests.get(
            f"https://graph.facebook.com/v25.0/{instagram_account_id}",
            params={"fields": "id,username,name,followers_count,media_count", "access_token": access_token},
            timeout=10,
        )
    except ValueError as e:
        return {"success": False, "message": str(e), "is_connected": False}
    except requests.exceptions.Timeout:
        logger.error("Instagram API timeout")
        return {"success": False, "message": "Instagram API request timed out. Please try again.", "is_connected": False}
    except Exception as e:
        logger.error(f"Instagram test error: {e}")
        return {"success": False, "message": f"Instagram test failed: {e}", "is_connected": False}

    if response.status_code == 200:
        data = response.json()
        username = data.get("username", "Unknown")
        name = data.get("name", username)
        followers = data.get("followers_count", 0)
        media_count = data.get("media_count", 0)
        logger.info(f"Instagram test successful! Account: @{username}")
        return {
            "success": True,
            "message": f"Instagram connected! @{username} · {followers} followers · {media_count} posts",
            "is_connected": True,
            "detected": {"instagramAccountId": instagram_account_id},
            "account_info": {"username": username, "name": name, "followers": str(followers)},
        }

    error_data = response.json()
    error_message = error_data.get("error", {}).get("message", "Unknown error")
    error_code = str(error_data.get("error", {}).get("code", "N/A"))
    logger.error(f"Instagram test failed: {error_message} (Code: {error_code})")
    return {
        "success": False,
        "message": _classify_instagram_error(error_message),
        "is_connected": False,
        "error_code": error_code,
    }


def _linkedin_userinfo(access_token: str, person_urn_fallback: Optional[str]) -> Optional[dict]:
    """Try the LinkedIn /v2/userinfo endpoint; return result dict or None."""
    response = requests.get(
        "https://api.linkedin.com/v2/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    if response.status_code != 200:
        return None
    data = response.json()
    sub = data.get("sub", "")
    urn = _resolve_person_urn(sub, person_urn_fallback)
    full_name = data.get("name") or data.get("email") or "LinkedIn User"
    logger.info(f"LinkedIn credentials valid via userinfo! User: {full_name}, URN: {urn}")
    return {
        "success": True,
        "message": f"LinkedIn connected! {full_name}",
        "is_connected": True,
        "detected": {"personUrn": urn} if urn else {},
        "account_info": {"name": full_name, "email": data.get("email", "")},
    }


def _linkedin_me(access_token: str, person_urn_fallback: Optional[str]) -> Optional[dict]:
    """Try the LinkedIn /v2/me endpoint; return result dict or None."""
    response = requests.get(
        "https://api.linkedin.com/v2/me",
        headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
        timeout=10,
    )
    if response.status_code != 200:
        return None
    data = response.json()
    first = data.get("localizedFirstName", "")
    last = data.get("localizedLastName", "")
    full_name = f"{first} {last}".strip() or "LinkedIn User"
    member_id = data.get("id", "")
    urn = person_urn_fallback or (f"urn:li:person:{member_id}" if member_id else "")
    logger.info(f"LinkedIn credentials valid via /v2/me! User: {full_name}, URN: {urn}")
    return {
        "success": True,
        "message": f"LinkedIn connected! {full_name}",
        "is_connected": True,
        "detected": {"personUrn": urn} if urn else {},
        "account_info": {"name": full_name},
    }


def test_linkedin_credentials(credentials: dict) -> dict:
    """Test LinkedIn credentials by calling the API."""
    access_token = credentials.get("accessToken")
    person_urn = credentials.get("personUrn")

    logger.info(f"Testing LinkedIn credentials for URN: {person_urn}")

    try:
        result = _linkedin_userinfo(access_token, person_urn)
        if result:
            return result

        logger.info("userinfo endpoint failed, trying /v2/me...")
        result = _linkedin_me(access_token, person_urn)
        if result:
            return result

        # Both endpoints failed — inspect the userinfo response for permissions error
        fallback_resp = requests.get(
            "https://api.linkedin.com/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        error_data = fallback_resp.json() if fallback_resp.content else {}
        error_msg = error_data.get("message", "Invalid access token or insufficient permissions")

        if "permissions" in error_msg.lower() or "not enough" in error_msg.lower():
            logger.warning(f"LinkedIn permissions issue: {error_msg}")
            return {
                "success": True,
                "message": "LinkedIn credentials saved. Note: Limited API access - ensure your token has 'w_member_social' permission for posting.",
                "is_connected": True,
                "warning": "Limited permissions detected",
            }

        logger.error(f"LinkedIn test failed: {error_msg}")
        return {"success": False, "message": f"LinkedIn credentials invalid: {error_msg}", "is_connected": False}

    except requests.exceptions.Timeout:
        logger.error("LinkedIn API timeout")
        return {"success": False, "message": "LinkedIn API timeout. Please try again.", "is_connected": False}
    except requests.exceptions.RequestException as e:
        logger.error(f"LinkedIn API error: {e}")
        return {"success": False, "message": f"LinkedIn API error: {e}", "is_connected": False}
    except Exception as e:
        logger.error(f"LinkedIn test error: {e}")
        return {"success": False, "message": f"Error testing LinkedIn credentials: {e}", "is_connected": False}


def test_youtube_credentials(credentials: dict) -> dict:
    """Validate YouTube Client ID and Secret are present."""
    client_id = credentials.get("clientId")
    client_secret = credentials.get("clientSecret")

    logger.info("Testing YouTube credentials")

    if client_id and client_secret:
        logger.info("YouTube credentials validated")
        return {
            "success": True,
            "message": "YouTube credentials saved! You'll be asked to authorize when you first post a video.",
            "is_connected": True,
            "requires_oauth": True,
        }
    return {"success": False, "message": "Client ID and Client Secret are required", "is_connected": False}



def test_gmail_credentials(credentials: dict) -> dict:
    """Validate Gmail email and app password."""
    email = credentials.get("email")
    app_password = credentials.get("appPassword")

    logger.info(f"Testing Gmail credentials for: {email}")

    if not email or not app_password:
        return {"success": False, "message": "Email and App Password are required", "is_connected": False}

    if not _EMAIL_RE.match(email):
        return {
            "success": False,
            "message": "Invalid email format. Must be a Gmail address (e.g., your.email@gmail.com)",
            "is_connected": False,
        }

    if len(app_password.replace(" ", "")) == 16:
        logger.info("Gmail credentials validated")
        return {"success": True, "message": f"Gmail credentials saved! Email: {email}", "is_connected": True}

    return {
        "success": False,
        "message": "Invalid App Password format. Should be 16 characters (e.g., xxxx xxxx xxxx xxxx)",
        "is_connected": False,
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

_R_401 = {401: {"description": "Authentication required"}}
_R_403 = {403: {"description": "Platform limit exceeded"}}
_R_404 = {404: {"description": "Integration not found"}}
_R_500 = {500: {"description": "Internal server error"}}

_REQUIRED_FIELDS: dict = {
    "facebook": ["accessToken"],
    "instagram": ["accessToken"],
    "linkedin": ["accessToken"],
    "youtube": ["clientId", "clientSecret"],
    "gmail": ["email", "appPassword"],
    "twitter": ["apiKey", "apiSecret", "accessToken", "accessTokenSecret"],
}

_TESTERS = {
    "facebook": test_facebook_credentials,
    "instagram": test_instagram_credentials,
    "linkedin": test_linkedin_credentials,
    "youtube": test_youtube_credentials,
    "gmail": test_gmail_credentials,
}


@router.post("/save", responses={
    401: {"description": "Authentication required"},
    403: {"description": "Platform limit exceeded"},
    500: {"description": "Internal server error"},
})
async def save_integration(request: SaveIntegrationRequest, user_id: CurrentUser):
    """Save or update integration credentials for the authenticated user."""
    try:
        logger.info(f"Saving integration for user {user_id}: {request.platform}")

        existing_integrations = integrations_service.get_all_integrations(user_id, decrypt=False)
        all_existing_platforms = [i.get("platform") for i in existing_integrations]
        is_new_connection = request.platform not in all_existing_platforms and request.is_connected

        if is_new_connection:
            limit_check = subscription_service.check_usage_limit(user_id, "platforms")
            if not limit_check["can_proceed"]:
                logger.warning(f"User {user_id} exceeded platform limit: {limit_check['current_usage']}/{limit_check['limit']}")
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "limit_exceeded",
                        "message": f"Free plan allows only {limit_check['limit']} platform connection",
                        "current_usage": limit_check["current_usage"],
                        "limit": limit_check["limit"],
                        "plan": limit_check["plan"],
                        "upgrade_message": "Upgrade to Professional to connect unlimited platforms!",
                        "upgrade_url": "/subscription",
                    },
                )

        # Merge with existing credentials so OAuth tokens (e.g. YouTube refreshToken)
        # are not wiped when the user re-saves client credentials from the form.
        merged_credentials = request.credentials.copy()
        existing_integration = integrations_service.get_integration(user_id, request.platform, decrypt=True)
        if existing_integration and existing_integration.get("credentials"):
            for key, value in existing_integration["credentials"].items():
                if key not in merged_credentials or merged_credentials[key] is None:
                    merged_credentials[key] = value

        result = integrations_service.save_integration(
            user_id=user_id,
            platform=request.platform,
            credentials=merged_credentials,
            is_connected=request.is_connected,
        )

        if is_new_connection:
            subscription_service.increment_usage(user_id, "platforms", 1)
            logger.info(f"Platform connected and usage tracked for user {user_id}")

        updated_limit = subscription_service.check_usage_limit(user_id, "platforms")

        return {
            "success": True,
            "message": f"{request.platform} integration saved successfully",
            "integration": {
                "platform": result.get("platform"),
                "is_connected": result.get("is_connected"),
                "last_updated": result.get("last_updated").isoformat() if result.get("last_updated") else None,
            },
            "usage": {
                "platforms_connected": updated_limit["current_usage"],
                "platforms_limit": updated_limit["limit"],
                "platforms_remaining": updated_limit["remaining"],
                "plan": updated_limit["plan"],
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving integration: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list", responses={
    401: {"description": "Authentication required"},
    500: {"description": "Internal server error"},
})
async def get_integrations(user_id: CurrentUser):
    """Get all integrations for the authenticated user."""
    try:
        logger.info(f"Fetching integrations for user {user_id}")
        integrations = integrations_service.get_all_integrations(user_id=user_id, decrypt=False)

        formatted = [
            {
                "platform": i.get("platform"),
                "is_connected": i.get("is_connected", False),
                "last_updated": i.get("last_updated").isoformat() if i.get("last_updated") else None,
                "last_tested": i.get("last_tested").isoformat() if i.get("last_tested") else None,
                "last_error": i.get("last_error"),
            }
            for i in integrations
        ]

        return {"success": True, "integrations": formatted}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching integrations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{platform}", responses={
    401: {"description": "Authentication required"},
    500: {"description": "Internal server error"},
})
async def get_integration(platform: str, user_id: CurrentUser):
    """Get a specific integration for the authenticated user."""
    try:
        logger.info(f"Fetching integration for user {user_id}: {platform}")
        integration = integrations_service.get_integration(user_id=user_id, platform=platform, decrypt=False)

        if not integration:
            return {"success": True, "integration": None, "message": f"No integration found for {platform}"}

        return {
            "success": True,
            "integration": {
                "platform": integration.get("platform"),
                "is_connected": integration.get("is_connected", False),
                "last_updated": integration.get("last_updated").isoformat() if integration.get("last_updated") else None,
                "last_tested": integration.get("last_tested").isoformat() if integration.get("last_tested") else None,
                "last_error": integration.get("last_error"),
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching integration: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{platform}", responses={
    401: {"description": "Authentication required"},
    404: {"description": "Integration not found"},
    500: {"description": "Internal server error"},
})
async def delete_integration(platform: str, user_id: CurrentUser):
    """Delete an integration for the authenticated user."""
    try:
        logger.info(f"Deleting integration for user {user_id}: {platform}")
        success = integrations_service.delete_integration(user_id=user_id, platform=platform)

        if not success:
            raise HTTPException(status_code=404, detail=f"Integration not found for {platform}")

        return {"success": True, "message": f"{platform} integration deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting integration: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/test", responses={
    400: {"description": "Missing credentials"},
    401: {"description": "Authentication required"},
    500: {"description": "Internal server error"},
})
async def test_connection(request: ConnectionTestRequest, user_id: CurrentUser):
    """Test platform credentials by validating them against the platform API."""
    try:
        logger.info(f"Testing connection for user {user_id}: {request.platform}")

        if not request.credentials:
            raise HTTPException(status_code=400, detail="No credentials provided")

        missing = [f for f in _REQUIRED_FIELDS.get(request.platform, []) if not request.credentials.get(f)]
        if missing:
            return {"success": False, "message": f"Missing required fields: {', '.join(missing)}", "is_connected": False}

        tester = _TESTERS.get(request.platform)
        if not tester:
            return {"success": True, "message": f"{request.platform.title()} credentials saved successfully!", "is_connected": True}

        result = await asyncio.to_thread(tester, request.credentials)

        # LinkedIn leniency: treat permission errors as connected
        if request.platform == "linkedin" and not result.get("success") and "permissions" in result.get("message", "").lower():
            return {
                "success": True,
                "message": "LinkedIn credentials saved. Limited permissions detected - ensure 'w_member_social' scope for posting.",
                "is_connected": True,
                "warning": result.get("message"),
            }

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error testing connection: {e}")
        return {"success": False, "message": str(e), "is_connected": False}


# ---------------------------------------------------------------------------
# YouTube OAuth2 flow
# ---------------------------------------------------------------------------

def _detect_frontend_origin(request: Request) -> str:
    """Extract the frontend base URL from the request origin or referer header."""
    origin = request.headers.get("origin") or request.headers.get("referer", "")
    if origin and origin.startswith("http"):
        base = origin.split("//")[1].split("/")[0]
        protocol = "https" if origin.startswith("https") else "http"
        return f"{protocol}://{base}"
    return FRONTEND_URL


def _build_youtube_client_config(client_id: str, client_secret: str, redirect_uri: str) -> dict:
    return {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri],
        }
    }


@router.get(
    "/youtube/oauth/authorize",
    responses={
        400: {"description": "YouTube not configured"},
        401: {"description": "Authentication required"},
        500: {"description": "Internal server error"},
    },
)
async def youtube_oauth_authorize(request: Request, user_id: CurrentUser):
    """Initiate YouTube OAuth2 flow — redirects user to Google authorization page."""
    try:
        from google_auth_oauthlib.flow import Flow

        logger.info(f"Starting YouTube OAuth for user: {user_id}")

        integration = integrations_service.get_integration(user_id, "youtube", decrypt=True)
        if not integration or not integration.get("credentials"):
            raise HTTPException(status_code=400, detail="Please configure YouTube Client ID and Secret in Integrations first")

        creds = integration["credentials"]
        client_id = creds.get("clientId")
        client_secret = creds.get("clientSecret")
        if not client_id or not client_secret:
            raise HTTPException(status_code=400, detail="YouTube Client ID and Secret not configured")

        redirect_uri = f"{BACKEND_URL}/api/integrations/youtube/oauth/callback"
        logger.info(f"YouTube OAuth redirect_uri: {redirect_uri}")
        flow = Flow.from_client_config(
            _build_youtube_client_config(client_id, client_secret, redirect_uri),
            scopes=["https://www.googleapis.com/auth/youtube.upload"],
            redirect_uri=redirect_uri,
        )

        authorization_url, _ = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
        )

        # Store code_verifier (PKCE) alongside user_id so the callback can use it
        state_data = json.dumps({"user_id": user_id, "code_verifier": flow.code_verifier or ""})
        state = base64.urlsafe_b64encode(state_data.encode()).decode()

        # Patch the state into the already-built authorization_url
        from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
        parsed = urlparse(authorization_url)
        params = parse_qs(parsed.query, keep_blank_values=True)
        params["state"] = [state]
        authorization_url = urlunparse(parsed._replace(query=urlencode(params, doseq=True)))

        return {"success": True, "authorization_url": authorization_url, "state": state}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OAuth initiation error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to initiate OAuth: {e}")


@router.get(
    "/youtube/oauth/callback",
    responses={
        400: {"description": "Invalid state or missing integration"},
        500: {"description": "Internal server error"},
    },
)
async def youtube_oauth_callback(code: str, state: str, request: Request):
    """OAuth2 callback — exchange authorization code for tokens and store refresh token."""
    try:
        from google_auth_oauthlib.flow import Flow

        try:
            state_obj = json.loads(base64.urlsafe_b64decode(state.encode()).decode())
            user_id = state_obj.get("user_id")
            code_verifier = state_obj.get("code_verifier") or None
        except Exception as e:
            logger.error(f"Failed to decode state: {e}")
            raise HTTPException(status_code=400, detail="Invalid state parameter")

        integration = integrations_service.get_integration(user_id, "youtube", decrypt=True)
        if not integration or not integration.get("credentials"):
            raise HTTPException(status_code=400, detail="YouTube integration not found")

        creds_stored = integration["credentials"]
        client_id = creds_stored.get("clientId")
        client_secret = creds_stored.get("clientSecret")

        redirect_uri = f"{BACKEND_URL}/api/integrations/youtube/oauth/callback"
        flow = Flow.from_client_config(
            _build_youtube_client_config(client_id, client_secret, redirect_uri),
            scopes=["https://www.googleapis.com/auth/youtube.upload"],
            redirect_uri=redirect_uri,
            state=state,
        )

        import os as _os
        _os.environ["OAUTHLIB_RELAX_TOKEN_SCOPE"] = "1"
        flow.fetch_token(code=code, code_verifier=code_verifier)
        refresh_token = flow.credentials.refresh_token

        if not refresh_token:
            raise HTTPException(status_code=400, detail="Failed to get refresh token. Please try again.")

        creds_stored["refreshToken"] = refresh_token
        integrations_service.save_integration(
            user_id=user_id, platform="youtube", credentials=creds_stored, is_connected=True
        )
        logger.info(f"YouTube refresh token saved for user {user_id}")
        return RedirectResponse(url=f"{FRONTEND_URL}/integrations?youtube_auth=success", status_code=302)

    except HTTPException:
        raise
    except Exception as e:
        print(f"  CALLBACK EXCEPTION: {e}")
        logger.error(f"OAuth callback error: {e}")
        return RedirectResponse(
            url=f"{FRONTEND_URL}/integrations?youtube_auth=error&message={e}",
            status_code=302,
        )
