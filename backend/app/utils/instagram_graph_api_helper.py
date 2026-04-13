import logging
"""
Instagram Graph API Helper - Official Instagram Business API
Uses Instagram Graph API for reliable, production-ready posting
"""
import os
import time
import traceback
import requests
from typing import Dict, Any, Optional, Tuple

from utils.integrations_service import integrations_service
logger = logging.getLogger(__name__)

_UNKNOWN_ERROR = "Unknown error"



def _resolve_instagram_credentials(user_id: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """Return (access_token, instagram_account_id).
    The returned access_token is a Page access token when possible — required
    for the Instagram Content Publishing API with Facebook Login.
    """
    if user_id:
        integration = integrations_service.get_integration(user_id, "instagram", decrypt=True)
        if integration and integration.get("is_connected"):
            credentials = integration.get("credentials", {})
            user_token = credentials.get("accessToken", "").strip()
            instagram_account_id = credentials.get("instagramAccountId", "").strip()
            logger.debug(f"✅ Using Instagram Graph API credentials for user: {user_id}")
            return user_token, instagram_account_id
        logger.debug(f"❌ Instagram integration not configured for user: {user_id}")
        return None, None

    logger.debug("⚠️  No user_id provided, checking environment variables...")
    return os.getenv("INSTAGRAM_ACCESS_TOKEN"), os.getenv("INSTAGRAM_ACCOUNT_ID")


def _probe_video(input_path: str, ffmpeg_exe: str) -> dict:
    """Run ffprobe and return stream info dict with keys: has_audio, duration, width, height."""
    import subprocess, json
    ffprobe_exe = ffmpeg_exe.replace("ffmpeg", "ffprobe")
    # ffprobe may not exist next to ffmpeg; fall back to ffprobe on PATH
    probe_cmd = [
        ffprobe_exe if os.path.exists(ffprobe_exe) else "ffprobe",
        "-v", "quiet", "-print_format", "json", "-show_streams", input_path,
    ]
    try:
        result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=30)
        data = json.loads(result.stdout)
        streams = data.get("streams", [])
        has_audio = any(s.get("codec_type") == "audio" for s in streams)
        video_stream = next((s for s in streams if s.get("codec_type") == "video"), {})
        duration = float(video_stream.get("duration", 0) or 0)
        width = int(video_stream.get("width", 0) or 0)
        height = int(video_stream.get("height", 0) or 0)
        logger.debug(f"🔍 Video probe: {width}x{height}, {duration:.1f}s, audio={has_audio}")
        return {"has_audio": has_audio, "duration": duration, "width": width, "height": height}
    except Exception as e:
        logger.debug(f"⚠️  ffprobe failed ({e}), assuming no audio")
        return {"has_audio": False, "duration": 0, "width": 0, "height": 0}


def _transcode_for_instagram(input_path: str) -> str:
    """
    Single-pass transcode to meet all Instagram Reels requirements:
    - Portrait 1080x1920 (9:16), padded with black bars
    - H.264 High profile, yuv420p, constant 30fps, faststart
    - Stereo AAC 44100 Hz; silent track added if source has no audio
      (Instagram Reels rejects videos without audio — error 2207076)
    Returns path to the transcoded file.
    """
    import subprocess
    import tempfile
    import imageio_ffmpeg
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    tmp_fd, output_path = tempfile.mkstemp(suffix=".mp4", prefix="ig_transcode_")
    os.close(tmp_fd)

    info = _probe_video(input_path, ffmpeg_exe)

    # Scale to fit inside 1080x1920, pad remainder with black, force even dimensions
    portrait_vf = (
        "scale=1080:1920:force_original_aspect_ratio=decrease,"
        "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,"
        "setsar=1"
    )
    video_flags = [
        "-vf", portrait_vf,
        "-c:v", "libx264", "-profile:v", "high", "-level", "4.0",
        "-pix_fmt", "yuv420p",
        "-vsync", "cfr", "-r", "30",   # force constant 30fps (VFR causes 2207076)
        "-preset", "fast", "-crf", "23",
    ]
    audio_flags = [
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
        "-ac", "2",   # force stereo — Instagram Reels rejects mono AAC
    ]

    if info["has_audio"]:
        cmd = [
            ffmpeg_exe, "-y", "-i", input_path,
            *video_flags, *audio_flags,
            "-movflags", "+faststart",
            output_path,
        ]
    else:
        logger.debug("⚠️  No audio track detected — adding silent stereo audio for Instagram Reels")
        cmd = [
            ffmpeg_exe, "-y",
            "-i", input_path,
            "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
            *video_flags, *audio_flags,
            "-shortest",
            "-movflags", "+faststart",
            output_path,
        ]

    success = False
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg transcoding failed: {result.stderr[-500:]}")
        logger.debug(f"✅ Transcoded for Instagram (portrait 1080x1920): {output_path}")
        success = True
        return output_path
    finally:
        if not success and os.path.exists(output_path):
            os.remove(output_path)


def _upload_to_s3_and_presign(local_path: str) -> str:
    """
    Upload transcoded video to S3 and return a presigned URL valid for 1 hour.
    Presigned URLs bypass CloudFront and are always reachable by Instagram.
    """
    import uuid
    import boto3
    ak = os.getenv("AWS_ACCESS_KEY_ID", "")
    sk = os.getenv("AWS_SECRET_ACCESS_KEY", "")
    region = os.getenv("AWS_REGION", "us-east-1")
    bucket = os.getenv("AWS_S3_BUCKET", "")

    if not ak or not sk:
        raise RuntimeError("AWS credentials not configured (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)")
    if not bucket:
        raise RuntimeError("AWS_S3_BUCKET not configured")

    s3 = boto3.client("s3", aws_access_key_id=ak, aws_secret_access_key=sk, region_name=region)
    key = f"videos/ig_upload_{uuid.uuid4().hex}.mp4"
    s3.upload_file(local_path, bucket, key, ExtraArgs={"ContentType": "video/mp4"})
    logger.debug(f"☁️  Uploaded to S3: {key}")

    presigned_url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=3600,
    )
    logger.debug("✅ Presigned URL generated")
    return presigned_url


def _create_container(
    video_url: str,
    caption: str,
    instagram_account_id: str,
    access_token: str,
) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    """Create the Instagram media container. Returns (creation_id, error_dict)."""
    container_url = f"https://graph.facebook.com/v25.0/{instagram_account_id}/media"
    response = requests.post(
        container_url,
        params={"access_token": access_token},
        json={
            "media_type": "REELS",
            "video_url": video_url,
            "caption": caption,
            "share_to_feed": True,
        },
        timeout=30,
    )
    if response.status_code != 200:
        error_data = response.json()
        error_message = error_data.get("error", {}).get("message", _UNKNOWN_ERROR)
        error_code = error_data.get("error", {}).get("code", "N/A")
        logger.debug(f"❌ Failed to create container: {error_message}")
        return None, {
            "success": False,
            "error": f"Failed to create Instagram media container: {error_message}",
            "error_code": error_code,
            "hint": "Check that your access token is valid and has instagram_content_publish permission",
            "platform": "Instagram",
        }
    creation_id = response.json().get("id")
    if not creation_id:
        return None, {"success": False, "error": "No creation ID returned from Instagram", "platform": "Instagram"}
    logger.debug(f"✅ Container created: {creation_id}")
    return creation_id, None


def _wait_for_processing(
    creation_id: Optional[str],
    access_token: str,
    max_attempts: int = 60,
) -> bool:
    """Poll until FINISHED. Returns True on success, False on timeout. Raises RuntimeError on ERROR."""
    status_url = f"https://graph.facebook.com/v25.0/{creation_id}"
    status_params = {"fields": "status_code,status", "access_token": access_token}

    for attempt in range(1, max_attempts + 1):
        time.sleep(5)
        status_response = requests.get(status_url, params=status_params, timeout=10)
        if status_response.status_code == 200:
            status_data = status_response.json()
            status_code = status_data.get("status_code")
            status_message = status_data.get("status", "UNKNOWN")
            logger.debug(f"⏳ Attempt {attempt}/{max_attempts}: Status = {status_message}")
            if status_code == "FINISHED":
                logger.debug("✅ Video processing complete!")
                return True
            if status_code == "ERROR":
                raise RuntimeError(f"Instagram video processing failed: {status_message}")
        else:
            logger.debug(f"⚠️  Status check failed: {status_response.status_code}")

    return False


def _publish_container(
    creation_id: Optional[str],
    instagram_account_id: str,
    access_token: str,
) -> Dict[str, Any]:
    """Publish the container and return the result dict."""
    publish_url = f"https://graph.facebook.com/v25.0/{instagram_account_id}/media_publish"
    response = requests.post(
        publish_url,
        params={"access_token": access_token},
        json={"creation_id": creation_id},
        timeout=30,
    )
    if response.status_code != 200:
        error_message = response.json().get("error", {}).get("message", _UNKNOWN_ERROR)
        return {
            "success": False,
            "error": f"Failed to publish to Instagram: {error_message}",
            "hint": "Check your Instagram account permissions and try again",
            "platform": "Instagram",
        }
    media_id: str = response.json().get("id", "")
    logger.debug("🎉 Instagram post published successfully!")
    permalink = _fetch_permalink(media_id, access_token)
    return {
        "success": True,
        "media_id": media_id,
        "creation_id": creation_id,
        "message": "Video successfully posted to Instagram as Reel!",
        "url": permalink,
        "platform": "Instagram",
        "post_type": "reel",
    }


def _fetch_permalink(media_id: str, access_token: str) -> Optional[str]:
    """Fetch the permalink for a published Instagram media object."""
    try:
        permalink_response = requests.get(
            f"https://graph.facebook.com/v25.0/{media_id}",
            params={"fields": "permalink", "access_token": access_token},
            timeout=10,
        )
        if permalink_response.status_code == 200:
            permalink = permalink_response.json().get("permalink")
            logger.debug(f"🔗 Permalink: {permalink}")
            return permalink
    except Exception as e:
        logger.debug(f"⚠️  Could not fetch permalink: {e}")
    return None


def post_video_to_instagram_graph_api(
    local_path: str,
    caption: str,
    user_id: str | None = None,
) -> Dict[str, Any]:
    """
    Post a video to Instagram as a Reel.
    local_path: local file path to the video.
    Pipeline: transcode (yuv420p/H.264) → upload to S3 → presigned URL → Instagram container → publish.
    """
    transcode_path = None
    try:
        logger.debug("📸 Starting Instagram upload using Graph API...")

        access_token, instagram_account_id = _resolve_instagram_credentials(user_id)
        if not access_token or not instagram_account_id:
            return {
                "success": False,
                "error": "Instagram Graph API credentials not configured",
                "hint": "Please configure Instagram integration in the Integrations tab",
                "platform": "Instagram",
            }

        logger.debug(f"📹 Local file: {local_path}\n📝 Caption: {caption}")

        # Step 1: Transcode to Instagram-compatible format
        logger.debug("\n🔄 Step 1: Transcoding video for Instagram...")
        transcode_path = _transcode_for_instagram(local_path)

        # Step 2: Upload to S3 and get presigned URL
        logger.debug("\n🔄 Step 2: Uploading to S3 and generating presigned URL...")
        video_url = _upload_to_s3_and_presign(transcode_path)

        # Step 3: Create media container
        logger.debug("\n🔄 Step 3: Creating media container...")
        creation_id, container_err = _create_container(video_url, caption, instagram_account_id, access_token)
        if container_err:
            return container_err

        # Step 4: Wait for video processing
        logger.debug("\n🔄 Step 4: Waiting for video processing...")
        try:
            finished = _wait_for_processing(creation_id, access_token)
        except RuntimeError as processing_error:
            return {
                "success": False,
                "error": str(processing_error),
                "hint": "Check video format: H.264 codec, AAC audio, MP4, 3-90 s, 23-60 fps.",
                "platform": "Instagram",
            }

        if not finished:
            return {
                "success": False,
                "error": "Video processing timeout.",
                "hint": "The video may still be published. Check your Instagram account in a few minutes.",
                "platform": "Instagram",
            }

        # Step 5: Publish
        logger.debug("\n🔄 Step 5: Publishing to Instagram...")
        return _publish_container(creation_id, instagram_account_id, access_token)

    except requests.exceptions.Timeout:
        logger.debug("❌ Instagram API timeout")
        return {
            "success": False,
            "error": "Instagram API request timed out",
            "hint": "The request took too long. Please try again.",
            "platform": "Instagram",
        }
    except requests.exceptions.RequestException as e:
        logger.debug(f"❌ Instagram API request error: {e}")
        return {"success": False, "error": f"Instagram API request failed: {str(e)}", "platform": "Instagram"}
    except Exception as e:
        logger.debug(f"❌ Instagram upload error: {e}")
        traceback.print_exc()
        return {"success": False, "error": f"Instagram upload failed: {str(e)}", "platform": "Instagram"}
    finally:
        # Clean up transcoded temp file
        if transcode_path and os.path.exists(transcode_path):
            try:
                os.remove(transcode_path)
            except Exception:
                pass
