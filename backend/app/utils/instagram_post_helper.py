import logging
"""
Instagram Posting Helper (via Facebook Graph API)
"""
import os
import time
import requests
from typing import Optional, Tuple
from dotenv import load_dotenv

from utils.integrations_service import integrations_service
logger = logging.getLogger(__name__)

load_dotenv()

GRAPH_API = "https://graph.facebook.com/v24.0"


def _resolve_ig_legacy_credentials(user_id: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """
    Return (access_token, account_id).

    When user_id is provided, credentials are read from the integrations service.
    If the integration is not connected, a RuntimeError is raised so the caller
    can surface a clear error message without nesting.
    Falls back to environment variables when user_id is None.
    """
    if user_id:
        integration = integrations_service.get_integration(user_id, "instagram", decrypt=True)
        if integration and integration.get("is_connected"):
            credentials = integration.get("credentials", {})
            access_token = credentials.get("accessToken")
            account_id = credentials.get("accountId")
            logger.debug(f"✅ Using Instagram credentials from integrations for user: {user_id}")
            return access_token, account_id
        raise RuntimeError("Instagram integration not configured")

    access_token = os.getenv("INSTAGRAM_ACCESS_TOKEN", "")
    account_id = os.getenv("INSTAGRAM_ACCOUNT_ID", "")
    return access_token, account_id


def _poll_container_status(
    creation_id: str,
    access_token: str,
    max_attempts: int = 30,
) -> bool:
    """
    Poll the container status until the video is FINISHED or the timeout is reached.

    Returns True when status_code is FINISHED.
    Returns False when max_attempts is exhausted without FINISHED.
    Raises RuntimeError when the status_code is ERROR.
    """
    status_url = f"{GRAPH_API}/{creation_id}"
    status_params = {
        "fields": "status_code",
        "access_token": access_token,
    }

    for _ in range(max_attempts):
        status_response = requests.get(status_url, params=status_params)

        if status_response.status_code == 200:
            status_data = status_response.json()
            status_code = status_data.get("status_code")

            if status_code == "FINISHED":
                logger.debug("✅ Video processing complete!")
                return True

            if status_code == "ERROR":
                raise RuntimeError("Video processing failed on Instagram's servers")

            logger.debug(f"   Processing... (status: {status_code})")

        time.sleep(2)

    return False


def post_video_to_instagram(video_url: str, caption: str, user_id: str = None) -> dict:
    """
    Post a video to Instagram as a Reel

    Args:
        video_url: Public URL to the video (must be accessible)
        caption: Post caption/description
        user_id: Optional user ID for fetching credentials from integrations

    Returns:
        dict with success status and details
    """
    try:
        logger.debug("📸 Starting Instagram Reel upload...")

        # Resolve credentials
        try:
            ACCESS_TOKEN, INSTAGRAM_ACCOUNT_ID = _resolve_ig_legacy_credentials(user_id)
        except RuntimeError as cred_error:
            return {
                "success": False,
                "error": str(cred_error),
                "hint": "Please configure Instagram integration in the Integrations tab",
            }

        if not ACCESS_TOKEN:
            return {
                "success": False,
                "error": "Instagram Access Token not configured",
                "hint": (
                    "Please configure Instagram integration in the Integrations tab "
                    "or set INSTAGRAM_ACCESS_TOKEN in .env"
                ),
            }

        if not INSTAGRAM_ACCOUNT_ID:
            return {
                "success": False,
                "error": "Instagram Account ID not configured",
                "hint": "Please configure Instagram integration in the Integrations tab",
            }

        # Step 1: Create media container
        logger.debug("📝 Step 1: Creating media container...")

        container_url = f"{GRAPH_API}/{INSTAGRAM_ACCOUNT_ID}/media"
        container_params = {
            "media_type": "REELS",
            "video_url": video_url,
            "caption": caption,
            "access_token": ACCESS_TOKEN,
        }

        container_response = requests.post(container_url, params=container_params)

        if container_response.status_code != 200:
            error_data = container_response.json()
            error_msg = error_data.get("error", {}).get("message", container_response.text)
            return {
                "success": False,
                "error": f"Failed to create media container: {error_msg}",
                "hint": (
                    "Make sure video URL is publicly accessible and Instagram account "
                    "is connected to Facebook"
                ),
            }

        container_data = container_response.json()
        creation_id = container_data.get("id")
        logger.debug(f"✅ Media container created - ID: {creation_id}")

        # Step 2: Wait for video processing
        logger.debug("⏳ Step 2: Waiting for video processing...")

        try:
            finished = _poll_container_status(creation_id, ACCESS_TOKEN)
        except RuntimeError as processing_error:
            return {
                "success": False,
                "error": str(processing_error),
            }

        if not finished:
            return {
                "success": False,
                "error": "Video processing timeout - Instagram took too long to process the video",
            }

        # Step 3: Publish the reel
        logger.debug("📤 Step 3: Publishing reel...")

        publish_url = f"{GRAPH_API}/{INSTAGRAM_ACCOUNT_ID}/media_publish"
        publish_params = {
            "creation_id": creation_id,
            "access_token": ACCESS_TOKEN,
        }

        publish_response = requests.post(publish_url, params=publish_params)

        if publish_response.status_code != 200:
            error_data = publish_response.json()
            return {
                "success": False,
                "error": (
                    f"Failed to publish reel: "
                    f"{error_data.get('error', {}).get('message', publish_response.text)}"
                ),
            }

        publish_data = publish_response.json()
        media_id = publish_data.get("id")
        logger.debug(f"🎉 Instagram Reel published successfully! ID: {media_id}")

        return {
            "success": True,
            "media_id": media_id,
            "creation_id": creation_id,
            "message": "Video successfully posted to Instagram!",
            "platform": "Instagram",
        }

    except requests.exceptions.RequestException as e:
        return {
            "success": False,
            "error": f"Request error: {str(e)}",
            "platform": "Instagram",
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Unexpected error: {str(e)}",
            "platform": "Instagram",
        }
