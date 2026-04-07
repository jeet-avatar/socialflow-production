"""
Content Generation Routes (Root Level)
These endpoints maintain backward compatibility with frontend
"""

import asyncio
import io
import os
import re
import shutil
import tempfile
import time
import urllib.request

import anyio
import boto3
import httpx
import requests as http_requests
from fastapi import APIRouter, Depends, HTTPException, Header, Request, UploadFile, File
from typing import Annotated, Optional
import logging

from services.email_sender import send_video_email
from utils.campaigns_service import campaigns_service
from utils.fb_post_helper import post_video_to_facebook as _fb_post_helper
from utils.ig_post import post_reel as _ig_post_reel  # kept for direct URL path
from utils.instagram_graph_api_helper import post_video_to_instagram_graph_api as _ig_graph_post
from utils.integrations_service import integrations_service as _integrations_service
from utils.integrations_service import integrations_service
from utils.linkedin_post_helper import post_video_to_linkedin
from utils.middleware.auth_middleware import auth_middleware
from utils.mongodb_service import mongodb_service
from utils.personalised_message import (
    generate_intelligent_prompt_from_company_data,
    generate_marketing_package,
)
from utils.scene_descriptor_agent import generate_video_concept, build_user_message, SYSTEM_PROMPT
from utils.subscription_service import subscription_service
from utils.user_service import user_service
from utils.video import generate_video
from utils.videos_service import videos_service
from utils.youtube_post_helper import post_video_to_youtube

logger = logging.getLogger(__name__)

# No prefix - these are at root level for backward compatibility
router = APIRouter(tags=["content-generation"])

# ---------------------------------------------------------------------------
# String constants (S1192)
# ---------------------------------------------------------------------------
_AUTH_REQUIRED = "Authentication required"
_TOKEN_INVALID = "Invalid or expired token"
_DIALOGUE_REQUIRED = "dialogue is required"
_VIDEO_URL_REQUIRED = "video_url is required"
_COMPANY_NAME_PLACEHOLDER = "[company_name]"
_DEFAULT_BGM = "https://d2nbx2qjod9qta.cloudfront.net/background_music.mp3"
_DEFAULT_TEMPLATE = "https://d2nbx2qjod9qta.cloudfront.net/redbg.mp4"
_CLOUDFRONT_DOMAIN = "d2nbx2qjod9qta.cloudfront.net"
_STATIC_PATH = "/static/"
_S3_AMAZONAWS = "s3.amazonaws.com"
_CLOUDFRONT_NET = "cloudfront.net"
_LEGACY_IP = "http://54.81.246.138/"
_FRONTEND_URL_DEFAULT = "https://socialflow.network"
_AWS_CREDS_MISSING = "AWS credentials not configured"
_CLOUDFRONT_HINT = "Make sure the CloudFront URL is publicly accessible"
_VIDEO_URL_HINT = "Video must be from socialflow.network, static folder, or CloudFront"
_DEFAULT_BUCKET = "socialflow-demo-bucket"
_DEFAULT_CF_DOMAIN = "d2nbx2qjod9qta.cloudfront.net"
_HTTPS_PREFIX = "https://"
_HTTP_PREFIX = "http://"
_AUDIO_MPEG = "audio/mpeg"
_LIMIT_REACHED_MSG = "You have reached your video generation limit for this month."
_UPGRADE_MSG = "Upgrade to Professional plan for unlimited video generation!"
_LOG_ANALYZE = "[Remotion/Analyze]"
_LOG_REMOTION = "[Remotion]"

# ── In-memory render-progress store (keyed by job_id) ──────────────────────
_progress_store: dict[str, dict] = {}


def _set_progress(job_id: str, percent: int, stage: str, detail: str = "") -> None:
    """Update progress for a render job. No-op if job_id is empty."""
    if not job_id:
        return
    _progress_store[job_id] = {"percent": percent, "stage": stage, "detail": detail, "ts": time.time()}


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------

def get_current_user(authorization: Annotated[Optional[str], Header()] = None) -> dict:
    """Dependency to get current authenticated user."""
    if not authorization:
        raise HTTPException(status_code=401, detail=_AUTH_REQUIRED)
    user_info = auth_middleware.verify_token(authorization)
    if not user_info:
        raise HTTPException(status_code=401, detail=_TOKEN_INVALID)
    return user_info


CurrentUser = Annotated[dict, Depends(get_current_user)]


# ---------------------------------------------------------------------------
# Voice preview cache (fetched once from ElevenLabs)
# ---------------------------------------------------------------------------
_voice_preview_cache: dict[str, str] = {}


@router.get("/voice-previews")
async def get_voice_previews(user_info: CurrentUser):
    """Return ElevenLabs voice preview URLs (cached after first fetch)."""
    if _voice_preview_cache:
        return {"previews": _voice_preview_cache}

    api_key = os.getenv("ELEVENLABS_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="ElevenLabs API key not configured")

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://api.elevenlabs.io/v1/voices",
                headers={"xi-api-key": api_key},
            )
            resp.raise_for_status()
            data = resp.json()

        for voice in data.get("voices", []):
            vid = voice.get("voice_id", "")
            preview = voice.get("preview_url", "")
            if vid and preview:
                _voice_preview_cache[vid] = preview

        logger.info("Cached %d ElevenLabs voice previews", len(_voice_preview_cache))
        return {"previews": _voice_preview_cache}
    except Exception as e:
        logger.error("Failed to fetch voice previews: %s", e)
        raise HTTPException(status_code=502, detail="Could not fetch voice previews") from e


def _resolve_video_to_local_path(video_url: str, tmp_prefix: str = "video_upload_") -> tuple:
    """
    Resolve a video URL to a local file path.
    Returns (local_path, is_temp_file).
    Raises ValueError if the URL format is unsupported.
    Downloads S3/CloudFront URLs to a temp file.
    """
    if _LEGACY_IP in video_url:
        return video_url.replace(_LEGACY_IP, ""), False
    if _STATIC_PATH in video_url:
        return f"static/{video_url.split(_STATIC_PATH)[1]}", False
    if _CLOUDFRONT_NET in video_url or _S3_AMAZONAWS in video_url:
        response = http_requests.get(video_url, stream=True, timeout=60)
        response.raise_for_status()
        tmp_fd, local_path = tempfile.mkstemp(suffix=".mp4", prefix=tmp_prefix)
        os.close(tmp_fd)
        with open(local_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        logger.info(f"Downloaded video to temp file: {local_path}")
        return local_path, True
    raise ValueError(f"Unsupported video URL format: {video_url}")


def _cleanup_temp(local_path: str, is_temp: bool) -> None:
    if is_temp and local_path and os.path.exists(local_path):
        try:
            os.remove(local_path)
        except OSError:
            pass


def _transcode_to_portrait(input_path: str) -> str:
    """
    Convert a landscape video to 1080x1920 portrait (9:16) for Instagram Reels.
    Pads with black bars, re-encodes to H.264 + AAC, returns path to the new file.
    """
    import subprocess
    import imageio_ffmpeg
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    tmp_fd, output_path = tempfile.mkstemp(suffix=".mp4", prefix="ig_portrait_")
    os.close(tmp_fd)
    cmd = [
        ffmpeg_exe, "-y", "-i", input_path,
        # Scale to fit inside 1080x1920, pad remainder with black, force even dimensions
        "-vf", (
            "scale=1080:1920:force_original_aspect_ratio=decrease,"
            "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,"
            "setsar=1"
        ),
        "-c:v", "libx264",
        "-profile:v", "high",        # Instagram accepts High profile
        "-level", "4.0",
        "-pix_fmt", "yuv420p",       # REQUIRED by Instagram — rejects other pixel formats
        "-preset", "fast",
        "-crf", "23",
        "-r", "30",                  # Fixed 30 fps — Instagram: 23–60 fps allowed
        "-c:a", "aac",
        "-b:a", "128k",
        "-ar", "44100",              # Standard audio sample rate
        "-movflags", "+faststart",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg transcoding failed: {result.stderr[-500:]}")
    logger.info(f"📐 Transcoded to portrait: {output_path}")
    return output_path


def _upload_portrait_to_s3(local_path: str) -> str:
    """Upload a portrait video to S3, verify it is publicly reachable, and return the CloudFront URL."""
    import uuid
    ak = os.getenv("AWS_ACCESS_KEY_ID", "")
    sk = os.getenv("AWS_SECRET_ACCESS_KEY", "")
    region = os.getenv("AWS_REGION", "us-east-1")
    bucket = os.getenv("AWS_S3_BUCKET", _DEFAULT_BUCKET)
    cf_domain = os.getenv("CLOUDFRONT_DOMAIN", _DEFAULT_CF_DOMAIN)
    s3 = boto3.client("s3", aws_access_key_id=ak, aws_secret_access_key=sk, region_name=region)
    key = f"videos/ig_portrait_{uuid.uuid4().hex}.mp4"

    # Try public-read ACL first; fall back silently if bucket policy blocks it
    try:
        s3.upload_file(
            local_path, bucket, key,
            ExtraArgs={"ContentType": "video/mp4", "ACL": "public-read"},
        )
        logger.info("☁️  Uploaded with public-read ACL")
    except Exception as acl_err:
        logger.warning(f"⚠️  public-read ACL failed ({acl_err}), retrying without ACL...")
        s3.upload_file(local_path, bucket, key, ExtraArgs={"ContentType": "video/mp4"})

    portrait_url = f"https://{cf_domain}/{key}"

    # Wait for CloudFront propagation then verify reachability
    logger.info("⏳ Waiting for CloudFront propagation...")
    time.sleep(8)
    for attempt in range(1, 4):
        try:
            check = http_requests.head(portrait_url, timeout=10, allow_redirects=True)
            if check.status_code == 200:
                logger.info(f"✅ Portrait URL verified reachable: {portrait_url}")
                return portrait_url
            logger.warning(f"⚠️  URL check attempt {attempt}: HTTP {check.status_code}")
        except Exception as check_err:
            logger.warning(f"⚠️  URL check attempt {attempt} failed: {check_err}")
        time.sleep(5)

    # Return URL anyway — Instagram may still be able to reach it
    logger.warning(f"⚠️  Could not verify URL reachability from server, posting anyway: {portrait_url}")
    return portrait_url


def _make_presigned_s3_url(video_url: str, expiry: int = 3600) -> str:
    """
    Given a CloudFront or S3 URL, return a presigned S3 URL valid for `expiry` seconds.
    Instagram's servers can reliably download presigned S3 URLs.
    Falls back to the original URL if the key cannot be extracted or S3 creds are missing.
    """
    try:
        cf_domain = os.getenv("CLOUDFRONT_DOMAIN", _DEFAULT_CF_DOMAIN)
        bucket = os.getenv("AWS_S3_BUCKET", _DEFAULT_BUCKET)
        ak = os.getenv("AWS_ACCESS_KEY_ID", "")
        sk = os.getenv("AWS_SECRET_ACCESS_KEY", "")
        region = os.getenv("AWS_REGION", "us-east-1")

        if not ak or not sk:
            logger.warning("AWS creds missing — using original URL for Instagram")
            return video_url

        # Extract S3 key from CloudFront URL: https://<cf_domain>/<key>
        if cf_domain in video_url:
            key = video_url.split(cf_domain + "/", 1)[-1]
        elif _S3_AMAZONAWS in video_url:
            # https://bucket.s3.region.amazonaws.com/key  or  https://s3.amazonaws.com/bucket/key
            key = video_url.split(".amazonaws.com/", 1)[-1]
            if key.startswith(bucket + "/"):
                key = key[len(bucket) + 1:]
        else:
            logger.warning(f"Cannot extract S3 key from URL: {video_url} — using as-is")
            return video_url

        s3 = boto3.client("s3", aws_access_key_id=ak, aws_secret_access_key=sk, region_name=region)
        presigned = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=expiry,
        )
        logger.info(f"✅ Presigned S3 URL generated for key: {key}")
        return presigned
    except Exception as e:
        logger.warning(f"Could not generate presigned URL ({e}) — using original URL")
        return video_url


async def _write_temp_mp3(audio_bytes: bytes) -> str:
    """Write audio bytes to a temp .mp3 file asynchronously. Returns the file path."""
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".mp3", prefix="voiceover_")
    os.close(tmp_fd)
    async with await anyio.open_file(tmp_path, "wb") as f:
        await f.write(audio_bytes)
    return tmp_path


def merge_subtitle_segments(
    segments: list,
    min_duration: float = 4.5,
    max_duration: float = 6.0,
) -> list:
    """
    Merge Whisper micro-segments into sentence-level chunks.

    Whisper splits audio into tiny pieces (0.3–1s each). We merge them into
    4.5–6s chunks → 3 scenes for a 15s video.

    Rules:
    - Always merge if combined duration < min_duration
    - Break on sentence boundary (. ? !) IF duration >= min_duration
    - Always break if adding another seg would exceed max_duration
    """
    if not segments:
        return segments

    merged = []
    current = {**segments[0], "text": segments[0]["text"].strip()}

    for seg in segments[1:]:
        seg_text = seg["text"].strip()
        combined_dur = seg["end"] - current["start"]
        ends_sentence = current["text"].rstrip().endswith((".", "?", "!"))

        if combined_dur > max_duration or (ends_sentence and combined_dur >= min_duration):
            merged.append(current)
            current = {**seg, "text": seg_text}
        else:
            current = {**current, "text": current["text"] + " " + seg_text, "end": seg["end"]}

    merged.append(current)
    logger.info(f"[merge_segments] {len(segments)} Whisper segments → {len(merged)} scene chunks")
    return merged

_LOGO_PLACEHOLDERS = (
    "https://img.freepik.com/premium-vector/abstract-logo-design",
    "https://media.licdn.com/dms/image/v2/C510BAQFXdme9gsMwUg",
)


def _is_placeholder_logo(url: str) -> bool:
    return any(url.startswith(p) for p in _LOGO_PLACEHOLDERS)


def _logo_from_company_intelligence(user_id: str, company_name: str) -> str:
    """Look up client logo from the companies collection."""
    try:
        company_doc = mongodb_service.get_company_by_name(company_name, user_id=user_id)
        if company_doc:
            logo = (
                company_doc.get('company', {}).get('logo_url', '') or
                company_doc.get('logo_url', '')
            )
            if logo:
                logger.info(f"[Logos] Client logo from company intelligence: {logo}")
            return logo
    except Exception as e:
        logger.warning(f"[Logos] Company lookup failed: {e}")
    return ""


def _logo_from_campaigns(user_id: str, company_name: str) -> str:
    """Look up client logo from the campaigns collection."""
    try:
        campaigns = campaigns_service.search_campaigns(user_id, company_name, limit=1)
        if campaigns:
            logo = campaigns[0].get('logo_url', '')
            if logo:
                logger.info(f"[Logos] Client logo from campaigns: {logo}")
            return logo
    except Exception as e:
        logger.warning(f"[Logos] Campaign lookup failed: {e}")
    return ""


def _resolve_client_logo(user_id: str, company_name: str, explicit_logo: str) -> str:
    """Resolve client logo: explicit param → company intelligence → campaigns → ''."""
    client_logo = "" if _is_placeholder_logo(explicit_logo) else (explicit_logo or "")
    if not client_logo and company_name:
        client_logo = _logo_from_company_intelligence(user_id, company_name)
    if not client_logo and company_name:
        client_logo = _logo_from_campaigns(user_id, company_name)
    return client_logo


def _resolve_user_logo_and_sender(user_id: str, explicit_logo: str) -> tuple:
    """Resolve user logo and sender name from user profile. Returns (user_logo, sender_name)."""
    user_logo = "" if _is_placeholder_logo(explicit_logo) else (explicit_logo or "")
    sender_name = ""
    if not user_id:
        return user_logo, sender_name
    try:
        user_doc = user_service.get_user_by_supabase_id(user_id)
        if not user_doc:
            return user_logo, sender_name
        sender_identity = user_doc.get('sender_identity', {}) or {}
        if not user_logo:
            user_logo = (
                sender_identity.get('company_logo_url', '') or
                user_doc.get('avatar_url', '')
            )
            if user_logo:
                logger.info(f"[Logos] User logo from profile: {user_logo}")
        sender_name = (
            sender_identity.get('company_name', '') or
            sender_identity.get('name', '') or
            user_doc.get('company_name', '') or
            ""
        )
        if sender_name:
            logger.info(f"[Logos] Sender name: {sender_name}")
    except Exception as e:
        logger.warning(f"[Logos] User profile lookup failed: {e}")
    return user_logo, sender_name


def _resolve_video_logos(
    user_id: str,
    company_name: str,
    explicit_client_logo: str,
    explicit_user_logo: str,
) -> tuple:
    """
    Resolve client logo, user logo, and sender company name.

    Returns: (client_logo_url, user_logo_url, sender_name)
    """
    client_logo = _resolve_client_logo(user_id, company_name, explicit_client_logo)
    user_logo, sender_name = _resolve_user_logo_and_sender(user_id, explicit_user_logo)
    return client_logo, user_logo, sender_name


def _extract_logo_dominant_color(logo_url: str) -> str:
    """
    Extract the dominant brand color from a logo image URL.
    Returns a hex string like '#4f9eff', or '' on failure.
    Filters out near-white and near-black pixels so we get the actual brand accent.
    """
    try:
        from PIL import Image

        resp = http_requests.get(logo_url, timeout=5)
        resp.raise_for_status()
        img = Image.open(io.BytesIO(resp.content)).convert("RGB").resize((60, 60))
        pixels = list(img.getdata())

        # Keep only chromatically interesting pixels (not near-white or near-black)
        meaningful = [
            (r, g, b) for r, g, b in pixels
            if not (r > 220 and g > 220 and b > 220)   # exclude near-white
            and not (r < 30 and g < 30 and b < 30)     # exclude near-black
            and max(r, g, b) - min(r, g, b) > 30       # exclude near-grey
        ]
        if not meaningful:
            return ""

        avg_r = sum(p[0] for p in meaningful) // len(meaningful)
        avg_g = sum(p[1] for p in meaningful) // len(meaningful)
        avg_b = sum(p[2] for p in meaningful) // len(meaningful)

        # Boost saturation so it reads as a vibrant accent
        max_c = max(avg_r, avg_g, avg_b)
        if max_c > 0:
            factor = min(255 / max_c, 1.4)
            avg_r = min(255, int(avg_r * factor))
            avg_g = min(255, int(avg_g * factor))
            avg_b = min(255, int(avg_b * factor))

        color = f"#{avg_r:02x}{avg_g:02x}{avg_b:02x}"
        logger.info(f"[LogoColor] Extracted dominant color from logo: {color}")
        return color
    except Exception as exc:
        logger.warning(f"[LogoColor] Failed to extract color from {logo_url}: {exc}")
        return ""


def _fetch_company_news_hook(company_name: str) -> str:
    """
    Fetch the latest news headline for the prospect company via DuckDuckGo.
    Returns a short headline string or '' if nothing useful is found.
    """
    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            results = list(ddgs.news(f'"{company_name}" latest 2024 2025', max_results=5))
        for r in results:
            title = (r.get("title") or "").strip()
            # Skip if it looks like a generic/irrelevant result
            if company_name.lower().split()[0] in title.lower() and len(title) > 15:
                # Trim to a punchy ~60-char snippet
                return title[:72]
        return ""
    except Exception as exc:
        logger.warning(f"[NewsHook] DuckDuckGo search failed for '{company_name}': {exc}")
        return ""


def _generate_scene_dalle_backgrounds(
    scene_descriptors: list,
    openai_api_key: str,
    s3_client=None,
    bucket_name: str = "",
    cloudfront_domain: str = "",
    on_scene_done=None,
) -> list:
    """
    Generate a DALL-E 3 cinematic background image for each scene descriptor.
    URLs are uploaded to S3 if credentials are provided (DALL-E URLs expire after 1h).
    Returns the scene_descriptors list with 'background_image_url' injected.
    """
    if not openai_api_key:
        return scene_descriptors

    from concurrent.futures import ThreadPoolExecutor, as_completed
    from openai import OpenAI

    client = OpenAI(api_key=openai_api_key)
    MAX_SCENES = 8  # cap to keep total latency reasonable

    def _gen_one(idx: int, scene: dict) -> tuple:
        headline = scene.get("headline", "").title()
        template = scene.get("template", "")
        accent   = scene.get("accent_color", "#4f9eff")
        mood_map = {
            "GlitchReveal": "glitchy digital interference, RGB channel split",
            "DataStream": "matrix-like cascading data streams, neon green on black",
            "ElectricPulse": "radial electric discharge, lightning bolts converging at centre",
            "ZoomPunch": "explosive radial motion blur, extreme kinetic energy",
            "HorizontalSlam": "horizontal velocity streaks, speed lines",
            "CinematicBars": "sweeping cinematic landscape, anamorphic lens flare",
            "ChromaSlice": "bold diagonal colour streak slicing across a dark void",
            "SplitReveal": "two worlds separating at a glowing seam, cinematic crack",
            "GravityDrop": "objects falling through dark space with motion trails",
            "TypeBurn": "burning text embers, glowing monospace characters on black",
            "WordBurst": "massive explosive shockwave radiating outward from centre",
            "StatShot": "concentric data rings pulsing with energy",
        }
        visual_note = mood_map.get(template, "abstract flowing energy waves")
        prompt = (
            f"Cinematic dark abstract background for a B2B marketing video. "
            f"Visual style: {visual_note}. "
            f"Theme: {headline}. "
            f"Dominant accent colour glow: {accent}. "
            f"Deep dark background (near-black), ultra-wide composition, "
            f"no text, no logos, no people, photorealistic or high-quality CGI, "
            f"16:9 aspect ratio, professional grade."
        )
        try:
            response = client.images.generate(
                model="dall-e-3",
                prompt=prompt,
                size="1792x1024",
                quality="standard",
                n=1,
            )
            dalle_url = response.data[0].url

            # Upload to S3 for a permanent URL (DALL-E URLs expire in 1h)
            if s3_client and bucket_name:
                tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
                urllib.request.urlretrieve(dalle_url, tmp.name)
                tmp.close()
                s3_key = f"scene-bg/bg_{int(time.time())}_{idx}.jpg"
                s3_client.upload_file(tmp.name, bucket_name, s3_key, ExtraArgs={"ContentType": "image/jpeg"})
                os.unlink(tmp.name)
                permanent_url = f"https://{cloudfront_domain}/{s3_key}"
            else:
                permanent_url = dalle_url  # use DALL-E URL directly (valid for ~1h)

            logger.info(f"[DALLE] Scene {idx} background: {permanent_url[:60]}...")
            return idx, permanent_url
        except Exception as exc:
            logger.warning(f"[DALLE] Scene {idx} background generation failed: {exc}")
            return idx, ""

    updated = list(scene_descriptors)
    total = min(len(updated), MAX_SCENES)
    completed = 0
    futures_map = {}
    with ThreadPoolExecutor(max_workers=4) as executor:
        for i, scene in enumerate(updated[:MAX_SCENES]):
            futures_map[executor.submit(_gen_one, i, scene)] = i
        for future in as_completed(futures_map):
            idx, url = future.result()
            completed += 1
            if on_scene_done:
                on_scene_done(completed, total)
            if url:
                updated[idx] = dict(updated[idx])
                updated[idx]["background_image_url"] = url

    return updated


def _generate_scene_veo3_clips(
    scene_descriptors: list,
    fal_api_key: str,
    s3_client=None,
    bucket_name: str = "",
    cloudfront_domain: str = "",
    on_scene_done=None,
    dialogue: str = "",
    sender_name: str = "",
    company_name: str = "",
    openai_api_key: str = "",
    fal_model: str = "",
    clip_duration: int = 5,
) -> list:
    """
    Generate a cinematic video clip for each scene descriptor using fal.ai (Kling).
    Clips are uploaded to S3. Returns scene_descriptors with 'background_video_url' injected.
    Falls back gracefully per-scene on error (max 3 retries per clip).
    """
    FAL_MODEL  = fal_model or "fal-ai/kling-video/v1.6/standard/text-to-video"
    MAX_SCENES = 6

    # Real API calls require a valid key — exit cleanly if missing
    if not fal_api_key or fal_api_key == "test-mode":
        logger.warning("[FAL] No FAL_API_KEY set and test mode is OFF — skipping AI clip generation")
        return scene_descriptors

    MAX_RETRIES = 3
    POLL_INTERVAL = 8   # seconds between status polls
    MAX_POLLS = 75      # 75 × 8s = 10 min per clip max

    mood_map = {
        "GlitchReveal":    "glitchy digital interference, RGB channel split, cyberpunk dark",
        "DataStream":      "matrix-like cascading data streams, neon green on near-black",
        "ElectricPulse":   "radial electric discharge, lightning bolts converging at centre",
        "ZoomPunch":       "explosive radial motion blur, extreme kinetic energy, dark void",
        "HorizontalSlam":  "horizontal velocity streaks, dramatic speed lines, dark background",
        "CinematicBars":   "sweeping cinematic landscape, anamorphic lens flare, widescreen",
        "ChromaSlice":     "bold diagonal colour streak slicing across a dark void",
        "SplitReveal":     "two glowing worlds separating at a seam, cinematic crack",
        "GravityDrop":     "objects falling through dark space with glowing motion trails",
        "TypeBurn":        "burning embers, glowing monospace characters fading on black",
        "WordBurst":       "massive shockwave radiating outward from centre, dark background",
        "StatShot":        "concentric energy rings pulsing with data, dark tech aesthetic",
    }

    headers = {"Authorization": f"Key {fal_api_key}", "Content-Type": "application/json"}

    def _gen_one(idx: int, scene: dict) -> tuple:
        accent = scene.get("accent_color", "#4f9eff")
        # Use user-edited video_prompt if available
        if scene.get("video_prompt"):
            prompt = scene["video_prompt"]
            logger.info(f"[FAL] Scene {idx} using user-edited prompt: {prompt[:80]}…")
        elif idx == 0 and dialogue:
            prompt = _build_smart_veo_prompt(dialogue, sender_name, company_name, openai_api_key)
            logger.info(f"[FAL] Scene 0 smart prompt: {prompt[:80]}…")
        else:
            headline = scene.get("headline", "").title()
            template = scene.get("template", "")
            visual   = mood_map.get(template, "abstract dark energy waves, cinematic motion")
            prompt = (
                f"Cinematic abstract background video for a B2B marketing presentation. "
                f"Visual style: {visual}. Theme: {headline}. Accent color glow: {accent}. "
                f"Deep dark background (near-black), ultra-wide, no text, no logos, no people, "
                f"seamless ambient motion, professional high-quality CGI."
            )

        # Prefer per-scene target duration (set by frontend/backend), fall back to global clip_duration.
        dur_seconds = (
            scene.get("target_clip_duration_seconds")
            or scene.get("duration_seconds")
            or clip_duration
            or 5
        )
        try:
            dur_seconds_num = float(dur_seconds)
        except Exception:
            dur_seconds_num = float(clip_duration) if clip_duration else 5.0
        # Kling only accepts "5" or "10" as valid duration values.
        # Snap to whichever is closer: use 5 for anything ≤7.5s, 10 otherwise.
        dur_str = "5" if dur_seconds_num <= 7.5 else "10"
        for attempt in range(MAX_RETRIES):
            try:
                logger.info("━" * 60)
                logger.info(f"STEP 5 ─ FAL.AI VIDEO GENERATION  (scene {idx}, attempt {attempt + 1}/{MAX_RETRIES})")
                logger.info(f"  model: {FAL_MODEL}  aspect: 16:9  duration: {dur_str}s")
                logger.info(f"  prompt ({len(prompt)} chars): {prompt}")
                logger.info("  submitting to fal.ai queue...")

                # Submit job
                submit_resp = http_requests.post(
                    f"https://queue.fal.run/{FAL_MODEL}",
                    headers=headers,
                    json={"prompt": prompt, "duration": dur_str, "aspect_ratio": "16:9"},
                    timeout=30,
                )
                submit_resp.raise_for_status()
                submit_data = submit_resp.json()
                request_id = submit_data["request_id"]
                status_url  = submit_data["status_url"]
                result_url  = submit_data["response_url"]
                logger.info(f"  queued — request_id: {request_id}")

                # Poll for completion
                poll_count = 0
                for _ in range(MAX_POLLS):
                    time.sleep(POLL_INTERVAL)
                    poll_count += 1
                    status_resp = http_requests.get(status_url, headers=headers, timeout=15)
                    status_resp.raise_for_status()
                    status = status_resp.json().get("status", "")
                    logger.info(f"  polling... ({poll_count * POLL_INTERVAL}s elapsed) status={status}")
                    if status == "COMPLETED":
                        break
                    if status == "FAILED":
                        raise RuntimeError(f"fal.ai job failed: {status_resp.json()}")
                else:
                    raise TimeoutError("fal.ai clip timed out after 10 minutes")

                # Fetch result
                result_resp = http_requests.get(result_url, headers=headers, timeout=30)
                result_resp.raise_for_status()
                video_url_fal = result_resp.json()["video"]["url"]
                logger.info(f"  fal.ai clip ready after {poll_count * POLL_INTERVAL}s: {video_url_fal[:60]}…")

                if s3_client and bucket_name:
                    video_bytes = http_requests.get(video_url_fal, timeout=120).content
                    logger.info(f"  downloaded {len(video_bytes)} bytes")
                    s3_key = f"scene-bg/fal_{int(time.time())}_{idx}.mp4"
                    s3_client.put_object(
                        Bucket=bucket_name, Key=s3_key,
                        Body=video_bytes, ContentType="video/mp4",
                    )
                    url = f"https://{cloudfront_domain}/{s3_key}"
                else:
                    # No S3 — use the fal.ai CDN URL directly (accessible from browser + Remotion)
                    url = video_url_fal

                logger.info(f"  uploaded to: {url}")
                logger.info("━" * 60)
                return idx, url

            except Exception as exc:
                logger.warning(f"[FAL] Scene {idx} attempt {attempt + 1}/{MAX_RETRIES} failed: {exc}")
                if attempt < MAX_RETRIES - 1:
                    time.sleep(5 * (attempt + 1))

        return idx, ""

    updated = list(scene_descriptors)
    total = min(len(updated), MAX_SCENES)
    for i, scene in enumerate(updated[:MAX_SCENES]):
        idx, url = _gen_one(i, scene)
        if url:
            updated[idx] = dict(updated[idx])
            updated[idx]["background_video_url"] = url
        if on_scene_done:
            on_scene_done(i + 1, total)

    return updated


# ---------------------------------------------------------------------------
# Veo 3 pure-AI video helpers
# ---------------------------------------------------------------------------

def _build_smart_veo_prompt(dialogue: str, sender_name: str, company_name: str, openai_api_key: str) -> str:
    """
    Use GPT-4o-mini to extract the narrative arc from the script and produce
    a specific cinematic Veo 2 prompt that visually tells the script's story.

    Approach:
      1. Identify the KEY SUBJECT in the script (product, place, concept, achievement).
      2. Map it to ONE dominant visual scene (macro shot, environment, abstraction).
      3. Describe camera motion, lighting, color palette — positive direction, not restrictions.
    The visual follows the script's story. Tourism script → show the destination.
    Biscoff launch script → show the product + data transition.
    """
    fallback = (
        f"Cinematic close-up of the world of {company_name or 'a growing company'} — "
        f"premium product or environment shot with rich warm lighting, slow camera drift forward. "
        f"Subtle data-stream overlay representing {sender_name or 'analytics'}'s insight layer. "
        f"Deep shadows, saturated accent color, 16:9 ultra-cinematic, no text, no people."
    )
    if not openai_api_key:
        logger.info(f"[VEO2] No OpenAI key — using fallback: {fallback[:100]}…")
        return fallback
    try:
        from openai import OpenAI as _OAI
        client = _OAI(api_key=openai_api_key)
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=160,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a cinematographer writing Veo 2 video prompts for 8-second B2B outreach clips.\n\n"
                        "Your task: read the video script and write ONE cinematic scene description that visually tells its story.\n\n"
                        "How to think:\n"
                        "1. Identify the KEY SUBJECT in the script — the product, place, achievement, or concept the script opens with.\n"
                        "   e.g. 'Biscoff India launch' → golden biscuits + Indian market imagery\n"
                        "   e.g. 'coastal tourism rebrand' → aerial coastal cliffs at golden hour\n"
                        "   e.g. 'SaaS data platform' → flowing data streams over dark server room\n"
                        "2. Describe ONE continuous 8-second shot: what the camera sees, how it moves, the lighting, color palette.\n"
                        "3. Introduce the SENDER's theme as a subtle second layer that transitions in (data overlay, brand glow, etc).\n"
                        "4. Be SPECIFIC to the script — never generic. If it mentions a product, show it. If a place, show it.\n"
                        "5. No people, no faces, no text overlays, no logos.\n"
                        "Output: one vivid paragraph, max 100 words."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Script: \"{dialogue[:250]}\"\n"
                        f"Sender: {sender_name or 'a B2B company'}\n"
                        f"Prospect: {company_name or 'a company'}\n\n"
                        "What does the script's opening hook visually evoke? "
                        "Write the Veo 2 cinematic prompt:"
                    ),
                },
            ],
        )
        prompt_text = resp.choices[0].message.content.strip()
        # Always append minimal technical constraints (no people/text — universal for B2B)
        final_prompt = (
            prompt_text
            + " No human faces, no text overlays, no logos."
            + " Ultra-cinematic 16:9, photorealistic, seamless motion."
        )
        logger.info("━" * 60)
        logger.info("STEP 4 ─ SMART VIDEO PROMPT (GPT-4o-mini)")
        logger.info(f"  sender:     {sender_name}")
        logger.info(f"  prospect:   {company_name}")
        logger.info(f"  script in:  {dialogue[:200]}")
        logger.info(f"  prompt out: {final_prompt}")
        logger.info("━" * 60)
        return final_prompt
    except Exception as exc:
        logger.warning(f"[VEO2] Prompt generation failed ({exc}), using fallback")
        logger.info(f"[VEO2] Fallback: {fallback}")
        return fallback


def _generate_veo3_clip_bytes(prompt: str, api_key: str) -> bytes:
    """Call fal.ai Kling 2.0, poll until done, return raw video bytes."""
    FAL_MODEL = "fal-ai/kling-video/v1.6/standard/text-to-video"
    headers = {"Authorization": f"Key {api_key}", "Content-Type": "application/json"}

    submit = http_requests.post(
        f"https://queue.fal.run/{FAL_MODEL}",
        headers=headers,
        json={"prompt": prompt, "duration": "8", "aspect_ratio": "16:9"},
        timeout=30,
    )
    submit.raise_for_status()
    request_id = submit.json()["request_id"]

    status_url = f"https://queue.fal.run/{FAL_MODEL}/requests/{request_id}/status"
    for _ in range(75):
        time.sleep(8)
        resp = http_requests.get(status_url, headers=headers, timeout=15)
        resp.raise_for_status()
        status = resp.json().get("status", "")
        if status == "COMPLETED":
            break
        if status == "FAILED":
            raise RuntimeError(f"fal.ai job failed: {resp.json()}")
    else:
        raise TimeoutError("fal.ai clip generation timed out")

    result = http_requests.get(
        f"https://queue.fal.run/{FAL_MODEL}/requests/{request_id}",
        headers=headers, timeout=30,
    )
    result.raise_for_status()
    video_url = result.json()["video"]["url"]
    return http_requests.get(video_url, timeout=120).content


# ---------------------------------------------------------------------------
# Video metadata helpers (extracted to reduce cognitive complexity of routes)
# ---------------------------------------------------------------------------

def _parse_s3_key(video_url: str) -> tuple:
    """Parse an S3-format URL into (s3_bucket, s3_key). Returns defaults on failure."""
    try:
        if ".s3." in video_url:
            bucket_part = video_url.split("//")[1].split(".s3.")[0]
            s3_bucket = bucket_part or _DEFAULT_BUCKET
            s3_key = video_url.split(".amazonaws.com/")[1].split("?")[0]
            logger.info(f"Extracted S3 bucket: {s3_bucket}, key: {s3_key}")
            return s3_bucket, s3_key
        return _DEFAULT_BUCKET, "/".join(video_url.split("/")[4:]).split("?")[0]
    except (IndexError, ValueError) as e:
        logger.warning(f"Failed to extract S3 key from S3 URL: {video_url}, error: {e}")
        return _DEFAULT_BUCKET, ""


def _extract_s3_key_from_url(video_url: str) -> tuple:
    """
    Parse a video URL into (s3_bucket, s3_key).
    Returns (_DEFAULT_BUCKET, generated_key) as fallback.
    """
    s3_key = ""
    s3_bucket = _DEFAULT_BUCKET
    if _DEFAULT_CF_DOMAIN in video_url:
        try:
            cf_path = _CLOUDFRONT_NET + "/"
            s3_key = video_url.split(cf_path)[1].split("?")[0] if cf_path in video_url else ""
        except IndexError:
            logger.warning(f"Failed to extract S3 key from CloudFront URL: {video_url}")
    elif _S3_AMAZONAWS in video_url or ".s3." in video_url:
        s3_bucket, s3_key = _parse_s3_key(video_url)
    if not s3_key:
        s3_key = f"videos/generated_{int(time.time())}.mp4"
        logger.info(f"Generated default S3 key: {s3_key}")
    return s3_bucket, s3_key


def _get_local_video_stats(video_url: str) -> tuple:
    """
    Return (duration, file_size) for a video that lives in the local static folder.
    Returns (0, 0) if the file cannot be found or read.
    """
    duration = 0
    file_size = 0
    allowed_domains = os.getenv('ALLOWED_ORIGINS', _FRONTEND_URL_DEFAULT).replace(_HTTP_PREFIX, '').replace(_HTTPS_PREFIX, '')
    is_local = any(d in video_url for d in allowed_domains.split(',')) or _CLOUDFRONT_NET in video_url
    if not is_local:
        return duration, file_size
    local_path = video_url.split(_STATIC_PATH)[-1] if _STATIC_PATH in video_url else ""
    if not local_path:
        return duration, file_size
    full_path = os.path.join(os.path.dirname(__file__), "..", "static", local_path)
    if not os.path.exists(full_path):
        return duration, file_size
    try:
        file_size = os.path.getsize(full_path)
        logger.info(f"Video metadata: size={file_size} bytes")
    except Exception as e:
        logger.error(f"Failed to get video metadata: {e}")
    return duration, file_size


def _save_video_metadata(
    user_id: str, video_url: str, dialogue: str, company_name: str,
    template_video: str, client_logo_url: str, user_logo_url: str,
    bgm: str, selected_font: str,
) -> dict:
    """Persist video metadata to MongoDB and return the saved doc."""
    s3_bucket, s3_key = _extract_s3_key_from_url(video_url)
    duration, file_size = _get_local_video_stats(video_url)
    video_metadata = {
        "company_name": company_name or "",
        "video_url": video_url,
        "s3_bucket": s3_bucket,
        "s3_key": s3_key,
        "title": f"Video for {company_name}" if company_name else "Generated Video",
        "description": dialogue[:200] if dialogue else "",
        "narration_text": dialogue,
        "template_video": template_video,
        "client_logo_url": client_logo_url,
        "user_logo_url": user_logo_url,
        "bgm": bgm,
        "selected_font": selected_font,
        "status": "completed",
        "tags": [company_name] if company_name else [],
        "format": "mp4",
        "resolution": "1920x1080",
        "duration": duration,
        "file_size": file_size,
    }
    saved = videos_service.create_video(video_metadata, user_id)
    logger.info(f"Saved video metadata with ID: {saved.get('_id')}, S3 key: {s3_key}")
    return saved


def _upload_audio_to_s3(tmp_audio_path: str, log_prefix: str) -> str:
    """
    Upload a local MP3 to S3 and return its CloudFront URL.
    Falls back to serving from the static folder if AWS creds are absent.
    """
    aws_key = os.getenv("AWS_ACCESS_KEY_ID")
    aws_secret = os.getenv("AWS_SECRET_ACCESS_KEY")
    aws_region = os.getenv("AWS_REGION", "us-east-1")
    bucket_name = os.getenv("AWS_S3_BUCKET", _DEFAULT_BUCKET)
    cloudfront_domain = os.getenv("CLOUDFRONT_DOMAIN", _DEFAULT_CF_DOMAIN)
    if aws_key and aws_secret:
        s3 = boto3.client("s3", aws_access_key_id=aws_key, aws_secret_access_key=aws_secret, region_name=aws_region)
        audio_s3_key = f"audio/voiceover_{int(time.time())}.mp3"
        s3.upload_file(tmp_audio_path, bucket_name, audio_s3_key, ExtraArgs={"ContentType": _AUDIO_MPEG})
        url = f"{_HTTPS_PREFIX}{cloudfront_domain}/{audio_s3_key}"
        logger.info(f"{log_prefix} Voiceover uploaded: {url}")
        return url
    raise RuntimeError(_AWS_CREDS_MISSING)


def _fallback_audio_to_static(tmp_audio_path: str, log_prefix: str) -> str:
    """Copy a temp MP3 into the static/audio folder and return its public URL."""
    static_audio_dir = os.path.join(os.path.dirname(__file__), "..", "static", "audio")
    os.makedirs(static_audio_dir, exist_ok=True)
    audio_filename = f"voiceover_{int(time.time())}.mp3"
    static_audio_path = os.path.join(static_audio_dir, audio_filename)
    shutil.copy(tmp_audio_path, static_audio_path)
    frontend_url = os.getenv("FRONTEND_URL", _FRONTEND_URL_DEFAULT)
    url = f"{frontend_url}/static/audio/{audio_filename}"
    logger.info(f"{log_prefix} Audio served from static: {url}")
    return url


def _upload_audio(tmp_audio_path: str, log_prefix: str) -> str:
    """Upload audio to S3, falling back to static folder on failure."""
    try:
        return _upload_audio_to_s3(tmp_audio_path, log_prefix)
    except Exception as s3_err:
        logger.warning(f"{log_prefix} Audio S3 upload failed: {s3_err}. Using local static path.")
        return _fallback_audio_to_static(tmp_audio_path, log_prefix)


_DEFAULT_VOICE_ID = "2EiwWnXFnvU5JabPnv8n"


def _generate_voiceover_bytes(dialogue: str, log_prefix: str, voice_id: str = "") -> bytes:
    """Generate TTS audio bytes via ElevenLabs, falling back to gTTS."""
    vid = voice_id or _DEFAULT_VOICE_ID
    try:
        from elevenlabs.client import ElevenLabs
        el_client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY", ""))
        logger.info(f"{log_prefix} Using ElevenLabs voice: {vid}")
        audio_data = el_client.text_to_speech.convert(
            text=dialogue,
            voice_id=vid,
            model_id="eleven_multilingual_v2",
            output_format="mp3_44100_128",
        )
        return b"".join(audio_data)
    except Exception as el_error:
        logger.warning(f"{log_prefix} ElevenLabs failed ({el_error}), falling back to gTTS")
        from gtts import gTTS
        from io import BytesIO
        buf = BytesIO()
        gTTS(text=dialogue, lang="en", slow=False).write_to_fp(buf)
        return buf.getvalue()


def _get_audio_duration(tmp_audio_path: str, dialogue: str, log_prefix: str) -> float:
    """Return audio duration in seconds from pydub, falling back to word-count estimate."""
    try:
        from pydub import AudioSegment as PydubSeg
        audio_seg = PydubSeg.from_mp3(tmp_audio_path)
        return len(audio_seg) / 1000.0
    except Exception as pydub_err:
        logger.warning(f"{log_prefix} pydub duration failed ({pydub_err}), using word-count estimate")
        return len(dialogue.split()) / 2.5


def _transcribe_whisper(tmp_audio_path: str, log_prefix: str, initial_prompt: str = "") -> list:
    """
    Transcribe audio with Whisper base model.
    Always forces language=en to prevent hallucination into Chinese/Russian/etc.
    Pass initial_prompt (the script) so Whisper knows the correct vocabulary.
    Returns segment list (may be empty).
    """
    try:
        import whisper
        model = whisper.load_model("base")
        kwargs: dict = {"language": "en"}
        if initial_prompt:
            kwargs["initial_prompt"] = initial_prompt
        result = model.transcribe(tmp_audio_path, **kwargs)
        segs = [
            {"text": seg["text"], "start": seg["start"], "end": seg["end"]}
            for seg in result.get("segments", [])
        ]
        logger.info(f"{log_prefix} Whisper found {len(segs)} segments")
        if initial_prompt:
            logger.info(f"{log_prefix} Whisper initial_prompt used: {initial_prompt[:80]}")
        return segs
    except Exception as whisper_err:
        logger.warning(f"{log_prefix} Whisper failed ({whisper_err}), subtitles will be empty")
        return []


def _ensure_n_segments(segments: list, n: int) -> list:
    """Split the longest segments until we have exactly n segments."""
    result = list(segments)
    while len(result) < n:
        longest_idx = max(range(len(result)), key=lambda i, r=result: r[i]["end"] - r[i]["start"])
        seg = result[longest_idx]
        dur = seg["end"] - seg["start"]
        if dur < 1.5:
            break  # too short to split further
        mid_t = round((seg["start"] + seg["end"]) / 2.0, 2)
        words = seg["text"].split()
        mid_w = max(1, len(words) // 2)
        left  = {"text": " ".join(words[:mid_w]), "start": seg["start"], "end": mid_t}
        right = {"text": " ".join(words[mid_w:]) or seg["text"], "start": mid_t, "end": seg["end"]}
        result = result[:longest_idx] + [left, right] + result[longest_idx + 1:]
    return result[:n]


def _fallback_subtitle_segments(dialogue: str, duration: float, log_prefix: str) -> list:
    """Split dialogue into timed segments when Whisper produces nothing."""
    logger.warning(f"{log_prefix} No subtitle segments — creating fallback segments from dialogue")
    sentences = [s.strip() for s in dialogue.replace("?", "?.").replace("!", "!.").split(".") if s.strip()]
    if not sentences:
        sentences = [dialogue]
    seg_dur = duration / len(sentences)
    segs = [
        {"text": sent, "start": round(i * seg_dur, 2), "end": round((i + 1) * seg_dur, 2)}
        for i, sent in enumerate(sentences)
    ]
    logger.info(f"{log_prefix} Created {len(segs)} fallback segments")
    return segs


def _fill_segment_gaps(subtitle_segments: list, voiceover_duration: float) -> list:
    """Fill inter-segment gaps and extend the last segment to cover full audio duration."""
    for i in range(len(subtitle_segments) - 1):
        if subtitle_segments[i + 1]['start'] > subtitle_segments[i]['end']:
            subtitle_segments[i]['end'] = subtitle_segments[i + 1]['start']
    if subtitle_segments:
        subtitle_segments[-1]['end'] = max(subtitle_segments[-1]['end'], voiceover_duration)
    return subtitle_segments


def _run_video_director_agent(
    dialogue: str, subtitle_segments: list, company_name: str, log_prefix: str
) -> tuple:
    """
    Run the GPT-4 Video Director agent.
    Returns (scene_descriptors, subtitle_segments, video_concept, video_style,
             agent_system_prompt, agent_user_message).
    """
    try:
        agent_system_prompt = SYSTEM_PROMPT
        agent_user_message = build_user_message(dialogue, subtitle_segments, company_name or None)
        scene_descriptors, subtitle_segments, video_concept, video_style = generate_video_concept(
            dialogue=dialogue,
            segments=subtitle_segments,
            company_name=company_name or None,
        )
        logger.info(f"{log_prefix} Video concept: '{video_concept}' — {len(scene_descriptors)} scenes")
        return scene_descriptors, subtitle_segments, video_concept, video_style, agent_system_prompt, agent_user_message
    except Exception as agent_err:
        logger.warning(f"{log_prefix} Video director agent failed: {agent_err}")
        return [], subtitle_segments, "", {}, "", ""


def _upload_video_to_s3(rendered_mp4_path: str, log_prefix: str) -> tuple:
    """
    Upload the rendered MP4 to S3 and return (video_url, s3_key, bucket_name).
    Falls back to static folder on failure.
    """
    aws_key = os.getenv("AWS_ACCESS_KEY_ID")
    aws_secret = os.getenv("AWS_SECRET_ACCESS_KEY")
    aws_region = os.getenv("AWS_REGION", "us-east-1")
    bucket_name = os.getenv("AWS_S3_BUCKET", _DEFAULT_BUCKET)
    cloudfront_domain = os.getenv("CLOUDFRONT_DOMAIN", _DEFAULT_CF_DOMAIN)
    if aws_key and aws_secret:
        try:
            s3 = boto3.client("s3", aws_access_key_id=aws_key, aws_secret_access_key=aws_secret, region_name=aws_region)
            s3_key = f"videos/remotion_{int(time.time())}.mp4"
            s3.upload_file(rendered_mp4_path, bucket_name, s3_key, ExtraArgs={"ContentType": "video/mp4"})
            video_url = f"{_HTTPS_PREFIX}{cloudfront_domain}/{s3_key}"
            logger.info(f"{log_prefix} Video uploaded to S3: {video_url}")
            return video_url, s3_key, bucket_name
        except Exception as upload_err:
            logger.warning(f"{log_prefix} S3 video upload failed: {upload_err}. Serving from local static.")
    static_video_dir = os.path.join(os.path.dirname(__file__), "..", "static")
    os.makedirs(static_video_dir, exist_ok=True)
    video_filename = f"remotion_{int(time.time())}.mp4"
    static_video_path = os.path.join(static_video_dir, video_filename)
    shutil.copy(rendered_mp4_path, static_video_path)
    frontend_url = os.getenv("FRONTEND_URL", _FRONTEND_URL_DEFAULT)
    video_url = f"{frontend_url}/static/{video_filename}"
    return video_url, video_filename, ""


def _check_video_usage_limit(user_id: str) -> None:
    """Usage limit check — currently disabled (unlimited generation)."""
    return  # limit removed
    usage_check = subscription_service.check_usage_limit(user_id, "videos")
    if not usage_check["can_proceed"]:
        logger.warning(f"User {user_id} has exceeded video generation limit")
        raise HTTPException(
            status_code=403,
            detail={
                "error": "limit_exceeded",
                "message": _LIMIT_REACHED_MSG,
                "current_usage": usage_check["current_usage"],
                "limit": usage_check["limit"],
                "plan": usage_check["plan"],
                "upgrade_message": _UPGRADE_MSG,
            },
        )


async def _call_remotion_render(remotion_url: str, render_payload: dict, log_prefix: str) -> dict:
    """POST render_payload to the Remotion render service and return the result dict."""
    try:
        async with httpx.AsyncClient(timeout=600) as _hx:
            resp = await _hx.post(f"{remotion_url}/render", json=render_payload)
        # Extract actual error body before raising so the real message surfaces
        if resp.status_code != 200:
            try:
                body = resp.json()
                err_msg = body.get("error") or body.get("message") or resp.text[:500]
            except Exception:
                err_msg = resp.text[:500]
            logger.error(f"{log_prefix} Remotion returned {resp.status_code}: {err_msg}")
            return {"error": f"Remotion render failed: {err_msg}"}
        result = resp.json()
        if not result.get("success"):
            return {"error": f"Remotion render error: {result.get('error', 'Unknown error')}"}
        return result
    except httpx.ConnectError:
        return {
            "error": "Remotion render service is not running. Start it with: cd remotion-service && npm run start",
            "status": "remotion_service_offline",
        }
    except Exception as render_err:
        logger.error(f"{log_prefix} Render service error: {render_err}")
        return {"error": f"Remotion render failed: {str(render_err)}"}


def _infer_cta_text(dialogue: str) -> str:
    """Infer a call-to-action label from the dialogue text."""
    lower = dialogue.lower()
    if "demo" in lower:
        return "Book a Free Demo"
    if "schedule" in lower:
        return "Schedule a Call Today"
    if "reach out" in lower or "connect" in lower:
        return "Let's Connect"
    return "Book a Discovery Call"


def _caption_segs_from_dialogue(dialogue: str, duration: float) -> list:
    """Split dialogue into caption segments by sentence/clause with proportional timestamps."""
    # Split at sentence endings and em-dash pauses
    parts = [p.strip() for p in re.split(r'(?<=[.!?])\s+|—', dialogue.strip()) if p.strip()]
    if not parts:
        return [{"start": 0.0, "end": duration, "text": dialogue}]
    word_counts = [len(p.split()) for p in parts]
    total_words = max(sum(word_counts), 1)
    segs, t = [], 0.0
    for part, wc in zip(parts, word_counts):
        seg_dur = (wc / total_words) * duration
        segs.append({"start": round(t, 2), "end": round(t + seg_dur, 2), "text": part})
        t += seg_dur
    return segs


async def _prepare_remotion_audio(
    precomputed_voiceover_url: str,
    precomputed_subtitle_segments: list,
    precomputed_duration: float,
    precomputed_scene_descriptors: list,
    dialogue: str,
    company_name: str,
    log_prefix: str,
    voice_id: str = "",
    precomputed_caption_segments: list = None,
) -> tuple:
    """
    Return (voiceover_s3_url, scene_segments, scene_descriptors,
             voiceover_duration_seconds, tmp_audio_path, caption_segments).
    scene_segments: 1 merged segment driving the scene card.
    caption_segments: fine-grained Whisper phrases driving the subtitle overlay.
    Uses pre-computed data when available; otherwise generates fresh audio.
    """
    if precomputed_voiceover_url and precomputed_subtitle_segments:
        logger.info(f"{log_prefix} Using pre-computed data — skipping ElevenLabs/Whisper/GPT-4")
        duration = float(precomputed_duration) if precomputed_duration else 10.0
        segs = _fill_segment_gaps(list(precomputed_subtitle_segments), duration)
        caption_segs = list(precomputed_caption_segments) if precomputed_caption_segments else segs
        return precomputed_voiceover_url, segs, precomputed_scene_descriptors, duration, None, caption_segs

    # ─── STEP 1: ElevenLabs Voiceover ────────────────────────────────────────
    logger.info("━" * 60)
    logger.info("STEP 1 ─ ELEVENLABS VOICEOVER")
    logger.info(f"  script ({len(dialogue.split())} words): {dialogue}")
    logger.info(f"  voice_id: {voice_id or '(default)'}")
    audio_bytes = _generate_voiceover_bytes(dialogue, log_prefix, voice_id)
    tmp_audio_path = await _write_temp_mp3(audio_bytes)
    duration = _get_audio_duration(tmp_audio_path, dialogue, log_prefix)
    logger.info(f"  output: {tmp_audio_path}  duration={duration:.2f}s  size={len(audio_bytes)} bytes")
    logger.info("━" * 60)

    # ─── STEP 2: Whisper Transcription ───────────────────────────────────────
    logger.info("STEP 2 ─ WHISPER TRANSCRIPTION")
    raw_segs = _transcribe_whisper(tmp_audio_path, log_prefix, initial_prompt=dialogue)
    if not raw_segs:
        raw_segs = _fallback_subtitle_segments(dialogue, duration, log_prefix)
        logger.info("  (whisper failed — using fallback segments)")

    logger.info(f"  raw whisper segments ({len(raw_segs)}):")
    for i, s in enumerate(raw_segs):
        logger.info(f"    [{i}] {s['start']:.1f}s–{s['end']:.1f}s  \"{s['text'].strip()}\"")

    caption_segs = merge_subtitle_segments(raw_segs, min_duration=0.5, max_duration=3.5)
    # If Whisper coverage is poor OR hallucinating non-English, fall back to sentence-split
    whisper_text = " ".join(s["text"].strip() for s in caption_segs)
    ascii_ratio = sum(1 for c in whisper_text if ord(c) < 128) / max(len(whisper_text), 1)
    coverage_poor = dialogue and len(whisper_text) < len(dialogue) * 0.4
    hallucinating = ascii_ratio < 0.85
    if coverage_poor or hallucinating:
        reason = "hallucinating non-English" if hallucinating else f"coverage poor ({len(whisper_text)}/{len(dialogue)} chars)"
        logger.info(f"  [Caption] Whisper {reason} — using dialogue sentence split")
        caption_segs = _caption_segs_from_dialogue(dialogue, duration)
    logger.info(f"  caption_segments ({len(caption_segs)}) for subtitle overlay:")
    for i, s in enumerate(caption_segs):
        logger.info(f"    [{i}] {s['start']:.1f}s–{s['end']:.1f}s  \"{s['text'].strip()}\"")

    # If the caller already has user-edited scene_descriptors, distribute audio timing
    # across those scenes rather than running the Video Director agent again.
    # This preserves the user's template/headline/effects edits when only audio changed.
    if precomputed_scene_descriptors:
        n = len(precomputed_scene_descriptors)
        seg_dur = duration / n
        segs = [
            {"text": "", "start": round(i * seg_dur, 2), "end": round((i + 1) * seg_dur, 2)}
            for i in range(n)
        ]
        scene_descs = precomputed_scene_descriptors
        logger.info(f"  Using {n} pre-edited scene(s) — skipping Video Director agent (audio-only change)")
        logger.info("━" * 60)

        logger.info(f"{log_prefix} Uploading voiceover to S3...")
        voiceover_s3_url = _upload_audio(tmp_audio_path, log_prefix)
        logger.info(f"  voiceover S3 url: {voiceover_s3_url}")

        segs = _fill_segment_gaps(segs, duration)
        caption_segs = _fill_segment_gaps(caption_segs, duration)
        return voiceover_s3_url, segs, scene_descs, duration, tmp_audio_path, caption_segs

    segs = merge_subtitle_segments(raw_segs, min_duration=2.5, max_duration=5.0)
    segs = segs[:1]
    logger.info(f"  scene_segments ({len(segs)}) for scene card:")
    for i, s in enumerate(segs):
        logger.info(f"    [{i}] {s['start']:.1f}s–{s['end']:.1f}s  \"{s['text'].strip()[:80]}\"")
    logger.info("━" * 60)

    logger.info(f"{log_prefix} Uploading voiceover to S3...")
    voiceover_s3_url = _upload_audio(tmp_audio_path, log_prefix)
    logger.info(f"  voiceover S3 url: {voiceover_s3_url}")

    # ─── STEP 3: GPT-4o-mini Video Director Agent ─────────────────────────────
    logger.info("━" * 60)
    logger.info("STEP 3 ─ VIDEO DIRECTOR AGENT (GPT-4o-mini)")
    logger.info(f"  input: {len(segs)} segment(s), company={company_name}")
    scene_descs, segs, concept, style, sys_prompt_used, usr_msg_used = \
        _run_video_director_agent(dialogue, segs, company_name, log_prefix)
    logger.info(f"  concept: {concept}")
    logger.info(f"  style:   {style}")
    logger.info(f"  scenes planned ({len(scene_descs)}):")
    for i, sd in enumerate(scene_descs):
        logger.info(
            f"    [{i}] template={sd.get('template')}  headline=\"{sd.get('headline')}\"  "
            f"accent={sd.get('accent_color')}  transition={sd.get('transition_out')}"
        )
    logger.info("━" * 60)

    segs = _fill_segment_gaps(segs, duration)
    caption_segs = _fill_segment_gaps(caption_segs, duration)
    return voiceover_s3_url, segs, scene_descs, duration, tmp_audio_path, caption_segs


def _inject_news_hook(scene_descriptors: list, company_name: str, logo_accent_color: str) -> list:
    """Inject a company news headline into the first scene descriptor."""
    if not (company_name and scene_descriptors):
        return scene_descriptors
    news_hook = _fetch_company_news_hook(company_name)
    if not news_hook:
        return scene_descriptors
    first = dict(scene_descriptors[0])
    first["subtext"] = news_hook
    if logo_accent_color:
        first["accent_color"] = logo_accent_color
    scene_descriptors[0] = first
    logger.info(f"[NewsHook] Injected into scene 0: '{news_hook[:60]}'")
    return scene_descriptors


def _apply_logo_color_accents(scene_descriptors: list, logo_accent_color: str) -> list:
    """Apply the brand accent color to every 3rd scene (index > 0)."""
    if not logo_accent_color:
        return scene_descriptors
    for i, scene in enumerate(scene_descriptors):
        if i > 0 and i % 3 == 0:
            updated = dict(scene)
            updated["accent_color"] = logo_accent_color
            scene_descriptors[i] = updated
    return scene_descriptors


def _expand_to_three_dalle_scenes(
    scene_descriptors: list,
    subtitle_segments: list,
    voiceover_duration: float,
    openai_api_key: str,
) -> tuple:
    """When AI video fails, expand 1 scene to 3 DALL-E scenes with equal timing."""
    FALLBACK_TEMPLATES = ["DataStream", "CinematicBars", "StatShot"]
    base = scene_descriptors[0]

    new_scenes = [dict(base)]
    for tmpl in FALLBACK_TEMPLATES[1:]:
        s = dict(base)
        s["template"] = tmpl
        new_scenes.append(s)

    # Generate DALL-E backgrounds for scenes 1 and 2
    if openai_api_key:
        _ak = os.getenv("AWS_ACCESS_KEY_ID")
        _as = os.getenv("AWS_SECRET_ACCESS_KEY")
        s3 = (
            boto3.client("s3", aws_access_key_id=_ak, aws_secret_access_key=_as,
                         region_name=os.getenv("AWS_REGION", "us-east-1"))
            if _ak and _as else None
        )
        bucket = os.getenv("AWS_S3_BUCKET", _DEFAULT_BUCKET)
        cf = os.getenv("CLOUDFRONT_DOMAIN", _DEFAULT_CF_DOMAIN)
        filled = _generate_scene_dalle_backgrounds(
            new_scenes[1:], openai_api_key=openai_api_key,
            s3_client=s3, bucket_name=bucket, cloudfront_domain=cf,
        )
        for i, ds in enumerate(filled):
            new_scenes[i + 1] = ds

    # Split subtitle into 3 equal-time segments
    seg_dur = voiceover_duration / 3
    base_text = subtitle_segments[0].get("text", "") if subtitle_segments else ""
    new_subs = [
        {"start": round(i * seg_dur, 2), "end": round((i + 1) * seg_dur, 2), "text": base_text}
        for i in range(3)
    ]

    logger.info("[AI Fallback] Expanded to 3 DALL-E scenes (AI video unavailable)")
    return new_scenes, new_subs


def _apply_scene_backgrounds(scene_descriptors: list, openai_api_key: str, job_id: str = "", use_veo3: bool = False, dialogue: str = "", sender_name: str = "", company_name: str = "", fal_model: str = "", clip_duration: int = 5) -> list:
    """
    Generate cinematic backgrounds for each scene.
    use_veo3=True: generate fal.ai AI clips for ALL scenes, fall back per-scene to DALL-E.
    use_veo3=False: DALL-E for all scenes.
    Reports per-scene progress via _set_progress when job_id is provided.
    """
    if not scene_descriptors:
        return scene_descriptors

    _ak = os.getenv("AWS_ACCESS_KEY_ID")
    _as = os.getenv("AWS_SECRET_ACCESS_KEY")
    s3_bg = (
        boto3.client("s3", aws_access_key_id=_ak, aws_secret_access_key=_as,
                     region_name=os.getenv("AWS_REGION", "us-east-1"))
        if _ak and _as else None
    )
    bucket    = os.getenv("AWS_S3_BUCKET", _DEFAULT_BUCKET)
    cf_domain = os.getenv("CLOUDFRONT_DOMAIN", _DEFAULT_CF_DOMAIN)
    total     = len(scene_descriptors)

    def _progress(done: int) -> None:
        pct = 55 + int((done / total) * 22) if total else 55
        _set_progress(job_id, pct, "Generating backgrounds", f"{done}/{total} scenes")

    updated = list(scene_descriptors)
    fal_api_key = os.getenv("FAL_API_KEY", "")

    # ── Skip scenes that already have a pre-rendered background from the editor ──
    needs_bg_indices = [
        i for i, s in enumerate(updated)
        if not s.get("background_video_url") and not s.get("background_image_url")
    ]
    if not needs_bg_indices:
        logger.info(f"[BG] All {len(updated)} scenes already have backgrounds — skipping generation")
        return updated

    scenes_needing_bg = [updated[i] for i in needs_bg_indices]
    logger.info(f"[BG] Generating backgrounds for {len(needs_bg_indices)} / {len(updated)} scenes")

    # 'dalle' is an OpenAI model — never send it to fal.ai
    is_fal_model = use_veo3 and fal_model != "dalle"
    if is_fal_model and fal_api_key:
        # Generate AI clips only for scenes without existing backgrounds
        _set_progress(job_id, 55, "Generating AI clips", f"Kling — {len(needs_bg_indices)} scene(s), please wait…")
        try:
            def _on_fal_done(done: int, _total: int) -> None:
                _progress(done)
            veo3_results = _generate_scene_veo3_clips(
                scenes_needing_bg, fal_api_key=fal_api_key or "test-mode",
                s3_client=s3_bg, bucket_name=bucket, cloudfront_domain=cf_domain,
                dialogue=dialogue, sender_name=sender_name, company_name=company_name,
                openai_api_key=openai_api_key,
                fal_model=fal_model, clip_duration=clip_duration,
                on_scene_done=_on_fal_done,
            )
            for j, result_scene in enumerate(veo3_results):
                i = needs_bg_indices[j]
                if result_scene.get("background_video_url"):
                    updated[i] = result_scene
                    logger.info(f"[FAL] Scene {i} AI clip injected.")
                else:
                    # Per-scene DALL-E fallback
                    logger.warning(f"[FAL] Scene {i} failed — falling back to DALL-E")
                    if openai_api_key:
                        try:
                            dalle_res = _generate_scene_dalle_backgrounds(
                                [updated[i]], openai_api_key=openai_api_key,
                                s3_client=s3_bg, bucket_name=bucket, cloudfront_domain=cf_domain,
                            )
                            if dalle_res:
                                updated[i] = dalle_res[0]
                        except Exception as fb_err:
                            logger.warning(f"[DALLE] Scene {i} fallback failed: {fb_err}")
        except Exception as veo_err:
            logger.warning(f"[FAL] All-scene generation failed, falling back to DALL-E: {veo_err}")
            if openai_api_key:
                try:
                    dalle_all = _generate_scene_dalle_backgrounds(
                        scenes_needing_bg, openai_api_key=openai_api_key,
                        s3_client=s3_bg, bucket_name=bucket, cloudfront_domain=cf_domain,
                    )
                    for j, result_scene in enumerate(dalle_all):
                        updated[needs_bg_indices[j]] = result_scene
                except Exception as dalle_err:
                    logger.warning(f"[DALLE] Full fallback failed: {dalle_err}")
    else:
        # Template mode — DALL-E only for scenes without existing backgrounds
        if openai_api_key:
            try:
                def _on_dalle(done: int, _total: int) -> None:
                    _progress(done)
                dalle_results = _generate_scene_dalle_backgrounds(
                    scenes_needing_bg, openai_api_key=openai_api_key,
                    s3_client=s3_bg, bucket_name=bucket, cloudfront_domain=cf_domain,
                    on_scene_done=_on_dalle,
                )
                for j, result_scene in enumerate(dalle_results):
                    updated[needs_bg_indices[j]] = result_scene
                logger.info(f"[DALLE] {len(dalle_results)} scene background(s) generated.")
            except Exception as dalle_err:
                logger.warning(f"[DALLE] Background generation failed: {dalle_err}")

    return updated


def _enrich_scene_descriptors_for_remotion(
    scene_descriptors: list,
    client_logo_url: str,
    company_name: str,
    openai_api_key: str,
    job_id: str = "",
    use_veo3: bool = False,
    dialogue: str = "",
    sender_name: str = "",
    fal_model: str = "",
    clip_duration: int = 5,
) -> list:
    """Apply brand color, news hook, and scene backgrounds (fal.ai or DALL-E) to scene descriptors."""
    logo_accent_color = _extract_logo_dominant_color(client_logo_url) if client_logo_url else ""
    scene_descriptors = _inject_news_hook(scene_descriptors, company_name, logo_accent_color)
    scene_descriptors = _apply_logo_color_accents(scene_descriptors, logo_accent_color)
    return _apply_scene_backgrounds(
        scene_descriptors, openai_api_key, job_id=job_id, use_veo3=use_veo3,
        dialogue=dialogue, sender_name=sender_name, company_name=company_name,
        fal_model=fal_model, clip_duration=clip_duration,
    )


def _save_remotion_video_metadata(
    user_id: str, video_url: str, s3_key: str, s3_bucket: str,
    company_name: str, dialogue: str, template_video_url: str,
    client_logo_url: str, user_logo_url: str, bgm_url: str,
    total_duration: float, file_size: int,
    video_title: str = "", social_caption: str = "", voice_id: str = "",
) -> Optional[str]:
    """Save remotion video metadata to MongoDB. Returns video_id or None on failure."""
    try:
        meta = {
            "company_name": company_name or "",
            "video_url": video_url,
            "s3_bucket": s3_bucket if s3_key else "",
            "s3_key": s3_key,
            "title": video_title or (f"Remotion Video for {company_name}" if company_name else "Remotion Generated Video"),
            "social_caption": social_caption or "",
            "voice_id": voice_id or "",
            "description": dialogue[:200],
            "narration_text": dialogue,
            "template_video": template_video_url,
            "client_logo_url": client_logo_url,
            "user_logo_url": user_logo_url,
            "bgm": bgm_url,
            "engine": "remotion",
            "status": "completed",
            "tags": [company_name, "remotion"] if company_name else ["remotion"],
            "format": "mp4",
            "resolution": "1920x1080",
            "duration": total_duration,
            "file_size": file_size,
        }
        saved = videos_service.create_video(meta, user_id)
        video_id = saved.get("_id")
        logger.info(f"{_LOG_REMOTION} Video metadata saved with ID: {video_id}")
        return video_id
    except Exception as save_err:
        logger.error(f"{_LOG_REMOTION} Failed to save video metadata: {save_err}")
        return None



@router.post("/generate")
async def generate_company_info(
    request: Request,
    authorization: Annotated[Optional[str], Header()] = None,
):
    """Generate marketing content using AI"""
    body = await request.json()
    prompt = body.get("prompt")
    company_name = body.get("company_name")
    sender_mode = body.get("sender_mode", "personal")  # 'personal' or 'company'

    logger.info(f"Received prompt: {prompt}")
    logger.info(f"Received company_name: {company_name}")

    # Verify authentication and get user_id
    user_id = None
    if authorization:
        try:
            user_info = auth_middleware.verify_token(authorization)
            if user_info:
                user_id = user_info.get('user_id')
                logger.info(f"👤 Content generation for user: {user_info.get('email', user_id)}")
        except Exception as e:
            logger.warning(f"WARNING: Could not verify token: {e}")

    target_duration = body.get("target_duration", "short")  # 'short' | 'medium' | 'long'

    if not prompt and not company_name:
        return {"error": "Either prompt or company_name is required"}

    try:
        # If company_name is provided, use intelligent prompt generation
        if company_name:
            result = generate_intelligent_prompt_from_company_data(company_name, user_id=user_id, sender_mode=sender_mode, target_duration=target_duration)
        else:
            result = generate_marketing_package(prompt, user_id, sender_mode, target_duration)

        if "error" in result:
            return {"error": result["error"]}

        return result
    except Exception as e:
        logger.error(f"Error generating marketing package: {e}")
        return {"error": f"Failed to generate marketing package: {str(e)}"}


@router.post(
    "/video",
    responses={401: {"description": _AUTH_REQUIRED}, 403: {"description": "Limit exceeded"}},
)
async def generate_video_endpoint(request: Request, user_info: CurrentUser):
    """Generate AI video with dialogue"""
    try:
        body = await request.json()
        dialogue = body.get("dialogue")
        company_name = body.get("company_name", "")
        client_logo_url = body.get("client_logo_url", "")
        user_logo_url = body.get("user_logo_url", "")
        template_video = body.get("template_video", _DEFAULT_TEMPLATE)
        bgm = body.get("bgm", _DEFAULT_BGM)
        selected_font = body.get("selected_font", "Avenir")

        user_id: str = user_info.get('user_id') or ""
        user_email = user_info.get('email', 'unknown')
        logger.info(f" Received video generation request from user: {user_email}")
        logger.info(f" Company: {company_name}")
        logger.info(f" Dialogue: {dialogue[:100]}..." if dialogue and len(dialogue) > 100 else f" Dialogue: {dialogue}")

        # ✅ CHECK SUBSCRIPTION LIMITS BEFORE GENERATING VIDEO
        _check_video_usage_limit(user_id)

        client_logo_url, user_logo_url, _ = _resolve_video_logos(
            user_id, company_name, client_logo_url, user_logo_url
        )

        if not dialogue:
            return {"error": _DIALOGUE_REQUIRED}

        # Replace [company_name] placeholder
        if company_name and _COMPANY_NAME_PLACEHOLDER in dialogue:
            dialogue = dialogue.replace(_COMPANY_NAME_PLACEHOLDER, company_name)
            logger.info(f" Replaced {_COMPANY_NAME_PLACEHOLDER} with: {company_name}")

        try:
            video_url = generate_video(
                narration_text=dialogue,
                template_video=template_video,
                client_logo_url=client_logo_url,
                user_logo_url=user_logo_url,
                bgm=bgm,
                selected_font=selected_font,
                company_name=company_name,  # Pass company_name to fetch logo from campaign
                user_id=user_id  # Pass user_id to search user's campaigns
            )

            # ✅ INCREMENT USAGE COUNTER IMMEDIATELY AFTER SUCCESSFUL VIDEO GENERATION
            # This must happen here, not inside the metadata save try-except block
            subscription_service.increment_usage(user_id, "videos", 1)
            logger.info(f"📊 Incremented video usage for user {user_id}")

            # Save video metadata to MongoDB (video file is already in S3)
            try:
                saved_video = _save_video_metadata(
                    user_id, video_url, dialogue, company_name,
                    template_video, client_logo_url, user_logo_url,
                    bgm, selected_font,
                )
                return {
                    "success": True,
                    "video_url": video_url,
                    "video_id": saved_video.get('_id'),
                    "message": "Video generated and metadata saved successfully"
                }
            except Exception as save_error:
                logger.error(f"ERROR: Failed to save video metadata: {save_error}")
                return {
                    "success": True,
                    "video_url": video_url,
                    "warning": "Video generated but metadata save failed"
                }
        except FileNotFoundError as e:
            if "ffmpeg" in str(e).lower():
                logger.error(f"ERROR: FFmpeg not found: {e}")
                return {
                    "error": "FFmpeg is required for video generation. Please install FFmpeg first.",
                    "installation_help": "Run: brew install ffmpeg (this may take 10-15 minutes)",
                    "status": "ffmpeg_missing"
                }
            else:
                raise
    except HTTPException:
        # Re-raise HTTPException so FastAPI handles it properly (403, 401, etc.)
        raise
    except Exception as e:
        logger.error(f"Error generating video: {e}")
        logger.exception("Error generating video:")
        return {"error": f"Failed to generate video: {str(e)}"}


@router.get("/video-remotion/progress/{job_id}")
async def get_render_progress(job_id: str):
    """Poll real-time progress for a video render job. No auth required."""
    cutoff = time.time() - 7200  # prune entries older than 2 hours
    stale = [k for k, v in _progress_store.items() if v.get("ts", 0) < cutoff]
    for k in stale:
        _progress_store.pop(k, None)
    entry = _progress_store.get(job_id, {})
    return {
        "percent": entry.get("percent", 0),
        "stage":   entry.get("stage",   "queued"),
        "detail":  entry.get("detail",  ""),
    }


@router.post(
    "/video-remotion/generate-scene-prompt",
    responses={401: {"description": _AUTH_REQUIRED}},
)
async def generate_scene_prompt_endpoint(request: Request, user_info: CurrentUser):
    """
    Generate a cinematic AI background prompt for a scene using GPT-4o-mini.
    Accepts: { headline, subtext, scene_number, total_scenes, scene_mode, template }
    Returns: { success, prompt }
    """
    try:
        body = await request.json()
        headline     = body.get("headline", "")
        subtext      = body.get("subtext", "")
        scene_number = body.get("scene_number", 1)
        total_scenes = body.get("total_scenes", 1)
        scene_mode   = body.get("scene_mode", "dalle")
        template     = body.get("template", "")

        openai_key = os.getenv("OPENAI_API_KEY", "")
        if not openai_key:
            raise HTTPException(status_code=500, detail="No OpenAI API key configured")

        is_dalle = scene_mode == "dalle"
        medium = "photorealistic still image" if is_dalle else "cinematic video clip"
        style_hint = f" The visual template style is '{template}'." if template else ""

        system_msg = (
            f"You are a creative director writing concise prompts for AI {medium} generation. "
            "Describe only visuals: environment, lighting, mood, depth, color palette, camera angle. "
            "No text, no faces, no logos, no titles. Output only the prompt, 15–25 words, no preamble."
        )
        user_msg = (
            f"Scene {scene_number} of {total_scenes}. "
            f"Headline: \"{headline}\". Subtext: \"{subtext}\".{style_hint} "
            f"Write a background prompt for a {medium}."
        )

        import openai as openai_lib
        client = openai_lib.OpenAI(api_key=openai_key)
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user",   "content": user_msg},
            ],
            max_tokens=80,
            temperature=0.82,
        )
        prompt_text = resp.choices[0].message.content.strip().strip('"').strip("'")
        logger.info(f"[generate-scene-prompt] user={user_info.get('user_id')} → {prompt_text}")
        return {"success": True, "prompt": prompt_text}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[generate-scene-prompt] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/video-remotion/render-background-image",
    responses={401: {"description": _AUTH_REQUIRED}},
)
async def render_background_image_endpoint(request: Request, user_info: CurrentUser):
    """
    Generate a DALL-E 3 background image for a scene.
    Accepts: { scene_prompt }
    Returns: { success, image_url }
    """
    try:
        body = await request.json()
        scene_prompt = body.get("scene_prompt", "")

        if not scene_prompt:
            raise HTTPException(status_code=400, detail="scene_prompt is required")

        openai_key = os.getenv("OPENAI_API_KEY", "")
        if not openai_key:
            raise HTTPException(status_code=500, detail="No OpenAI API key configured")

        import openai as openai_lib
        client = openai_lib.OpenAI(api_key=openai_key)
        enhanced = (
            f"Cinematic background for a professional business video: {scene_prompt}. "
            "16:9 widescreen, dramatic lighting, high production value, photorealistic, "
            "no text or logos, suitable as a video backdrop."
        )
        response = client.images.generate(
            model="dall-e-3",
            prompt=enhanced,
            size="1792x1024",
            quality="standard",
            n=1,
        )
        dalle_url = response.data[0].url

        # DALL-E URLs expire after ~2 hours and Remotion can't always reach Azure Blob Storage.
        # Re-host to S3 (production) or local /static/ (dev) for a permanent URL.
        try:
            img_bytes = http_requests.get(dalle_url, timeout=30).content
            _ak = os.getenv("AWS_ACCESS_KEY_ID")
            _sk = os.getenv("AWS_SECRET_ACCESS_KEY")
            _region = os.getenv("AWS_REGION", "us-east-1")
            _bucket = os.getenv("AWS_S3_BUCKET", _DEFAULT_BUCKET)
            _cf = os.getenv("CLOUDFRONT_DOMAIN", _DEFAULT_CF_DOMAIN)
            if _ak and _sk:
                import boto3
                s3 = boto3.client("s3", region_name=_region, aws_access_key_id=_ak, aws_secret_access_key=_sk)
                s3_key = f"scene-bg/bg_{int(time.time())}.jpg"
                s3.put_object(Bucket=_bucket, Key=s3_key, Body=img_bytes, ContentType="image/jpeg")
                image_url = f"https://{_cf}/{s3_key}"
            else:
                os.makedirs("static/scene-bg", exist_ok=True)
                filename = f"bg_{int(time.time())}.jpg"
                with open(f"static/scene-bg/{filename}", "wb") as f:
                    f.write(img_bytes)
                _public_base = os.getenv("FRONTEND_URL", _FRONTEND_URL_DEFAULT)
                image_url = f"{_public_base}/static/scene-bg/{filename}"
        except Exception as upload_err:
            logger.warning(f"[render-bg-image] Failed to re-host image ({upload_err}), using raw DALL-E URL")
            image_url = dalle_url

        logger.info(f"[render-bg-image] Generated DALL-E image for user {user_info.get('user_id')}: {image_url}")
        return {"success": True, "image_url": image_url}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[render-bg-image] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/video-remotion/render-clip",
    responses={401: {"description": _AUTH_REQUIRED}},
)
async def render_clip_endpoint(request: Request, user_info: CurrentUser):
    """
    Render a single AI video clip for a scene prompt.
    Accepts: { scene_prompt, fal_model }
    Returns: { success, video_url }
    """
    try:
        body = await request.json()
        scene_prompt = body.get("scene_prompt", "")
        fal_model = body.get("fal_model", "fal-ai/kling-video/v1.6/standard/text-to-video")
        scene_duration_seconds = body.get("scene_duration_seconds") or body.get("clip_duration_seconds") or body.get("duration_seconds")

        if not scene_prompt:
            raise HTTPException(status_code=400, detail="scene_prompt is required")

        fal_api_key = os.getenv("FAL_API_KEY", "")

        # Build a single-scene descriptor and call the existing helper
        # (We include target duration so fal can generate motion matching the scene timing.)
        scene_descriptor = {"video_prompt": scene_prompt}
        if scene_duration_seconds is not None:
            try:
                scene_duration_seconds_f = float(scene_duration_seconds)
                if scene_duration_seconds_f > 0:
                    scene_descriptor["target_clip_duration_seconds"] = scene_duration_seconds_f
                    scene_descriptor["duration_seconds"] = scene_duration_seconds_f
            except Exception:
                pass
        results = _generate_scene_veo3_clips(
            scene_descriptors=[scene_descriptor],
            fal_api_key=fal_api_key,
            fal_model=fal_model,
        )

        video_url = results[0].get("background_video_url", "") if results else ""
        if not video_url:
            raise HTTPException(status_code=500, detail="No video URL returned from clip generation")

        logger.info(f"[render-clip] Rendered clip for user {user_info.get('user_id')}: {video_url}")
        return {"success": True, "video_url": video_url}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[render-clip] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/video-remotion/analyze",
    responses={401: {"description": _AUTH_REQUIRED}},
)
async def analyze_video_remotion_endpoint(request: Request, user_info: CurrentUser):
    """
    Step 1 of the two-step Remotion flow.
    Generates voiceover, transcribes with Whisper, and runs the GPT-4 scene descriptor agent.
    Returns the scene plan for user review BEFORE committing to the expensive Remotion render.
    Does NOT consume a video credit (no video is rendered).
    """
    try:
        body = await request.json()
        dialogue = body.get("dialogue")
        company_name = body.get("company_name", "")
        client_logo_url = body.get("client_logo_url", "")
        user_logo_url = body.get("user_logo_url", "")
        voice_id = body.get("voice_id", "")
        target_duration = body.get("target_duration", "short")  # 'short' | 'medium' | 'long'
        # VideoStudio frontend passes the selected "background model" mode here so
        # we can enrich the per-scene prompt with time allocation + model choice.
        video_mode = body.get("video_mode", "template")  # 'template' | 'none' | 'dalle' | kling ids
        # bgm is accepted for API symmetry with /video-remotion but is not used in analyze step
        body.get("bgm", _DEFAULT_BGM)

        # Map target_duration to number of subtitle segments (scenes)
        _DURATION_SCENES = {"short": 1, "medium": 3, "long": 4}
        num_scenes = _DURATION_SCENES.get(target_duration, 1)

        user_id = user_info.get('user_id')
        user_email = user_info.get('email', 'unknown')
        logger.info(f"{_LOG_ANALYZE} Analyze request from: {user_email}, company: {company_name}, target_duration={target_duration}")

        if not dialogue:
            return {"error": _DIALOGUE_REQUIRED}

        # ── Replace [company_name] placeholder ─────────────────────────────
        if company_name and _COMPANY_NAME_PLACEHOLDER in dialogue:
            dialogue = dialogue.replace(_COMPANY_NAME_PLACEHOLDER, company_name)

        # ── Resolve logo URLs ───────────────────────────────────────────────
        client_logo_url, user_logo_url, sender_name = _resolve_video_logos(
            user_id, company_name, client_logo_url, user_logo_url
        )

        # ── Generate voiceover ─────────────────────────────────────────────
        logger.info(f"{_LOG_ANALYZE} Generating voiceover with voice_id='{voice_id}'")
        audio_bytes = _generate_voiceover_bytes(dialogue, _LOG_ANALYZE, voice_id)
        tmp_audio_path = await _write_temp_mp3(audio_bytes)
        logger.info(f"{_LOG_ANALYZE} Voiceover saved to: {tmp_audio_path}")

        # ── Get audio duration ─────────────────────────────────────────────
        voiceover_duration_seconds = _get_audio_duration(tmp_audio_path, dialogue, _LOG_ANALYZE)

        # ── Transcribe and build subtitle segments ─────────────────────────
        logger.info(f"{_LOG_ANALYZE} Transcribing voiceover with Whisper...")
        raw_subtitle_segs = _transcribe_whisper(tmp_audio_path, _LOG_ANALYZE, initial_prompt=dialogue)
        if not raw_subtitle_segs:
            raw_subtitle_segs = _fallback_subtitle_segments(dialogue, voiceover_duration_seconds, _LOG_ANALYZE)

        # Fine-grained caption segments for subtitle overlay
        caption_segments = merge_subtitle_segments(raw_subtitle_segs, min_duration=0.5, max_duration=3.5)
        whisper_text = " ".join(s["text"].strip() for s in caption_segments)
        if dialogue and len(whisper_text) < len(dialogue) * 0.4:
            logger.info(f"{_LOG_ANALYZE} [Caption] Whisper coverage poor — using dialogue sentence split")
            caption_segments = _caption_segs_from_dialogue(dialogue, voiceover_duration_seconds)
        caption_segments = _fill_segment_gaps(caption_segments, voiceover_duration_seconds)
        logger.info(f"{_LOG_ANALYZE} Caption segments: {len(caption_segments)} phrases")

        # Broad segments — one per scene card
        subtitle_segments = merge_subtitle_segments(raw_subtitle_segs, min_duration=2.5, max_duration=5.0)
        subtitle_segments = _ensure_n_segments(subtitle_segments, num_scenes)
        subtitle_segments = _fill_segment_gaps(subtitle_segments, voiceover_duration_seconds)

        # ── Upload voiceover audio to S3 ───────────────────────────────────
        logger.info(f"{_LOG_ANALYZE} Uploading voiceover to S3...")
        voiceover_s3_url = _upload_audio(tmp_audio_path, _LOG_ANALYZE)

        # Clean up temp file
        try:
            os.unlink(tmp_audio_path)
        except Exception as cleanup_err:
            logger.warning(f"{_LOG_ANALYZE} Failed to delete temp audio file: {cleanup_err}")

        # ── Video Director Agent (GPT-4) ───────────────────────────────────
        logger.info(f"{_LOG_ANALYZE} Running Video Director agent...")
        scene_descriptors, subtitle_segments, video_concept, video_style, agent_system_prompt, agent_user_message = \
            _run_video_director_agent(dialogue, subtitle_segments, company_name, _LOG_ANALYZE)
        subtitle_segments = _fill_segment_gaps(subtitle_segments, voiceover_duration_seconds)

        # ── Inject video_prompt per scene (pre-fills AI prompt editor) ────────
        def _infer_scene_purpose(scene_idx: int, total_scenes: int, template_name: str) -> str:
            if total_scenes <= 1:
                return "Main Hook"
            if scene_idx == 0:
                return "Hook / Attention"
            if scene_idx == total_scenes - 1:
                return "CTA / Closing"
            return "Value / Feature"

        def _infer_model_label(mode: str) -> str:
            if mode in {"none", "template"}:
                return "Gradient (no AI background)"
            if mode == "dalle":
                return "DALL·E 3"
            # Kling ids contain mode hints in the fal model string.
            if "v1.6/standard" in mode:
                return "Kling Std"
            if "v1.6/pro" in mode:
                return "Kling Pro"
            if "v2/master" in mode:
                return "Kling Master"
            return "Kling Video"

        mood_map = {
            "GlitchReveal": "glitchy digital interference, RGB channel split, cyberpunk dark",
            "DataStream": "matrix-like cascading data streams, neon green on near-black",
            "ElectricPulse": "radial electric discharge, lightning bolts converging at centre",
            "ZoomPunch": "explosive radial motion blur, extreme kinetic energy, dark void",
            "HorizontalSlam": "horizontal velocity streaks, dramatic speed lines, dark background",
            "CinematicBars": "sweeping cinematic landscape, anamorphic lens flare, widescreen",
            "ChromaSlice": "bold diagonal colour streak slicing across a dark void",
            "SplitReveal": "two glowing worlds separating at a seam, cinematic crack",
            "GravityDrop": "objects falling through dark space with glowing motion trails",
            "TypeBurn": "burning embers, glowing monospace characters fading on black",
            "WordBurst": "massive shockwave radiating outward from centre, dark background",
            "StatShot": "concentric energy rings pulsing with data, dark tech aesthetic",
        }
        openai_api_key = os.getenv("OPENAI_API_KEY", "")
        enriched_scenes = []
        total_scenes = len(scene_descriptors) if scene_descriptors else num_scenes
        model_label = _infer_model_label(video_mode)
        for idx, scene in enumerate(scene_descriptors):
            scene = dict(scene)
            # Allocate time per scene from the subtitle segment that drives the scene card.
            # This becomes a strong cue for the video prompt and (optionally) fal duration.
            seg = subtitle_segments[idx] if idx < len(subtitle_segments) else None
            start_s = float(seg.get("start", 0)) if seg else float(voiceover_duration_seconds / max(total_scenes, 1))
            end_s = float(seg.get("end", start_s)) if seg else float(voiceover_duration_seconds / max(total_scenes, 1))
            duration_s = max(0.2, end_s - start_s)

            purpose = _infer_scene_purpose(idx, total_scenes, scene.get("template", ""))
            scene["start"] = start_s
            scene["end"] = end_s
            scene["duration_seconds"] = duration_s
            scene["purpose"] = purpose
            scene["target_clip_duration_seconds"] = duration_s

            # Base cinematic prompt for the background layer (no text/logos).
            if idx == 0:
                base_prompt = _build_smart_veo_prompt(dialogue, sender_name, company_name, openai_api_key)
            else:
                headline = scene.get("headline", "").title()
                template = scene.get("template", "")
                visual = mood_map.get(template, "abstract dark energy waves, cinematic motion")
                accent = scene.get("accent_color", "#4f9eff")

                base_prompt = (
                    f"Cinematic abstract background video for a B2B marketing presentation. "
                    f"Visual style: {visual}. Theme: {headline}. Accent color glow: {accent}. "
                    f"Deep dark background (near-black), ultra-wide, no text, no logos, no people, "
                    f"seamless ambient motion, professional high-quality CGI."
                )

            # Final scene prompt: includes purpose + time budget + chosen model.
            # The model itself is also passed to fal separately; embedding it improves consistency
            # in cases where user-edited prompts are used for regenerations.
            scene["video_prompt"] = (
                f"Scene purpose: {purpose}. "
                f"Allocated motion time: {duration_s:.1f} seconds. "
                f"Background model selected: {model_label}. "
                "Animate smoothly for the allocated duration, with energy that matches the purpose "
                "(start strong for hooks/attention, maintain a clear visual narrative for value scenes, "
                "and settle toward the end for a clean transition). "
                "No text, no logos, no people. 16:9 widescreen. Cinematic professional CGI. "
                f"{base_prompt}"
            )
            enriched_scenes.append(scene)
        scene_descriptors = enriched_scenes

        return {
            "success": True,
            "voiceover_url": voiceover_s3_url,
            "voiceover_duration_seconds": voiceover_duration_seconds,
            "subtitle_segments": subtitle_segments,
            "caption_segments": caption_segments,
            "scene_descriptors": scene_descriptors,
            "client_logo_url": client_logo_url,
            "user_logo_url": user_logo_url,
            "company_name": company_name,
            "sender_name": sender_name,
            "video_concept": video_concept,
            "video_style": video_style,
            "agent_prompt": {
                "system": agent_system_prompt,
                "user": agent_user_message,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"{_LOG_ANALYZE} Unexpected error: {e}")
        logger.exception(f"{_LOG_ANALYZE} Unexpected error:")
        return {"error": f"Remotion analyze step failed: {str(e)}"}


@router.post(
    "/video-remotion",
    responses={401: {"description": _AUTH_REQUIRED}, 403: {"description": "Limit exceeded"}},
)
async def generate_video_remotion_endpoint(request: Request, user_info: CurrentUser):
    """Generate AI video using Remotion rendering engine (frame-accurate audio sync)"""
    try:
        body = await request.json()
        dialogue = body.get("dialogue")
        company_name = body.get("company_name", "")
        video_title = body.get("video_title", "")
        social_caption = body.get("social_caption", "")
        client_logo_url = body.get("client_logo_url", "")
        user_logo_url = body.get("user_logo_url", "")
        template_video_url = body.get("template_video", _DEFAULT_TEMPLATE)
        bgm_url = body.get("bgm", _DEFAULT_BGM)
        voice_id = body.get("voice_id", "")
        show_captions = body.get("show_captions", True)
        job_id        = body.get("job_id", "")
        use_veo3      = bool(body.get("use_veo3", False))
        fal_model     = body.get("fal_model", "fal-ai/kling-video/v1.6/standard/text-to-video")
        clip_duration = int(body.get("clip_duration", 5))

        user_id: str = user_info.get('user_id') or ""
        logger.info(f"{_LOG_REMOTION} Video request from: {user_info.get('email', 'unknown')}, company: {company_name}, use_veo3={use_veo3}")

        if not dialogue:
            return {"error": _DIALOGUE_REQUIRED}

        _set_progress(job_id, 5, "Starting")
        _check_video_usage_limit(user_id)

        if company_name and _COMPANY_NAME_PLACEHOLDER in dialogue:
            dialogue = dialogue.replace(_COMPANY_NAME_PLACEHOLDER, company_name)

        _set_progress(job_id, 12, "Resolving logos")
        client_logo_url, user_logo_url, sender_name = _resolve_video_logos(
            user_id, company_name, client_logo_url, user_logo_url
        )

        # ── Audio pipeline (voiceover + subtitles + scene descriptors) ──────
        _set_progress(job_id, 18, "Preparing audio")
        voiceover_s3_url, subtitle_segments, scene_descriptors, voiceover_duration_seconds, tmp_audio_path, caption_segments = \
            await _prepare_remotion_audio(
                body.get("voiceover_url", ""), body.get("subtitle_segments", []),
                body.get("voiceover_duration_seconds", 0), body.get("scene_descriptors", []),
                dialogue, company_name, _LOG_REMOTION, voice_id,
                precomputed_caption_segments=body.get("caption_segments", []),
            )
        _set_progress(job_id, 52, "Scene plan ready")

        # ── Enrich scenes (brand color + news hook + Veo3/DALL-E) ────────────
        _set_progress(job_id, 55, "Generating backgrounds", "0 scenes done")
        scene_descriptors = _enrich_scene_descriptors_for_remotion(
            scene_descriptors, client_logo_url, company_name, os.getenv("OPENAI_API_KEY", ""),
            job_id=job_id, use_veo3=use_veo3,
            dialogue=dialogue, sender_name=sender_name,
            fal_model=fal_model, clip_duration=clip_duration,
        )

        # If AI video failed, expand to 3 DALL-E scenes
        ai_succeeded = bool(scene_descriptors and scene_descriptors[0].get("background_video_url"))
        if use_veo3 and not ai_succeeded and len(scene_descriptors) == 1:
            scene_descriptors, subtitle_segments = _expand_to_three_dalle_scenes(
                scene_descriptors, subtitle_segments, voiceover_duration_seconds,
                os.getenv("OPENAI_API_KEY", ""),
            )

        # Normalize subtitle_segments count to match scene_descriptors so Remotion
        # never falls back to FALLBACK_SPEC (which has no background fields).
        n_scenes = len(scene_descriptors)
        if n_scenes > 0 and len(subtitle_segments) != n_scenes:
            total_dur = subtitle_segments[-1]['end'] if subtitle_segments else voiceover_duration_seconds
            seg_dur = total_dur / n_scenes
            subtitle_segments = [
                {"text": "", "start": round(i * seg_dur, 2), "end": round((i + 1) * seg_dur, 2)}
                for i in range(n_scenes)
            ]
            logger.info(f"[Remotion] Normalized subtitle_segments → {n_scenes} to match scene_descriptors")

        _set_progress(job_id, 78, "Rendering video")

        # ── Call Remotion render service ─────────────────────────────────────
        remotion_url = os.getenv("REMOTION_SERVICE_URL", "http://localhost:3001")
        render_payload = {
            "voiceover_url": voiceover_s3_url, "bgm_url": bgm_url,
            "client_logo_url": client_logo_url, "user_logo_url": user_logo_url,
            "company_name": company_name or "", "sender_name": sender_name or "",
            "cta_text": _infer_cta_text(dialogue),
            "subtitle_segments": subtitle_segments, "caption_segments": caption_segments,
            "scene_descriptors": scene_descriptors,
            "voiceover_duration_seconds": voiceover_duration_seconds,
            "show_captions": show_captions,
            "output_filename": f"remotion_{int(time.time())}.mp4",
        }

        # ─── STEP 6: Remotion Render Payload ─────────────────────────────────
        logger.info("━" * 60)
        logger.info("STEP 6 ─ REMOTION RENDER PAYLOAD")
        logger.info(f"  remotion service: {remotion_url}/render")
        logger.info(f"  voiceover_url:    {render_payload['voiceover_url']}")
        logger.info(f"  bgm_url:          {render_payload['bgm_url']}")
        logger.info(f"  user_logo_url:    {render_payload['user_logo_url']}")
        logger.info(f"  sender_name:      {render_payload['sender_name']}")
        logger.info(f"  cta_text:         {render_payload['cta_text']}")
        logger.info(f"  duration:         {voiceover_duration_seconds:.2f}s")
        logger.info(f"  show_captions:    {show_captions}")
        logger.info(f"  scene_descriptors ({len(scene_descriptors)}):")
        for i, sd in enumerate(scene_descriptors):
            bg = sd.get('background_video_url') or sd.get('background_image_url') or '(none)'
            logger.info(
                f"    [{i}] template={sd.get('template')}  headline=\"{sd.get('headline')}\"  "
                f"accent={sd.get('accent_color')}  bg={bg[:70]}"
            )
        logger.info(f"  caption_segments ({len(caption_segments)}):")
        for s in caption_segments:
            logger.info(f"    {s['start']:.1f}s–{s['end']:.1f}s  \"{s['text'].strip()}\"")
        logger.info("━" * 60)
        logger.info(f"{_LOG_REMOTION} Sending render job to {remotion_url}/render ...")
        render_result = await _call_remotion_render(remotion_url, render_payload, _LOG_REMOTION)
        if isinstance(render_result, dict) and "error" in render_result:
            return render_result

        rendered_mp4_path = render_result["output_path"]
        file_size = render_result.get("file_size_bytes", 0)
        total_duration = render_result.get("duration_seconds", voiceover_duration_seconds)
        logger.info(f"{_LOG_REMOTION} Render complete: {rendered_mp4_path} ({file_size} bytes)")

        _set_progress(job_id, 93, "Uploading to cloud")
        video_url, s3_key, s3_bucket = _upload_video_to_s3(rendered_mp4_path, _LOG_REMOTION)

        try:
            if tmp_audio_path:
                os.unlink(tmp_audio_path)
            os.unlink(rendered_mp4_path)
        except Exception as cleanup_err:
            logger.warning(f"{_LOG_REMOTION} Failed to delete temp files: {cleanup_err}")

        subscription_service.increment_usage(user_id, "videos", 1)
        video_id = _save_remotion_video_metadata(
            user_id, video_url, s3_key, s3_bucket, company_name, dialogue,
            template_video_url, client_logo_url, user_logo_url, bgm_url,
            total_duration, file_size, video_title, social_caption, voice_id,
        )

        # ─── STEP 7: Final Output ─────────────────────────────────────────────
        logger.info("━" * 60)
        logger.info("STEP 7 ─ FINAL OUTPUT")
        logger.info(f"  video_url:  {video_url}")
        logger.info(f"  video_id:   {video_id}")
        logger.info(f"  duration:   {total_duration:.2f}s")
        logger.info(f"  file_size:  {file_size} bytes ({file_size // 1024} KB)")
        logger.info(f"  s3_key:     {s3_key}")
        logger.info("━" * 60)
        _set_progress(job_id, 100, "Done")
        return {
            "success": True, "video_url": video_url, "video_id": video_id,
            "engine": "remotion", "duration_seconds": total_duration,
            "scene_descriptors": scene_descriptors, "subtitle_segments": subtitle_segments,
            "message": "Remotion video generated successfully with frame-accurate audio sync",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"{_LOG_REMOTION} Unexpected error: {e}")
        logger.exception(f"{_LOG_REMOTION} Unexpected error:")
        return {"error": f"Remotion video generation failed: {str(e)}"}


@router.post(
    "/upload-user-logo",
    responses={401: {"description": _AUTH_REQUIRED}},
)
async def upload_user_logo(logo: Annotated[UploadFile, File()], user_info: CurrentUser):
    """Upload user's company logo for video generation"""
    try:
        # Validate file type
        if not logo.content_type.startswith('image/'):
            return {"error": "Please upload a valid image file (PNG, JPG, JPEG)"}

        # Validate file size (max 5MB)
        content = await logo.read()
        if len(content) > 5 * 1024 * 1024:  # 5MB
            return {"error": "Logo file size must be less than 5MB"}

        # Create logos directory
        logos_dir = "static/logos"
        os.makedirs(logos_dir, exist_ok=True)

        # Generate unique filename
        timestamp = int(time.time())
        file_extension = logo.filename.split('.')[-1] if '.' in logo.filename else 'png'
        filename = f"logo_{user_info['user_id']}_{timestamp}.{file_extension}"
        file_path = os.path.join(logos_dir, filename)

        # Save the file
        async with await anyio.open_file(file_path, "wb") as f:
            await f.write(content)

        # Generate URL - use configured frontend domain
        # The video generation service needs to access the file
        frontend_url = os.getenv('FRONTEND_URL', _FRONTEND_URL_DEFAULT)
        logo_url = f"{frontend_url}/static/logos/{filename}"

        logger.info(f"🎨 User logo uploaded: {logo.filename} -> {file_path}")
        logger.info(f"🎨 Logo URL: {logo_url}")
        logger.info(f"🎨 File saved at: {os.path.abspath(file_path)}")

        return {
            "success": True,
            "logo_url": logo_url,
            "filename": filename,
            "original_name": logo.filename,
            "size": len(content)
        }

    except Exception as e:
        logger.error(f"ERROR: Error uploading logo: {e}")
        logger.exception("Error uploading logo:")
        return {"error": f"Failed to upload logo: {str(e)}"}


@router.post(
    "/send-video-email",
    responses={401: {"description": _AUTH_REQUIRED}},
)
async def send_video_email_endpoint(request: Request, user_info: CurrentUser):
    """Send generated video link via email"""
    try:
        body = await request.json()
        video_url = body.get("video_url")
        recipient_email = body.get("recipient_email")
        company_name = body.get("company_name", "Client")
        subject = body.get("subject")  # Don't provide default, let backend generate collaborative subject

        logger.info(f" Email send request from user: {user_info['email']}")
        logger.info(f" Recipient: {recipient_email}")
        logger.info(f" Video URL: {video_url}")

        if not video_url:
            return {"success": False, "error": _VIDEO_URL_REQUIRED}

        if not recipient_email:
            return {"success": False, "error": "recipient_email is required"}

        # Validate email format
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_pattern, recipient_email):
            return {"success": False, "error": "Invalid email format"}

        # Get sender's company name from request or it will be fetched from profile
        sender_company_name = body.get("sender_company_name", None)

        result = send_video_email(
            recipient_email=recipient_email,
            video_url=video_url,
            subject=subject,
            company_name=company_name,
            sender_name="SocialFlow AI",
            user_id=user_info['user_id'],
            sender_company_name=sender_company_name
        )

        return result

    except Exception as e:
        logger.error(f"ERROR: Error sending email: {e}")
        logger.exception("Error sending email:")
        return {
            "success": False,
            "error": f"Failed to send email: {str(e)}"
        }


@router.post(
    "/post-to-facebook",
    responses={401: {"description": _AUTH_REQUIRED}},
)
async def post_video_to_facebook(request: Request, user_info: CurrentUser):
    """Post generated video to Facebook as a Reel"""
    try:
        body = await request.json()
        video_url = body.get("video_url")
        caption = body.get("caption", " Powered by SocialFlow AI!")

        logger.info(f" Facebook post request from user: {user_info['email']}")
        logger.info(f" Video URL: {video_url}")
        logger.info(f" Caption: {caption}")

        if not video_url:
            return {"success": False, "error": _VIDEO_URL_REQUIRED}

        try:
            local_path, temp_file = _resolve_video_to_local_path(video_url, tmp_prefix="facebook_upload_")
        except ValueError:
            return {
                "success": False,
                "error": f"Unsupported video URL format: {video_url}",
                "hint": _VIDEO_URL_HINT
            }
        except Exception as download_error:
            logger.error(f"Failed to download video: {download_error}")
            return {
                "success": False,
                "error": f"Failed to download video from S3: {str(download_error)}",
                "hint": _CLOUDFRONT_HINT
            }

        logger.info(f" Local file path: {local_path}")

        # Check if file exists
        if not os.path.exists(local_path):
            return {
                "success": False,
                "error": f"Video file not found at: {local_path}"
            }

        result = _fb_post_helper(local_path, caption, user_id=user_info['user_id'])

        _cleanup_temp(local_path, temp_file)

        return result

    except Exception as e:
        logger.error(f"ERROR: Error posting to Facebook: {e}")
        logger.exception("Error posting to Facebook:")
        return {
            "success": False,
            "error": f"Failed to post to Facebook: {str(e)}"
        }


@router.post(
    "/post-to-linkedin",
    responses={401: {"description": _AUTH_REQUIRED}},
)
async def post_video_to_linkedin_route(request: Request, user_info: CurrentUser):
    """Post generated video to LinkedIn"""
    try:
        body = await request.json()
        video_url = body.get("video_url")
        caption = body.get("caption", "Check out this AI-generated video!")
        title = body.get("title", "AI Generated Marketing Video")

        logger.info(f"🔗 LinkedIn post request from user: {user_info['email']}")
        logger.info(f"🔗 Video URL: {video_url}")
        logger.info(f"🔗 Caption: {caption}")

        if not video_url:
            return {"success": False, "error": _VIDEO_URL_REQUIRED}

        try:
            local_path, temp_file = _resolve_video_to_local_path(video_url, tmp_prefix="linkedin_upload_")
        except ValueError:
            return {
                "success": False,
                "error": f"Unsupported video URL format: {video_url}",
                "hint": _VIDEO_URL_HINT
            }
        except Exception as download_error:
            logger.error(f"Failed to download video: {download_error}")
            return {
                "success": False,
                "error": f"Failed to download video from S3: {str(download_error)}",
                "hint": _CLOUDFRONT_HINT
            }

        logger.info(f"🔗 Local file path: {local_path}")

        # Check if file exists
        if not os.path.exists(local_path):
            return {
                "success": False,
                "error": f"Video file not found at: {local_path}"
            }

        result = post_video_to_linkedin(local_path, caption, title, user_id=user_info['user_id'])

        _cleanup_temp(local_path, temp_file)

        return result

    except Exception as e:
        logger.error(f"ERROR: Error posting to LinkedIn: {e}")
        logger.exception("Error posting to LinkedIn:")
        return {
            "success": False,
            "error": f"Failed to post to LinkedIn: {str(e)}"
        }


@router.post(
    "/post-to-instagram",
    responses={401: {"description": _AUTH_REQUIRED}},
)
async def post_video_to_instagram_route(request: Request, user_info: CurrentUser):
    """Post a video URL to Instagram as a Reel."""
    try:
        body = await request.json()
        video_url = body.get("video_url")
        caption = body.get("caption", "✨ Powered by SocialFlow AI!")

        logger.info(f"📸 Instagram post request from user: {user_info['email']}")
        logger.info(f"📸 Video URL: {video_url}")

        if not video_url:
            return {"success": False, "error": _VIDEO_URL_REQUIRED}

        # Download video to a local path for the graph API pipeline
        try:
            local_path, temp_file = _resolve_video_to_local_path(video_url, tmp_prefix="ig_upload_")
        except ValueError:
            return {"success": False, "error": f"Unsupported video URL format: {video_url}", "hint": _VIDEO_URL_HINT}
        except Exception as download_error:
            logger.error(f"Failed to download video for Instagram: {download_error}")
            return {"success": False, "error": f"Failed to download video: {str(download_error)}", "hint": _CLOUDFRONT_HINT}

        if not os.path.exists(local_path):
            return {"success": False, "error": f"Video file not found at: {local_path}"}

        try:
            result = _ig_graph_post(
                local_path=local_path,
                caption=caption,
                user_id=user_info['user_id'],
            )
        finally:
            _cleanup_temp(local_path, temp_file)

        return result

    except Exception as e:
        logger.error(f"ERROR: Error posting to Instagram: {e}")
        logger.exception("Error posting to Instagram:")
        return {
            "success": False,
            "error": f"Failed to post to Instagram: {str(e)}"
        }


@router.post(
    "/post-to-youtube",
    responses={401: {"description": _AUTH_REQUIRED}},
)
async def post_video_to_youtube_route(request: Request, user_info: CurrentUser):
    """Post generated video to YouTube using OAuth2"""
    try:
        body = await request.json()
        video_url = body.get("video_url")
        title = body.get("title", "AI Generated Marketing Video")
        description = body.get("description", "✨ Powered by SocialFlow AI!")

        logger.info(f"📺 YouTube post request from user: {user_info['email']}")
        logger.info(f"📺 Video URL: {video_url}")
        logger.info(f"📺 Title: {title}")

        if not video_url:
            return {"success": False, "error": _VIDEO_URL_REQUIRED}

        try:
            local_path, temp_file = _resolve_video_to_local_path(video_url, tmp_prefix="youtube_upload_")
        except ValueError:
            return {
                "success": False,
                "error": f"Unsupported video URL format: {video_url}",
                "hint": _VIDEO_URL_HINT
            }
        except Exception as download_error:
            logger.error(f"Failed to download video: {download_error}")
            return {
                "success": False,
                "error": f"Failed to download video from S3: {str(download_error)}",
                "hint": _CLOUDFRONT_HINT
            }

        logger.info(f"📺 Local file path: {local_path}")

        # Check if file exists
        if not os.path.exists(local_path):
            return {
                "success": False,
                "error": f"Video file not found at: {local_path}"
            }

        try:
            result = post_video_to_youtube(local_path, title, description, user_id=user_info['user_id'])
        finally:
            # Clean up temporary file if it was downloaded
            _cleanup_temp(local_path, temp_file)

        return result

    except Exception as e:
        logger.error(f"ERROR: Error posting to YouTube: {e}")
        logger.exception("Error posting to YouTube:")

        return {
            "success": False,
            "error": f"Failed to post to YouTube: {str(e)}"
        }


