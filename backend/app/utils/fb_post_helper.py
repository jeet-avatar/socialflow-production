"""
Facebook Posting Helper - Uses proven fb_upload.py implementation
"""
import os
import requests
from dotenv import load_dotenv
from utils.integrations_service import integrations_service

load_dotenv()

GRAPH_API = "https://graph.facebook.com/v24.0"

def get_page_access_token(user_access_token: str, page_id: str) -> str:
    """Fetch the page access token using the user access token"""
    print(f"🔍 Attempting to get page token for page: {page_id}")
    print(f"🔍 User token length: {len(user_access_token) if user_access_token else 0}")

    url = f"{GRAPH_API}/me/accounts"
    params = {"access_token": user_access_token}

    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        print(f"🔍 Facebook API response: {data}")

        pages = data.get("data", [])
        print(f"🔍 Found {len(pages)} pages")

        for page in pages:
            print(f"   - Page: {page.get('name')} (ID: {page.get('id')})")
            if page.get("id") == page_id:
                page_token = page.get("access_token")
                print(f"✅ Found matching page! Token length: {len(page_token) if page_token else 0}")
                return page_token

        # If we get here, page not found
        available_pages = [f"{p.get('name')} ({p.get('id')})" for p in pages]
        raise RuntimeError(
            f"Page ID {page_id} not found in your pages. "
            f"Available pages: {', '.join(available_pages) if available_pages else 'None'}"
        )
    except requests.exceptions.RequestException as e:
        print(f"❌ Facebook API request failed: {e}")
        raise RuntimeError(f"Failed to connect to Facebook API: {str(e)}")


def _resolve_fb_credentials(user_id):
    """
    Resolve Facebook credentials for the given user_id.

    Returns (access_token, page_id) on success, or a failure dict if credentials
    cannot be resolved.
    """
    if not user_id:
        print("❌ DEBUG: No user_id provided")
        return {
            "success": False,
            "error": "User authentication required",
            "hint": "Please log in to post to Facebook"
        }

    integration = integrations_service.get_integration(user_id, "facebook", decrypt=True)

    print(f"🔍 DEBUG: integration = {integration}")

    if integration and integration.get("is_connected"):
        credentials = integration.get("credentials", {})
        access_token = credentials.get("accessToken")
        page_id = credentials.get("pageId")
        print(f"✅ Using Facebook credentials from integrations for user: {user_id}")
        print(f"🔍 DEBUG: ACCESS_TOKEN = {access_token[:20] if access_token else None}...")
        print(f"🔍 DEBUG: PAGE_ID = {page_id}")
        return (access_token, page_id)

    print("❌ DEBUG: Integration not found or not connected")
    print(f"   integration exists: {integration is not None}")
    if integration:
        print(f"   is_connected: {integration.get('is_connected')}")
    return {
        "success": False,
        "error": "Facebook integration not configured",
        "hint": "Please configure Facebook integration in the Integrations tab"
    }


def _get_page_token(access_token, page_id):
    """
    Retrieve the page-scoped access token.

    Returns (page_access_token, None) on success, or (None, error_dict) on failure.
    """
    try:
        page_access_token = get_page_access_token(access_token, page_id)
        print(f"✅ Retrieved page access token for page: {page_id}")
        return (page_access_token, None)
    except Exception as e:
        print(f"❌ Failed to get page access token: {e}")
        return (None, {
            "success": False,
            "error": f"Failed to get page access token: {str(e)}",
            "hint": "Make sure your access token has 'pages_manage_posts' and 'pages_read_engagement' permissions"
        })


def _upload_video_to_page(page_id, page_access_token, video_file_path, description):
    """
    Upload a video file to the Facebook page and return a result dict.
    """
    url = f"{GRAPH_API}/{page_id}/videos"

    file_size = os.path.getsize(video_file_path)
    print(f"   File size: {file_size / 1024 / 1024:.2f} MB")
    print(f"   Uploading to {url}...")

    with open(video_file_path, 'rb') as video_file:
        files = {'source': video_file}
        data = {
            'description': description,
            'access_token': page_access_token
        }
        response = requests.post(url, files=files, data=data, timeout=600)

    if response.status_code != 200:
        error_data = response.json() if response.text else {}
        error_msg = error_data.get('error', {}).get('message', response.text)
        return {
            "success": False,
            "error": f"Failed to upload video: {error_msg}"
        }

    result = response.json()
    video_id = result.get("id")
    reel_id = video_id

    print(f" Reel published successfully! ID: {reel_id}")

    return {
        "success": True,
        "video_id": video_id,
        "reel_id": reel_id,
        "message": "Video successfully posted to Facebook!",
        "platform": "Facebook"
    }


def post_video_to_facebook(video_file_path: str, description: str, user_id: str = None) -> dict:
    """
    Post a video to Facebook as a Reel

    Args:
        video_file_path: Local file path to the video (e.g., /static/generated_video_123.mp4)
        description: Caption/description for the reel

    Returns:
        dict with success status and details
    """
    try:
        print(f" Starting Facebook Reel upload for: {video_file_path}")
        print(f"🔍 DEBUG: user_id = {user_id}")

        creds = _resolve_fb_credentials(user_id)
        if isinstance(creds, dict):
            return creds
        access_token, page_id = creds

        if not access_token:
            return {
                "success": False,
                "error": "Facebook Access Token not configured",
                "hint": "Please configure Facebook integration in the Integrations tab or set FACEBOOK_ACCESS_TOKEN in .env"
            }

        if not page_id:
            return {
                "success": False,
                "error": "Facebook Page ID not configured",
                "hint": "Please configure Facebook integration in the Integrations tab"
            }

        if not os.path.exists(video_file_path):
            return {
                "success": False,
                "error": f"Video file not found: {video_file_path}"
            }

        # ALWAYS get page access token from user token
        # This is REQUIRED for Facebook Reels API
        page_access_token, token_error = _get_page_token(access_token, page_id)
        if token_error:
            return token_error

        if not page_access_token:
            return {
                "success": False,
                "error": "Could not retrieve page access token",
                "hint": "Make sure you have admin access to the Facebook page"
            }

        print("📝 Uploading video to Facebook Page...")
        return _upload_video_to_page(page_id, page_access_token, video_file_path, description)

    except requests.exceptions.RequestException as e:
        return {
            "success": False,
            "error": f"Request error: {str(e)}",
            "platform": "Facebook"
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Unexpected error: {str(e)}",
            "platform": "Facebook"
        }
