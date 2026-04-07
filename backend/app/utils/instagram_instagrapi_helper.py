"""
Instagram Posting Helper - Uses proven instagrapi implementation
"""
import os
import traceback
from typing import Any, Dict, Optional, Tuple, Union
from dotenv import load_dotenv
from utils.integrations_service import integrations_service

load_dotenv()


def _resolve_instagrapi_credentials(user_id: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """
    Resolve Instagram credentials for the given user.

    If user_id is provided, credentials are fetched from the integrations service.
    If no user_id is given, environment variables are used as a fallback.

    Returns:
        (username, password) tuple — either may be None if not configured.
    """
    if user_id:
        integration = integrations_service.get_integration(user_id, "instagram", decrypt=True)
        if integration and integration.get("is_connected"):
            credentials = integration.get("credentials", {})
            username = credentials.get("username")
            password = credentials.get("password")
            print(f"✅ Using Instagram credentials from integrations for user: {user_id}")
            return username, password
        # No fallback — require proper configuration
        print(f"❌ Instagram integration not configured for user: {user_id}")
        return None, None

    # No user_id provided — check environment variables only
    print("⚠️  No user_id provided, checking environment variables...")
    return os.getenv("INSTAGRAM_USERNAME"), os.getenv("INSTAGRAM_PASSWORD")


def _validate_video_duration(video_file_path: str, post_type: str) -> Union[float, Dict[str, Any], None]:
    """
    Inspect the video file and validate its duration for the given post type.

    Raises nothing on failure — returns None if duration cannot be determined.
    Returns the duration (float, seconds) when successful, unless a validation
    check produces a hard error response dict (see inline comments).

    Duration rules:
      - All posts: minimum 3 seconds.
      - Reels:     maximum 90 seconds.
      - Feed posts over 60 seconds trigger an IGTV warning (not an error).

    Returns:
        - float: valid duration in seconds.
        - dict with ``_error=True``: a ready-made error response for min/max violations.
        - None: duration could not be determined (moviepy unavailable or read failure).
    """
    try:
        from moviepy.editor import VideoFileClip
        video_clip = VideoFileClip(video_file_path)
        duration = video_clip.duration
        video_clip.close()

        print(f"📹 Video duration: {duration:.2f} seconds")

        if duration < 3:
            return {"_error": True, "success": False,
                    "error": f"Video too short: {duration:.2f}s. Instagram requires at least 3 seconds.",
                    "hint": "Generate a longer video or add more content"}

        if post_type == "reel" and duration > 90:
            return {"_error": True, "success": False,
                    "error": "❌ Video Too Long for Instagram Reel",
                    "details": f"Your video is {duration:.2f} seconds long, which exceeds Instagram's Reel limit of 90 seconds.",
                    "hint": (f"📌 Solution: Please select 'Feed Post' instead of 'Reel' to post this "
                             f"{duration:.2f}s video. Feed posts support longer videos and will automatically "
                             f"use IGTV for videos over 60 seconds."),
                    "platform": "Instagram",
                    "duration": duration}

        if post_type == "reel":
            print(f"✅ Video duration {duration:.2f}s - uploading as Instagram Reel.")
        elif post_type == "feed":
            if duration > 60:
                print(f"⚠️  Video is {duration:.2f}s (> 60s). Will use IGTV upload for longer videos.")
            else:
                print(f"✅ Video duration {duration:.2f}s - uploading as regular feed post.")

        return duration

    except Exception as duration_error:
        print(f"⚠️  Could not check video duration: {duration_error}")
        return None


def _upload_feed_video(cl, video_file_path: str, caption: str, duration: Optional[float]):
    """
    Upload the video as an Instagram feed post.

    For videos longer than 60 seconds, IGTV upload is attempted first with a
    fallback to regular video_upload if IGTV fails.

    Returns:
        instagrapi media object on success.
    """
    if duration and duration > 60:
        print(f"📹 Video is {duration:.2f}s (> 60s). Using IGTV upload for longer video...")
        try:
            media = cl.igtv_upload(
                path=video_file_path,
                title=caption[:100] if caption else "Video Post",
                caption=caption
            )
            print("🎉 Instagram IGTV video uploaded successfully!")
            return media
        except Exception as igtv_error:
            print(f"⚠️  IGTV upload failed: {igtv_error}")
            print("⚠️  Falling back to regular video upload...")

    print("📹 Uploading as regular Instagram feed post...")
    media = cl.video_upload(
        path=video_file_path,
        caption=caption,
        thumbnail=None
    )
    print("🎉 Instagram feed post uploaded successfully!")
    return media


def _classify_upload_error(error_str: str, post_type: str) -> Tuple[str, str]:
    """
    Map an upload error string to a user-facing (error_message, hint_message) tuple.

    Handles VideoSourceDurationCheckException and generic duration-related errors.
    """
    if "VideoSourceDurationCheckException" in error_str or "duration" in error_str.lower():
        if post_type == "reel":
            error_message = "❌ Video Too Long for Instagram Reel"
            hint_message = (
                "📌 Solution: Your video exceeds the 90-second limit for Instagram Reels. "
                "Please select 'Feed Post' instead to post this video. "
                "Feed posts automatically use IGTV for longer videos."
            )
        elif post_type == "feed":
            error_message = "❌ Video Duration Issue"
            hint_message = (
                "📌 The video couldn't be posted. This might be due to Instagram's processing limits. "
                "Try generating a shorter video (under 60 seconds for regular feed posts)."
            )
        else:
            error_message = "❌ Video Duration Not Acceptable"
            hint_message = (
                "📌 Instagram Reels: 3-90 seconds | Feed Posts: 3-60 seconds (IGTV for longer). "
                "Please adjust your video duration or post type."
            )
        return error_message, hint_message

    return "", ""


def post_video_to_instagram_instagrapi(video_file_path: str, caption: str, user_id: str = None, post_type: str = "reel") -> dict:
    """
    Post a video to Instagram using instagrapi (direct Instagram API)

    Args:
        video_file_path: Local file path to the video
        caption: Post caption/description
        user_id: User ID for fetching credentials from integrations
        post_type: Type of post - 'reel' for Instagram Reels or 'feed' for regular feed post

    Returns:
        dict with success status and details
    """
    try:
        from instagrapi import Client

        print("📸 Starting Instagram upload using instagrapi...")

        # Resolve credentials
        username, password = _resolve_instagrapi_credentials(user_id)
        if not username or not password:
            return {
                "success": False,
                "error": "Instagram credentials not configured",
                "hint": (
                    "Please configure Instagram integration in the Integrations tab "
                    "or set INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD in .env"
                )
            }

        # Validate file exists
        if not os.path.exists(video_file_path):
            return {
                "success": False,
                "error": f"Video file not found: {video_file_path}"
            }

        # Validate video duration
        duration_result = _validate_video_duration(video_file_path, post_type)
        if isinstance(duration_result, dict) and duration_result.get("_error"):
            result = dict(duration_result)
            result.pop("_error", None)
            return result
        duration = duration_result  # float or None

        # Login
        print("🔐 Logging into Instagram...")
        cl = Client()
        cl.login(username, password)
        print("✅ Logged in successfully!")

        # Upload
        print(f"⏫ Uploading video: {video_file_path}")
        print(f"📝 Caption: {caption}")
        print(f"📱 Post Type: {post_type}")
        if duration:
            print(f"📏 Video Duration: {duration:.2f} seconds")

        try:
            if post_type == "reel":
                print("📸 Uploading as Instagram Reel (clip format)...")
                media = cl.clip_upload(path=video_file_path, caption=caption)
                print("🎉 Instagram Reel uploaded successfully!")
            else:
                media = _upload_feed_video(cl, video_file_path, caption, duration)

            post_type_display = "Reel" if post_type == "reel" else "Feed Post"
            return {
                "success": True,
                "media_pk": str(media.pk),
                "media_id": str(media.id),
                "code": media.code,
                "message": f"Video successfully posted to Instagram as {post_type_display}!",
                "url": f"https://www.instagram.com/p/{media.code}/",
                "platform": "Instagram",
                "post_type": post_type
            }

        except Exception as upload_error:
            error_str = str(upload_error)

            # Handle validation errors gracefully (instagrapi sometimes throws these even on success)
            if "validation errors for Media" in error_str:
                print("⚠️ Video uploaded successfully but encountered a minor validation error.")
                return {
                    "success": True,
                    "message": "Video uploaded successfully (with minor validation warning)",
                    "warning": error_str,
                    "platform": "Instagram"
                }

            error_message, hint_message = _classify_upload_error(error_str, post_type)
            if error_message:
                return {
                    "success": False,
                    "error": error_message,
                    "details": error_str,
                    "hint": hint_message,
                    "platform": "Instagram",
                    "post_type": post_type
                }

            raise upload_error

    except Exception as e:
        print(f"❌ Instagram upload error: {e}")
        traceback.print_exc()
        return {
            "success": False,
            "error": f"Instagram upload failed: {str(e)}",
            "platform": "Instagram"
        }
