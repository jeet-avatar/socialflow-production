import logging
import traceback
from elevenlabs.client import ElevenLabs
try:
    from moviepy import VideoFileClip, AudioFileClip, TextClip, CompositeVideoClip, CompositeAudioClip, ImageClip, ColorClip, concatenate_videoclips
except ImportError:
    try:
        from moviepy.editor import VideoFileClip, AudioFileClip, TextClip, CompositeVideoClip, CompositeAudioClip, ImageClip, ColorClip, concatenate_videoclips
    except ImportError:
        logger.debug("WARNING: MoviePy not installed. Video generation will not work.")
        VideoFileClip = None

# Handle crop separately - moviepy 2.x renamed it to Crop
try:
    from moviepy.video.fx import Crop as _Crop

    def crop(clip, x_center=None, y_center=None, width=None, height=None, **kwargs):
        return _Crop(x_center=x_center, y_center=y_center, width=width, height=height).apply(clip)
except ImportError:
    try:
        from moviepy.video.fx.all import crop
    except ImportError:
        crop = None

import requests, os
from io import BytesIO
from PIL import Image
import whisper
import warnings
import tempfile
import numpy as np
import boto3
import time
import ssl
import urllib.request
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Ensure ffmpeg is in PATH — use imageio_ffmpeg's bundled binary as fallback.
# This fixes "FFmpeg not found" on AWS (no system ffmpeg) and VSCode terminals
# where /opt/homebrew/bin is not in PATH.
try:
    import imageio_ffmpeg as _iio_ffmpeg
    _ffmpeg_exe = _iio_ffmpeg.get_ffmpeg_exe()
    _ffmpeg_dir = os.path.dirname(_ffmpeg_exe)
    if _ffmpeg_dir not in os.environ.get('PATH', ''):
        os.environ['PATH'] = _ffmpeg_dir + os.pathsep + os.environ.get('PATH', '')
    logger.debug(f"FFmpeg available at: {_ffmpeg_exe}")
except Exception as _e:
    logger.debug(f"WARNING: imageio_ffmpeg setup failed: {_e}")

warnings.filterwarnings("ignore", message="FP16 is not supported on CPU")

# Fix for Pillow 10.x compatibility with MoviePy
# ANTIALIAS was removed in Pillow 10.0.0, replaced with LANCZOS
if not hasattr(Image, 'ANTIALIAS'):
    Image.ANTIALIAS = Image.LANCZOS

# Helper function for MoviePy compatibility (subclip vs subclipped)
def get_subclip(clip, start, end=None):
    """
    Get a subclip - compatible with both old and new MoviePy versions
    Old: clip.subclip(start, end)
    New: clip.subclipped(start, end)
    """
    if hasattr(clip, 'subclipped'):
        return clip.subclipped(start, end) if end else clip.subclipped(start)
    elif hasattr(clip, 'subclip'):
        return clip.subclip(start, end) if end else clip.subclip(start)
    else:
        raise AttributeError("Clip has neither 'subclip' nor 'subclipped' method")

# Configure ImageMagick for MoviePy TextClip
# Try to find ImageMagick binary
import shutil  # noqa: E402
imagemagick_binary = shutil.which('convert')
if imagemagick_binary:
    os.environ['IMAGEMAGICK_BINARY'] = imagemagick_binary
    logger.debug(f"ImageMagick found at: {imagemagick_binary}")
else:
    # Common ImageMagick paths on macOS
    possible_paths = [
        '/opt/homebrew/bin/convert',  # Apple Silicon
        '/usr/local/bin/convert',      # Intel Mac
        '/opt/local/bin/convert',      # MacPorts
    ]
    for path in possible_paths:
        if os.path.exists(path):
            os.environ['IMAGEMAGICK_BINARY'] = path
            logger.debug(f"ImageMagick found at: {path}")
            break
    else:
        logger.debug("WARNING: ImageMagick not found. TextClip may not work. Install with: brew install imagemagick")

# Fix SSL certificate issues for whisper model downloads — use certifi bundle
import certifi
logger = logging.getLogger(__name__)
ssl_context = ssl.create_default_context(cafile=certifi.where())
urllib.request.install_opener(urllib.request.build_opener(urllib.request.HTTPSHandler(context=ssl_context)))

# Module-level string constants (S1192)
_STATIC_DIR = "static/"
_FALLBACK_LOGO_MSG = "⚠️  Using fallback placeholder logo (blue box)"
_DEFAULT_LOGO_MSG = "INFO: Using default logo"

def fetch_if_url(path_or_url, file_ext="mp4"):
    """Download file if given a URL, otherwise return local path."""
    if path_or_url and path_or_url.startswith("http"):
        r = requests.get(path_or_url, stream=True)
        r.raise_for_status()
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=f".{file_ext}")
        for chunk in r.iter_content(chunk_size=8192):
            temp_file.write(chunk)
        temp_file.close()
        logger.debug(f"Downloaded remote file to {temp_file.name}")
        return temp_file.name
    return path_or_url

def _load_logo_from_local(url: str):
    """Load logo from local file system for socialflow.network static URLs."""
    relative_path = url.split("/static/")[1]
    current_dir = os.path.dirname(os.path.abspath(__file__))
    backend_app_dir = os.path.dirname(current_dir)  # Go up from utils/ to app/
    local_file_path = os.path.join(backend_app_dir, "static", relative_path)

    logger.debug(f"   📁 Reading from local file: {local_file_path}")

    if os.path.exists(local_file_path):
        with open(local_file_path, 'rb') as f:
            img_data = f.read()
        logger.debug(f"   ✅ Read {len(img_data)} bytes from local file")
        img = Image.open(BytesIO(img_data))
        logger.debug(f"   Image format: {img.format}, mode: {img.mode}, size: {img.size}")
        return img
    else:
        logger.debug(f"   ❌ Local file not found: {local_file_path}")
        raise FileNotFoundError(f"Logo file not found: {local_file_path}")

def _load_logo_from_url(url: str):
    """Download logo from an external HTTP URL."""
    logger.debug("   🌐 Downloading from external URL")
    r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
    logger.debug(f"   Response status: {r.status_code}")
    r.raise_for_status()

    logger.debug(f"   Content length: {len(r.content)} bytes")
    logger.debug(f"   Content type: {r.headers.get('content-type', 'unknown')}")

    img = Image.open(BytesIO(r.content))
    logger.debug(f"   Image format: {img.format}, mode: {img.mode}, size: {img.size}")
    return img

def _make_transparent(img):
    """Make white/light background pixels transparent."""
    datas = img.getdata()
    new_data = []
    for item in datas:
        # If pixel is very light (close to white), make it transparent
        if item[0] > 200 and item[1] > 200 and item[2] > 200:
            new_data.append((255, 255, 255, 0))
        else:
            new_data.append(item)
    img.putdata(new_data)
    return img

def _fallback_logo():
    """Return a plain blue placeholder image."""
    return Image.new('RGBA', (200, 200), (100, 100, 255, 255))

def download_logo(url):
    """Download logo from URL or load from local file system"""
    try:
        logger.debug(f"📥 Loading logo from: {url}")

        # Check if it's a socialflow.network URL pointing to our static files
        if "/static/" in url and "socialflow.network" in url:
            img = _load_logo_from_local(url)
        else:
            img = _load_logo_from_url(url)

        if img.mode != 'RGBA':
            img = img.convert("RGBA")

        img = _make_transparent(img)
        logger.debug(f"✅ Logo loaded and processed successfully: {img.size[0]}x{img.size[1]}")
        return img

    except FileNotFoundError as e:
        logger.debug(f"❌ File not found: {str(e)}")
        logger.debug(_FALLBACK_LOGO_MSG)
        return _fallback_logo()
    except requests.exceptions.RequestException as e:
        logger.debug(f"❌ Network error downloading logo from {url}")
        logger.debug(_FALLBACK_LOGO_MSG)
        return _fallback_logo()
    except Exception as e:
        logger.debug(f"❌ Error processing logo from {url}")
        logger.debug(_FALLBACK_LOGO_MSG)
        traceback.print_exc()
        return _fallback_logo()

def imageclip_from_buffer(img):
    """Convert PIL Image to MoviePy ImageClip"""
    try:
        # Ensure image is in RGBA mode
        if img.mode != 'RGBA':
            img = img.convert('RGBA')

        # Convert PIL Image to numpy array
        img_array = np.array(img)

        # Create ImageClip from numpy array
        return ImageClip(img_array)

    except Exception as e:
        logger.debug(f"❌ Error creating ImageClip: {e}")
        # Return a default colored clip as fallback
        fallback_array = np.full((200, 200, 4), [100, 100, 255, 255], dtype=np.uint8)
        return ImageClip(fallback_array)

_DEFAULT_LOGO_URL = "https://img.freepik.com/premium-vector/abstract-logo-design-any-corporate-brand-business-company_1253202-84182.jpg"


def _resolve_client_logo(company_name, user_id, client_logo_url):
    """Priority-1: fetch logo from campaigns collection. Falls back to provided URL or default."""
    if company_name and user_id:
        try:
            from utils.campaigns_service import campaigns_service
            logger.debug(f"Fetching logo URL from campaigns collection for company: {company_name}")
            campaigns = campaigns_service.search_campaigns(user_id, company_name, limit=1)
            if campaigns:
                fetched = campaigns[0].get('logo_url', '')
                if fetched:
                    logger.debug(f"SUCCESS: Using logo URL from campaigns collection: {fetched[:80]}...")
                    return fetched
                logger.debug("WARNING: Campaign found but no logo_url stored")
            else:
                logger.debug(f"WARNING: No campaign found for company: {company_name}")
        except Exception as e:
            logger.debug(f"WARNING: Error fetching logo from campaigns collection: {e}")
        resolved = client_logo_url or _DEFAULT_LOGO_URL
        logger.debug(_DEFAULT_LOGO_MSG)
        return resolved
    if not client_logo_url:
        logger.debug("INFO: No company_name/user_id provided, using default logo")
        return _DEFAULT_LOGO_URL
    return client_logo_url


def _generate_audio(narration_text):
    """Generate voiceover via ElevenLabs; fall back to gTTS on failure."""
    try:
        el_client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))
        audio_data = el_client.generate(
            text=narration_text,
            voice="2EiwWnXFnvU5JabPnv8n",
            model="eleven_multilingual_v2"
        )
        logger.debug("ElevenLabs voiceover generated successfully.")
        return BytesIO(b"".join(audio_data))
    except Exception as e:
        logger.debug(f"WARNING: ElevenLabs quota or API error: {e}")
        logger.debug("Switching to fallback voice using gTTS (Google Text-to-Speech)...")
        from gtts import gTTS
        buf = BytesIO()
        gTTS(text=narration_text, lang="en", slow=False).write_to_fp(buf)
        buf.seek(0)
        logger.debug("Fallback voiceover generated using gTTS.")
        return buf


def _build_subtitle_clips(segments, disclaimer_duration, video, selected_font):
    """Convert Whisper transcript segments into timed TextClip objects."""
    clips = []
    for seg in segments:
        clip = (
            TextClip(
                txt=seg["text"],  # type: ignore
                font=selected_font,
                fontsize=48,
                color='white',
                stroke_color='black',
                stroke_width=3,
                size=(video.w - 200, None),
                method='caption',
                kerning=-1,
            )
            .set_start(disclaimer_duration + seg["start"])  # type: ignore
            .set_duration(seg["end"] - seg["start"])  # type: ignore
            .set_position(('center', video.h - 200))
        )
        clips.append(clip)
    return clips


def _build_text_layover_clips(text_layovers, video, selected_font):
    """Convert text-layover spec dicts into timed TextClip objects."""
    if not text_layovers:
        logger.debug("INFO: No text layovers provided; skipping overlays.")
        return []
    logger.debug("📺 Using absolute timeline for text layovers (0s = start of full video)")
    clips = []
    for item in text_layovers:
        start = item.get("start_time", 0)
        dur = item.get("duration", 3)
        overlay = (
            TextClip(
                txt=item["text"],
                font=selected_font,
                fontsize=120,
                color='white',
                stroke_color='black',
                stroke_width=5,
                size=(video.w - 300, None),
                method='caption',
                kerning=-2,
            )
            .set_start(start)
            .set_duration(dur)
            .set_position('center')
        )
        clips.append(overlay)
        logger.debug(f"Added layover: {item['text']} from {start}s to {start + dur}s")
    return clips


def _save_and_upload(local_file, local_filename, timestamp):
    """Upload to S3/CloudFront; return URL. Falls back to local URL on failure."""
    try:
        aws_access_key = os.getenv("AWS_ACCESS_KEY_ID")
        aws_secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
        aws_region = os.getenv("AWS_REGION", "us-east-1")
        if not aws_access_key or not aws_secret_key:
            raise RuntimeError("AWS credentials not configured in .env file")
        s3 = boto3.client(
            "s3",
            aws_access_key_id=aws_access_key,
            aws_secret_access_key=aws_secret_key,
            region_name=aws_region,
        )
        bucket_name = os.getenv("AWS_S3_BUCKET", "socialflow-demo-bucket")
        cloudfront_domain = os.getenv("CLOUDFRONT_DOMAIN", "d2nbx2qjod9qta.cloudfront.net")
        key_name = f"videos/generated_video_{timestamp}.mp4"
        logger.debug(f"📤 Uploading to s3://{bucket_name}/{key_name}")
        s3.upload_file(Filename=local_file, Bucket=bucket_name, Key=key_name, ExtraArgs={'ContentType': 'video/mp4'})
        video_url = f"https://{cloudfront_domain}/{key_name}"
        logger.debug(f"🌐 CloudFront Video URL: {video_url}")
        return video_url
    except Exception as s3_error:
        logger.debug(f"⚠️  WARNING: S3 upload failed: {s3_error}")
        frontend_url = os.getenv('FRONTEND_URL', 'https://socialflow.network')
        return f"{frontend_url}/{_STATIC_DIR}{local_filename}"


def generate_video(
    narration_text,
    template_video="https://d2nbx2qjod9qta.cloudfront.net/red-template.mp4",
    client_logo_url=None,
    user_logo_url="https://media.licdn.com/dms/image/v2/C510BAQFXdme9gsMwUg/company-logo_200_200/company-logo_200_200/0/1630635608408/criticalriver_logo?e=1763596800&v=beta&t=-LL-ztJ0wzw_eJBdssokTgQVIR5-nVfFggyKL3edaU0",
    bgm="https://d2nbx2qjod9qta.cloudfront.net/background_music.mp3",
    text_layovers=None,
    selected_font='Avenir',
    company_name=None,
    user_id=None
):
    if not shutil.which('ffmpeg'):
        raise FileNotFoundError("FFmpeg not found. Please install FFmpeg to generate videos.")

    logger.debug("FFmpeg found, proceeding with video generation...")
    logger.debug(f"Parameters: company_name={company_name}, user_id={user_id}, client_logo_url={client_logo_url[:50] if client_logo_url else 'None'}...")

    client_logo_url = _resolve_client_logo(company_name, user_id, client_logo_url)

    template_video = fetch_if_url(template_video, "mp4")
    bgm = fetch_if_url(bgm, "mp3")
    disclaimer_path = fetch_if_url("https://d2nbx2qjod9qta.cloudfront.net/disclamer.mp4", "mp4")

    audio_bytes_io = _generate_audio(narration_text)

    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp:
        tmp.write(audio_bytes_io.read())
        temp_audio_path = tmp.name

    voiceover_audio_clip = AudioFileClip(temp_audio_path)
    voiceover_duration = voiceover_audio_clip.duration

    if not template_video or not os.path.exists(template_video):
        logger.debug("WARNING: No input video found. Creating a blank video instead.")
        video = ColorClip(size=(1920, 1080), color=(0, 0, 0), duration=voiceover_duration).with_fps(24)
    else:
        video = VideoFileClip(template_video)
        if video.duration > voiceover_duration:
            video = get_subclip(video, 0, voiceover_duration)

    result = whisper.load_model("tiny").transcribe(temp_audio_path)
    os.unlink(temp_audio_path)

    # Load disclaimer clip if available
    disclaimer_duration = 0
    disclaimer = None
    if os.path.exists(disclaimer_path):
        disc_clip = get_subclip(VideoFileClip(disclaimer_path), 0, 3)
        disclaimer = crop(
            disc_clip,
            x_center=disc_clip.w / 2,
            y_center=disc_clip.h / 2,
            width=video.w,  # type: ignore
            height=video.h,  # type: ignore
        ).set_position("center")
        disclaimer_duration = disclaimer.duration

    client_logo_img_pil = download_logo(client_logo_url)
    user_logo_img_pil = download_logo(user_logo_url)

    logo_width = int(video.w * 0.5)  # type: ignore
    background_clip = get_subclip(video, 0, min(video.duration, 4)).without_audio().resize(height=video.h).resize(width=video.w)  # type: ignore
    logo_intro = CompositeVideoClip([
        background_clip,
        imageclip_from_buffer(client_logo_img_pil).resize(width=logo_width).set_duration(2).set_start(0).set_position("center"),
        imageclip_from_buffer(user_logo_img_pil).resize(width=logo_width).set_duration(2).set_start(2).set_position("center"),
    ]).set_duration(4)

    intro_sequence = concatenate_videoclips([disclaimer, logo_intro]) if disclaimer else logo_intro
    intro_duration = intro_sequence.duration

    video = get_subclip(video, min(video.duration, 4), min(video.duration, 4 + voiceover_duration)).set_start(intro_duration)  # type: ignore

    logo_size = (180, 180)
    logo_fixed_client = imageclip_from_buffer(client_logo_img_pil).resize(logo_size).set_position((30, 30)).set_start(intro_duration).set_duration(voiceover_duration)  # type: ignore
    logo_fixed_user = imageclip_from_buffer(user_logo_img_pil).resize(logo_size).set_position((video.w - logo_size[0] - 30, 30)).set_start(intro_duration).set_duration(voiceover_duration)  # type: ignore

    combined_audio = CompositeAudioClip([
        AudioFileClip(bgm).volumex(0.1).set_start(0).set_duration(intro_duration + voiceover_duration),
        voiceover_audio_clip.set_start(disclaimer_duration).volumex(1),
    ])

    subtitle_clips = _build_subtitle_clips(result["segments"], disclaimer_duration, video, selected_font)
    text_layover_clips = _build_text_layover_clips(text_layovers, video, selected_font)

    final = CompositeVideoClip(
        [intro_sequence, video, logo_fixed_client, logo_fixed_user] + subtitle_clips + text_layover_clips,
        size=(video.w, video.h),  # type: ignore
    )
    final = get_subclip(final.set_audio(combined_audio), 0, disclaimer_duration + voiceover_duration)

    timestamp = int(time.time())
    local_filename = "generated_video.mp4"
    current_dir = os.path.dirname(os.path.abspath(__file__))
    static_dir = os.path.join(os.path.dirname(current_dir), "static")
    local_file = os.path.join(static_dir, local_filename)
    os.makedirs(static_dir, exist_ok=True)

    try:
        for f in os.listdir(static_dir):
            if f.startswith("generated_video") and f.endswith(".mp4"):
                old = os.path.join(static_dir, f)
                os.remove(old)
                logger.debug(f"🗑️  Deleted old video: {f}")
    except Exception as e:
        logger.debug(f"⚠️  Warning: Could not clean old videos: {e}")

    logger.debug(f"Saving video to: {local_file} ({video.w}x{video.h}, {final.duration:.2f}s)")
    final.write_videofile(local_file, fps=getattr(video, 'fps', 24), codec="libx264", audio_codec="aac")
    logger.debug(f"Video saved locally: {local_file}")

    if not os.path.exists(local_file):
        logger.debug(f"ERROR: File not created at {local_file}")
        return {"error": "Failed to save video file"}

    logger.debug(f"File confirmed: {local_file} ({os.path.getsize(local_file)} bytes)")
    return _save_and_upload(local_file, local_filename, timestamp)


if __name__ == "__main__":
    narration_text = "Hello [company_name]! Welcome to Critical River. We are excited to have you on board. Let's achieve great things together!"

    # Publicly accessible sample video and audio URLs
    template_video = "https://d2nbx2qjod9qta.cloudfront.net/red-template.mp4"
    bgm = "https://d2nbx2qjod9qta.cloudfront.net/background_music.mp3"

    # User logo (Critical River)
    user_logo_url = "https://media.licdn.com/dms/image/v2/C510BAQFXdme9gsMwUg/company-logo_200_200/company-logo_200_200/0/1630635608408/criticalriver_logo?e=1763596800&v=beta&t=-LL-ztJ0wzw_eJBdssokTgQVIR5-nVfFggyKL3edaU0"

    # Optional layovers
    text_layovers = [
        {"text": "Streamline Production", "start_time": 9, "duration": 3},
    ]

    selected_font = "Avenir"

    # Example: Generate video with company_name and user_id to fetch logo from campaigns
    # The client_logo_url will be automatically fetched from campaigns collection
    company_name = "Example Company"  # Replace with actual company name
    user_id = "test-user-id"  # Replace with actual user ID

    generate_video(
        narration_text=narration_text,
        template_video=template_video,
        client_logo_url=None,  # Will be fetched from campaigns collection
        user_logo_url=user_logo_url,
        bgm=bgm,
        text_layovers=text_layovers,
        selected_font=selected_font,
        company_name=company_name,
        user_id=user_id
    )
