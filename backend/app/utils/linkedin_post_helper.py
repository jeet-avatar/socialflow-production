import logging
"""
LinkedIn Posting Helper
"""
import os
import requests
from dotenv import load_dotenv
from utils.integrations_service import integrations_service
logger = logging.getLogger(__name__)

load_dotenv()

LINKEDIN_API = "https://api.linkedin.com/v2"


def _resolve_li_credentials(user_id):
    """
    Resolve LinkedIn credentials for the given user_id.

    Returns (access_token, person_urn) on success, or a failure dict if
    credentials cannot be resolved.
    """
    if not user_id:
        return {
            "success": False,
            "error": "User authentication required",
            "hint": "Please log in to post to LinkedIn"
        }

    integration = integrations_service.get_integration(user_id, "linkedin", decrypt=True)

    if integration and integration.get("is_connected"):
        credentials = integration.get("credentials", {})
        access_token = credentials.get("accessToken")
        person_urn = credentials.get("personUrn")
        logger.debug(f"✅ Using LinkedIn credentials from integrations for user: {user_id}")
        return (access_token, person_urn)

    return {
        "success": False,
        "error": "LinkedIn integration not configured",
        "hint": "Please configure LinkedIn integration in the Integrations tab"
    }


def _classify_li_register_error(response):
    """
    Parse a failed LinkedIn register-upload response and return a failure dict
    with an appropriate hint.
    """
    try:
        error_data = response.json()
        error_message = error_data.get('message', '')
        error_status = error_data.get('status', '')
        service_error_code = error_data.get('serviceErrorCode', '')

        logger.debug("❌ LinkedIn API Error:")
        logger.debug(f"   Status: {error_status}")
        logger.debug(f"   Message: {error_message}")
        logger.debug(f"   Service Error Code: {service_error_code}")
        logger.debug(f"   Full response: {error_data}")

        if "Internal Server Error" in str(error_message) or response.status_code == 500:
            hint = (
                "LinkedIn API Internal Error. Common causes:\n"
                "1. Invalid Person URN format (should be: urn:li:person:XXXXXXXX)\n"
                "2. Access token doesn't have 'w_member_social' permission\n"
                "3. Access token is expired or invalid\n"
                "4. Try re-authenticating your LinkedIn account"
            )
        elif "token" in str(error_message).lower() or response.status_code == 401:
            hint = "Authentication failed. Please reconnect your LinkedIn account in Integrations"
        elif "permission" in str(error_message).lower() or response.status_code == 403:
            hint = "Insufficient permissions. Ensure your LinkedIn token has 'w_member_social' scope"
        else:
            hint = "Check if your LinkedIn access token is valid and has the required permissions"

        return {
            "success": False,
            "error": f"Failed to register upload: {error_message or response.text}",
            "hint": hint,
            "status_code": response.status_code,
            "service_error_code": service_error_code
        }
    except Exception:
        return {
            "success": False,
            "error": f"Failed to register upload: {response.text}",
            "hint": "LinkedIn API returned an unexpected response. Please check your credentials.",
            "status_code": response.status_code
        }


def _create_li_post(headers, person_urn, asset_id, caption, title, linkedin_api):
    """
    Construct and submit the LinkedIn UGC post payload.

    Returns a result dict.
    """
    post_payload = {
        "author": person_urn,
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {
                    "text": caption
                },
                "shareMediaCategory": "VIDEO",
                "media": [{
                    "status": "READY",
                    "description": {
                        "text": title
                    },
                    "media": asset_id,
                    "title": {
                        "text": title
                    }
                }]
            }
        },
        "visibility": {
            "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
        }
    }

    post_response = requests.post(
        f"{linkedin_api}/ugcPosts",
        headers=headers,
        json=post_payload
    )

    if post_response.status_code not in [200, 201]:
        return {
            "success": False,
            "error": f"Failed to create post: {post_response.text}"
        }

    post_data = post_response.json()
    post_id = post_data.get("id", "")

    logger.debug(f"🎉 LinkedIn post created successfully! ID: {post_id}")

    return {
        "success": True,
        "post_id": post_id,
        "asset_id": asset_id,
        "message": "Video successfully posted to LinkedIn!",
        "platform": "LinkedIn"
    }


def post_video_to_linkedin(video_file_path: str, caption: str, title: str = "AI Generated Video", user_id: str = None) -> dict:
    """
    Post a video to LinkedIn

    Args:
        video_file_path: Local file path to the video
        caption: Post caption/description
        title: Video title

    Returns:
        dict with success status and details
    """
    try:
        logger.debug(f"🔗 Starting LinkedIn video upload for: {video_file_path}")

        creds = _resolve_li_credentials(user_id)
        if isinstance(creds, dict):
            return creds
        access_token, person_urn = creds

        if not access_token:
            return {
                "success": False,
                "error": "LinkedIn Access Token not configured",
                "hint": "Please configure LinkedIn integration in the Integrations tab or set LINKEDIN_ACCESS_TOKEN in .env"
            }

        if not person_urn:
            return {
                "success": False,
                "error": "LinkedIn Person URN not configured",
                "hint": "Please configure LinkedIn integration in the Integrations tab (format: urn:li:person:XXXXXXXX)"
            }

        if not os.path.exists(video_file_path):
            return {
                "success": False,
                "error": f"Video file not found: {video_file_path}"
            }

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0"
        }

        # Step 1: Register video upload
        logger.debug("📝 Step 1: Registering video upload...")
        file_size = os.path.getsize(video_file_path)

        register_payload = {
            "registerUploadRequest": {
                "recipes": ["urn:li:digitalmediaRecipe:feedshare-video"],
                "owner": person_urn,
                "serviceRelationships": [{
                    "relationshipType": "OWNER",
                    "identifier": "urn:li:userGeneratedContent"
                }]
            }
        }

        register_response = requests.post(
            f"{LINKEDIN_API}/assets?action=registerUpload",
            headers=headers,
            json=register_payload,
            timeout=30
        )

        logger.debug(f"📊 Register response status: {register_response.status_code}")
        logger.debug(f"📊 Register response headers: {dict(register_response.headers)}")

        if register_response.status_code != 200:
            return _classify_li_register_error(register_response)

        register_data = register_response.json()
        asset_id = register_data["value"]["asset"]
        upload_url = register_data["value"]["uploadMechanism"]["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]["uploadUrl"]

        logger.debug(f"✅ Upload registered - Asset ID: {asset_id}")

        # Step 2: Upload video binary
        logger.debug(f"⬆️  Step 2: Uploading video ({file_size / 1024 / 1024:.2f} MB)...")

        with open(video_file_path, "rb") as f:
            video_data = f.read()

        upload_headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/octet-stream"
        }

        upload_response = requests.put(upload_url, headers=upload_headers, data=video_data)

        if upload_response.status_code not in [200, 201]:
            return {
                "success": False,
                "error": f"Failed to upload video: {upload_response.text}"
            }

        logger.debug("✅ Video uploaded successfully!")

        # Step 3: Create post with video
        logger.debug("📤 Step 3: Creating LinkedIn post...")
        return _create_li_post(headers, person_urn, asset_id, caption, title, LINKEDIN_API)

    except requests.exceptions.RequestException as e:
        return {
            "success": False,
            "error": f"Request error: {str(e)}",
            "platform": "LinkedIn"
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Unexpected error: {str(e)}",
            "platform": "LinkedIn"
        }
