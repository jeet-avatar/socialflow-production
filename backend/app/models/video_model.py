"""
Video Model - Defines the structure for video metadata in MongoDB
Videos are stored in S3, only metadata is stored in MongoDB
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone

class VideoMetadata(BaseModel):
    """Model for video metadata stored in MongoDB (not the actual video file)"""
    user_id: str
    company_name: Optional[str] = ""
    campaign_id: Optional[str] = None

    # S3 Storage References
    video_url: str  # Full S3 URL or CloudFront URL
    s3_bucket: Optional[str] = "socialflow-demo-bucket"
    s3_key: Optional[str] = ""  # e.g., "videos/user-123/campaign-456/video_1234567890.mp4"
    thumbnail_url: Optional[str] = ""
    thumbnail_s3_key: Optional[str] = ""

    # Video Information
    title: str
    description: Optional[str] = ""
    narration_text: Optional[str] = ""
    duration: Optional[float] = 0  # in seconds
    file_size: Optional[int] = 0  # in bytes
    resolution: Optional[str] = "1920x1080"
    format: Optional[str] = "mp4"

    # Generation Parameters (for regeneration)
    template_video: Optional[str] = ""
    client_logo_url: Optional[str] = ""
    user_logo_url: Optional[str] = ""
    bgm: Optional[str] = ""
    selected_font: Optional[str] = "Avenir"
    text_layovers: Optional[List[Dict[str, Any]]] = []

    # Status & Metadata
    status: str = "completed"  # draft, processing, completed, failed
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    # Analytics (stored in MongoDB, not S3)
    views: int = 0
    downloads: int = 0
    shares: int = 0
    last_viewed_at: Optional[str] = None

    # Organization
    tags: Optional[List[str]] = []
    category: Optional[str] = ""
    is_favorite: bool = False

    # Custom fields for extensibility
    custom_fields: Optional[Dict[str, Any]] = {}

class VideoCreateRequest(BaseModel):
    """Request model for creating a video record"""
    company_name: Optional[str] = ""
    campaign_id: Optional[str] = None
    video_url: str  # S3 URL
    s3_key: Optional[str] = ""
    thumbnail_url: Optional[str] = ""
    title: str
    description: Optional[str] = ""
    narration_text: Optional[str] = ""
    duration: Optional[float] = 0
    file_size: Optional[int] = 0
    tags: Optional[List[str]] = []
    template_video: Optional[str] = ""
    client_logo_url: Optional[str] = ""
    user_logo_url: Optional[str] = ""
    bgm: Optional[str] = ""
    selected_font: Optional[str] = "Avenir"
    text_layovers: Optional[List[Dict[str, Any]]] = []

class VideoUpdateRequest(BaseModel):
    """Request model for updating a video record"""
    title: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[str] = None
    category: Optional[str] = None
    is_favorite: Optional[bool] = None

class VideoAnalyticsUpdate(BaseModel):
    """Request model for updating video analytics"""
    increment_views: bool = False
    increment_downloads: bool = False
    increment_shares: bool = False
