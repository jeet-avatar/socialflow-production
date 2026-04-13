"""
YouTube Video Upload Helper
Handles video uploads to YouTube using OAuth2 credentials from integrations
Similar to Instagram flow - gets credentials from integrations tab
"""

import os
import logging
import traceback
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload
from utils.integrations_service import integrations_service

logger = logging.getLogger(__name__)

YOUTUBE_API_SERVICE_NAME = "youtube"
YOUTUBE_API_VERSION = "v3"
YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload"


def _resolve_yt_credentials(user_id):
    """
    Resolve YouTube credentials for the given user_id.

    Returns the credentials dict on success, or a failure dict if credentials
    cannot be resolved.
    """
    if not user_id:
        logger.debug("❌ No user_id provided")
        return {
            "success": False,
            "error": "User ID required",
            "hint": "Authentication required"
        }

    logger.debug(f"🔍 DEBUG: user_id = {user_id}")
    integration = integrations_service.get_integration(user_id, "youtube", decrypt=True)
    logger.debug(f"🔍 DEBUG: integration = {integration}")

    if not integration or not integration.get('credentials'):
        logger.debug(f"⚠️  No YouTube integration found for user {user_id}")
        return {
            "success": False,
            "error": "YouTube not configured",
            "hint": "Please configure YouTube integration in the Integrations tab"
        }

    return integration.get('credentials', {})


def _build_yt_oauth_creds(credentials):
    """
    Build and refresh a Google OAuth2 Credentials object.

    Returns (creds_obj, None) on success, or (None, error_dict) on failure.
    """
    refresh_token = credentials.get('refreshToken')
    client_id = credentials.get('clientId')
    client_secret = credentials.get('clientSecret')

    logger.debug("✅ Building YouTube OAuth credentials")
    logger.debug(f"🔍 DEBUG: client_id = {client_id[:20] if client_id else 'None'}...")
    logger.debug(f"🔍 DEBUG: client_secret = {client_secret[:20] if client_secret else 'None'}...")
    logger.debug(f"🔍 DEBUG: refresh_token = {refresh_token[:20] if refresh_token else 'None (will authorize)'}...")

    if not client_id or not client_secret:
        logger.debug("❌ YouTube client ID or secret missing")
        return (None, {
            "success": False,
            "error": "YouTube client ID or secret not configured",
            "hint": "Please configure YouTube integration with Client ID and Client Secret"
        })

    if not refresh_token:
        logger.debug("⚠️  No refresh token found - OAuth flow required")
        return (None, {
            "success": False,
            "error": "YouTube authorization required",
            "hint": "Please authorize YouTube access. This requires implementing OAuth flow in the frontend.",
            "requires_oauth": True
        })

    logger.debug("🔄 Using stored refresh token")
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=[YOUTUBE_UPLOAD_SCOPE]
    )

    try:
        creds.refresh(Request())
        logger.debug("✅ YouTube access token refreshed successfully")
        return (creds, None)
    except Exception as e:
        logger.debug(f"❌ Failed to refresh YouTube token: {e}")
        return (None, {
            "success": False,
            "error": f"Failed to refresh YouTube token: {str(e)}",
            "hint": "Your YouTube authorization may have expired. Please reconnect YouTube in Integrations."
        })


def _classify_http_error(error_msg):
    """
    Map a YouTube HttpError message to an appropriate failure dict.
    """
    if "quotaExceeded" in error_msg:
        return {
            "success": False,
            "error": "YouTube API quota exceeded",
            "hint": "Your YouTube API quota has been exceeded. Please try again tomorrow or increase your quota."
        }
    if "forbidden" in error_msg.lower():
        return {
            "success": False,
            "error": "YouTube API access forbidden",
            "hint": "Please ensure your YouTube API credentials have the correct permissions."
        }
    return {
        "success": False,
        "error": f"YouTube API error: {error_msg}"
    }


def _handle_chunk_response(response):
    """
    Interpret a non-None chunk response from request.next_chunk().

    Returns a result dict, or None if the upload should continue.
    """
    if 'id' in response:
        video_id = response['id']
        video_url = f"https://www.youtube.com/watch?v={video_id}"
        logger.debug("✅ Video uploaded successfully!")
        logger.debug(f"   Video ID: {video_id}")
        logger.debug(f"   URL: {video_url}")
        return {
            "success": True,
            "video_id": video_id,
            "video_url": video_url,
            "message": "Video successfully posted to YouTube!",
            "platform": "YouTube"
        }
    return {
        "success": False,
        "error": f"Unexpected response from YouTube: {response}"
    }


def _handle_http_error_retry(e, retry_count, max_retries):
    """
    Decide whether a retriable HttpError should increment the counter or be re-raised.

    Returns (new_retry_count, error_dict_or_None). If error_dict is not None the
    caller should return it immediately. If the error is non-retriable, re-raises.
    """
    if e.resp.status not in [500, 502, 503, 504]:
        raise
    retry_count += 1
    logger.debug(f"⚠️  Retriable error (attempt {retry_count}/{max_retries}): {e}")
    if retry_count >= max_retries:
        return retry_count, {
            "success": False,
            "error": f"YouTube upload failed after {max_retries} retries: {str(e)}"
        }
    return retry_count, None


def _execute_upload_with_retry(request, max_retries=3):
    """
    Drive a resumable upload request to completion with retry logic.

    Returns a result dict.
    """
    response = None
    retry_count = 0

    while response is None and retry_count < max_retries:
        try:
            _, response = request.next_chunk()
            if response is not None:
                return _handle_chunk_response(response)
        except HttpError as e:
            retry_count, err = _handle_http_error_retry(e, retry_count, max_retries)
            if err:
                return err

    return {
        "success": False,
        "error": "Upload incomplete - no response received"
    }


def post_video_to_youtube(video_file_path: str, title: str, description: str, user_id: str = None) -> dict:
    """
    Post a video to YouTube

    Args:
        video_file_path: Local file path to the video
        title: Video title
        description: Video description
        user_id: User ID to get credentials from integrations

    Returns:
        dict with success status and details
    """

    logger.debug(f"📺 Starting YouTube upload for: {video_file_path}")

    raw_creds = _resolve_yt_credentials(user_id)
    if isinstance(raw_creds, dict) and raw_creds.get("success") is False:
        return raw_creds

    creds, creds_error = _build_yt_oauth_creds(raw_creds)
    if creds_error:
        return creds_error

    if not os.path.exists(video_file_path):
        return {
            "success": False,
            "error": f"Video file not found: {video_file_path}"
        }

    try:
        youtube = build(YOUTUBE_API_SERVICE_NAME, YOUTUBE_API_VERSION, credentials=creds)

        body = {
            "snippet": {
                "title": title,
                "description": description,
                "categoryId": "22"  # People & Blogs
            },
            "status": {
                "privacyStatus": "public",  # or "private", "unlisted"
                "selfDeclaredMadeForKids": False
            }
        }

        logger.debug("📤 Uploading video to YouTube...")
        logger.debug(f"   Title: {title}")
        logger.debug(f"   File size: {os.path.getsize(video_file_path) / 1024 / 1024:.2f} MB")

        media = MediaFileUpload(
            video_file_path,
            chunksize=-1,  # Upload entire file in one request
            resumable=True,
            mimetype="video/mp4"
        )

        request = youtube.videos().insert(
            part=",".join(body.keys()),
            body=body,
            media_body=media
        )

        return _execute_upload_with_retry(request)

    except HttpError as e:
        error_msg = str(e)
        logger.debug(f"❌ YouTube API error: {error_msg}")
        return _classify_http_error(error_msg)

    except Exception as e:
        logger.debug(f"❌ YouTube upload error: {e}")
        traceback.print_exc()
        return {
            "success": False,
            "error": f"Failed to upload to YouTube: {str(e)}"
        }
