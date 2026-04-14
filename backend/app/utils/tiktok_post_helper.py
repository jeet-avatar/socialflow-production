"""
TikTok Video Post Helper
Posts videos to TikTok using Content Posting API v2.
Uses credentials (accessToken, refreshToken, openId, tokenExpiresAt) stored via OAuth flow in integrations_routes.py.
Mirrors youtube_post_helper.py pattern.
"""
import math
import os
import time
import logging
import requests
from utils.integrations_service import integrations_service

logger = logging.getLogger(__name__)

TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/"
TIKTOK_POST_INIT_URL = "https://open.tiktokapis.com/v2/post/publish/video/init/"
TIKTOK_POST_STATUS_URL = "https://open.tiktokapis.com/v2/post/publish/status/fetch/"
TIKTOK_CREATOR_INFO_URL = "https://open.tiktokapis.com/v2/post/publish/creator_info/query/"
CHUNK_SIZE = 10 * 1024 * 1024  # 10MB per TikTok API recommendation (min 5MB, max 64MB)
MAX_POLL_ATTEMPTS = 24  # 24 * 5s = 2 minutes max wait


def _resolve_tiktok_credentials(user_id):
    """
    Resolve TikTok credentials for the given user_id.

    Returns the credentials dict on success, or a failure dict if credentials
    cannot be resolved.
    """
    if not user_id:
        logger.debug("No user_id provided")
        return {
            "success": False,
            "error": "User ID required",
            "hint": "Authentication required"
        }

    logger.debug(f"Looking up TikTok integration for user_id={user_id}")
    integration = integrations_service.get_integration(user_id, "tiktok", decrypt=True)
    logger.debug(f"TikTok integration found for user_id={user_id}: {bool(integration)}")

    if not integration or not integration.get("credentials"):
        logger.debug(f"No TikTok integration found for user {user_id}")
        return {
            "success": False,
            "error": "TikTok not configured",
            "hint": "Please configure TikTok integration in the Integrations tab"
        }

    creds = integration.get("credentials", {})

    # Validate required fields
    if not creds.get("accessToken") or not creds.get("openId"):
        logger.debug(f"TikTok credentials missing accessToken or openId for user {user_id}")
        return {
            "success": False,
            "error": "TikTok credentials incomplete",
            "hint": "Please reconnect your TikTok account in the Integrations tab"
        }

    return creds


def _refresh_if_needed(creds, user_id):
    """
    Refresh TikTok access token if it expires within 60 minutes.

    Returns updated creds dict (either original or refreshed).
    On refresh failure, logs a warning and returns original creds (best-effort).
    """
    token_expires_at = creds.get("tokenExpiresAt", 0)
    time_until_expiry = token_expires_at - time.time()

    if time_until_expiry > 3600:
        logger.debug(f"TikTok token still valid for {time_until_expiry:.0f}s — no refresh needed")
        return creds

    logger.debug(f"TikTok token expires in {time_until_expiry:.0f}s — refreshing")

    try:
        resp = requests.post(
            TIKTOK_TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": creds.get("refreshToken", ""),
                "client_key": creds.get("clientKey", ""),
                "client_secret": creds.get("clientSecret", ""),
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30,
        )

        if resp.status_code == 200:
            data = resp.json()
            new_access_token = data.get("access_token")
            new_refresh_token = data.get("refresh_token")
            expires_in = data.get("expires_in", 86400)

            if new_access_token:
                creds = dict(creds)  # shallow copy — don't mutate caller's dict
                creds["accessToken"] = new_access_token
                if new_refresh_token:
                    creds["refreshToken"] = new_refresh_token
                creds["tokenExpiresAt"] = int(time.time()) + expires_in

                # Persist refreshed tokens
                try:
                    integrations_service.save_integration(
                        user_id=user_id,
                        platform="tiktok",
                        credentials=creds,
                        is_connected=True,
                    )
                    logger.debug("TikTok tokens refreshed and persisted successfully")
                except Exception as save_err:
                    logger.warning(f"Failed to persist refreshed TikTok tokens: {save_err}")

                return creds
        else:
            logger.warning(f"TikTok token refresh returned {resp.status_code}: {resp.text[:200]}")

    except Exception as e:
        logger.warning(f"TikTok token refresh failed: {e}")

    # Best-effort: return original creds so we still attempt the post
    return creds


def _get_allowed_privacy_level(access_token, open_id):
    """
    Query TikTok creator info to determine allowed privacy level.

    Returns "PUBLIC_TO_EVERYONE" if the user's account supports it,
    otherwise returns "SELF_ONLY" as the safe default for unaudited apps.
    """
    try:
        resp = requests.post(
            TIKTOK_CREATOR_INFO_URL,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json; charset=UTF-8",
            },
            json={},
            timeout=15,
        )

        if resp.status_code == 200:
            data = resp.json()
            privacy_options = (
                data.get("data", {})
                .get("creator_avatar_info", {})
                .get("privacy_level_options", [])
            )
            if "PUBLIC_TO_EVERYONE" in privacy_options:
                return "PUBLIC_TO_EVERYONE"

    except Exception as e:
        logger.warning(f"Failed to query TikTok creator info: {e}")

    return "SELF_ONLY"


def _post_pull_from_url(access_token, open_id, video_url, title, caption):
    """
    Initiate a TikTok PULL_FROM_URL post.

    Returns the publish_id string on success.
    Raises ValueError("domain_not_verified") if TikTok can't pull from the URL.
    Raises Exception on other errors.
    """
    privacy = _get_allowed_privacy_level(access_token, open_id)

    resp = requests.post(
        TIKTOK_POST_INIT_URL,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json; charset=UTF-8",
        },
        json={
            "post_info": {
                "title": caption[:2200],  # TikTok title max 2200 UTF-16 chars
                "privacy_level": privacy,
                "disable_duet": False,
                "disable_stitch": False,
                "disable_comment": False,
            },
            "source_info": {
                "source": "PULL_FROM_URL",
                "video_url": video_url,
            },
        },
        timeout=30,
    )

    if resp.status_code == 200:
        try:
            publish_id = resp.json()["data"]["publish_id"]
            logger.debug(f"TikTok PULL_FROM_URL initiated: publish_id={publish_id}")
            return publish_id
        except (KeyError, TypeError) as e:
            raise Exception(f"TikTok init response missing publish_id: {resp.text[:200]}") from e

    resp_text = resp.text
    if "domain_not_verified" in resp_text or "url_not_allowed" in resp_text:
        raise ValueError("domain_not_verified")

    raise Exception(f"TikTok init failed: {resp.status_code} {resp_text[:200]}")


def _upload_file_chunks(upload_url, file_path):
    """
    Upload a video file to TikTok using chunked PUT requests.

    Sends Content-Range headers per TikTok's FILE_UPLOAD spec.
    Returns True on completion.
    """
    total_size = os.path.getsize(file_path)
    start = 0

    with open(file_path, "rb") as fh:
        chunk_index = 0
        while True:
            chunk_data = fh.read(CHUNK_SIZE)
            if not chunk_data:
                break

            end = start + len(chunk_data) - 1
            headers = {
                "Content-Range": f"bytes {start}-{end}/{total_size}",
                "Content-Type": "video/mp4",
            }

            try:
                put_resp = requests.put(
                    upload_url,
                    data=chunk_data,
                    headers=headers,
                    timeout=120,
                )
                logger.debug(f"TikTok chunk {chunk_index}: bytes {start}-{end}, status={put_resp.status_code}")
            except Exception as e:
                logger.warning(f"TikTok chunk {chunk_index} upload error: {e}")

            start += len(chunk_data)
            chunk_index += 1

    return True


def _post_file_upload(access_token, open_id, file_path, title, caption):
    """
    Initiate a TikTok FILE_UPLOAD post and upload chunks.

    Returns the publish_id string on success.
    Raises Exception on errors.
    """
    privacy = _get_allowed_privacy_level(access_token, open_id)
    file_size = os.path.getsize(file_path)
    total_chunk_count = math.ceil(file_size / CHUNK_SIZE)

    resp = requests.post(
        TIKTOK_POST_INIT_URL,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json; charset=UTF-8",
        },
        json={
            "post_info": {
                "title": caption[:2200],
                "privacy_level": privacy,
                "disable_duet": False,
                "disable_stitch": False,
                "disable_comment": False,
            },
            "source_info": {
                "source": "FILE_UPLOAD",
                "video_size": file_size,
                "chunk_size": CHUNK_SIZE,
                "total_chunk_count": total_chunk_count,
            },
        },
        timeout=30,
    )

    if resp.status_code != 200:
        raise Exception(f"TikTok FILE_UPLOAD init failed: {resp.status_code} {resp.text[:200]}")

    try:
        data = resp.json()["data"]
        upload_url = data["upload_url"]
        publish_id = data["publish_id"]
    except (KeyError, TypeError) as e:
        raise Exception(f"TikTok FILE_UPLOAD init response malformed: {resp.text[:200]}") from e

    logger.debug(f"TikTok FILE_UPLOAD initiated: publish_id={publish_id}, uploading {total_chunk_count} chunks")
    _upload_file_chunks(upload_url, file_path)
    return publish_id


def _poll_publish_status(access_token, publish_id):
    """
    Poll TikTok publish status until complete, failed, or max attempts reached.

    Returns a dict with success=True on PUBLISH_COMPLETE or PROCESSING (non-fatal timeout).
    Raises Exception on FAILED status.
    """
    for attempt in range(MAX_POLL_ATTEMPTS):
        time.sleep(5)

        try:
            resp = requests.post(
                TIKTOK_POST_STATUS_URL,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json; charset=UTF-8",
                },
                json={"publish_id": publish_id},
                timeout=15,
            )

            if resp.status_code == 200:
                data = resp.json().get("data", {})
                status = data.get("status", "")

                logger.debug(f"TikTok publish status (attempt {attempt + 1}/{MAX_POLL_ATTEMPTS}): {status}")

                if status == "PUBLISH_COMPLETE":
                    return {
                        "success": True,
                        "publish_id": publish_id,
                        "status": "PUBLISH_COMPLETE",
                    }

                if status == "FAILED":
                    fail_reason = data.get("fail_reason", "Unknown failure")
                    raise Exception(fail_reason)

                # PROCESSING or other transitional states — keep polling

        except Exception as e:
            # Re-raise if this is a FAILED status exception (not a request error)
            if "Unknown failure" in str(e) or attempt >= MAX_POLL_ATTEMPTS - 1:
                raise
            logger.warning(f"TikTok status poll error on attempt {attempt + 1}: {e}")

    # Timed out — post is still processing (non-fatal)
    logger.warning(f"TikTok publish still processing after {MAX_POLL_ATTEMPTS} attempts — returning PROCESSING")
    return {
        "success": True,
        "publish_id": publish_id,
        "status": "PROCESSING",
    }


def post_video_to_tiktok(file_path, caption, title, user_id):
    """
    Post a video to TikTok.

    Args:
        file_path: Local file path (used as FILE_UPLOAD fallback if PULL_FROM_URL fails).
                   Pass the CloudFront URL as video_url; file_path is the local copy.
        caption:   TikTok post caption / title (max 2200 UTF-16 chars).
        title:     Post title (same as caption for TikTok).
        user_id:   User ID to look up TikTok credentials from integrations.

    Returns:
        dict with success=True and publish_id on success, or success=False on error.
    """
    # Step 1: Resolve credentials
    creds = _resolve_tiktok_credentials(user_id)
    if isinstance(creds, dict) and creds.get("success") is False:
        return creds

    # Step 2: Refresh tokens if near expiry
    creds = _refresh_if_needed(creds, user_id)

    access_token = creds["accessToken"]
    open_id = creds["openId"]

    publish_id = None

    # Step 3: Try PULL_FROM_URL first (uses file_path as video_url when it's a real URL,
    # or falls back to FILE_UPLOAD when file_path is a local path)
    try:
        # file_path is the local copy; try PULL_FROM_URL using file_path as the video URL
        # (caller should pass the CloudFront URL here for PULL_FROM_URL to work)
        if file_path and (file_path.startswith("http://") or file_path.startswith("https://")):
            video_url = file_path
            publish_id = _post_pull_from_url(access_token, open_id, video_url, title, caption)
        else:
            raise ValueError("domain_not_verified")

    except ValueError as ve:
        if "domain_not_verified" in str(ve):
            # Fallback to FILE_UPLOAD if we have a real local file
            if file_path and os.path.isfile(file_path):
                logger.info("TikTok PULL_FROM_URL unavailable — falling back to FILE_UPLOAD")
                publish_id = _post_file_upload(access_token, open_id, file_path, title, caption)
            else:
                return {
                    "success": False,
                    "error": "TikTok domain not verified and no local file available for FILE_UPLOAD",
                    "hint": "Verify your domain at developers.tiktok.com or provide a local file path"
                }
        else:
            raise

    # Step 4: Poll for publish completion
    result = _poll_publish_status(access_token, publish_id)

    return {
        "success": True,
        "publish_id": publish_id,
        "platform": "tiktok",
        "status": result["status"],
    }
