"""
Videos API Routes with User Authentication and Data Isolation
Handles video metadata only - actual videos are stored in S3
"""

import logging
import os
from typing import Annotated, Optional, List

import boto3
import requests
from fastapi import APIRouter, HTTPException, Depends, Header, Query
from fastapi.responses import StreamingResponse

from models.video_model import VideoCreateRequest, VideoUpdateRequest, VideoAnalyticsUpdate
from utils.middleware.auth_middleware import auth_middleware
from utils.s3_service import delete_s3_object
from utils.subscription_service import subscription_service
from utils.videos_service import videos_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/videos", tags=["videos"])

_VIDEO_NOT_FOUND = "Video not found"

_R_500 = {500: {"description": "Internal server error"}}
_R_404 = {404: {"description": _VIDEO_NOT_FOUND}}
_R_404_500 = {**_R_404, **_R_500}


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------

def get_current_user(authorization: Annotated[Optional[str], Header()] = None) -> str:
    """Dependency to get current authenticated user"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication required")

    user_info = auth_middleware.verify_token(authorization)

    if not user_info:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if not user_info.get('user_id'):
        raise HTTPException(status_code=401, detail="Invalid token - no user_id")

    return user_info['user_id']


CurrentUser = Annotated[str, Depends(get_current_user)]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post(
    "/",
    response_model=dict,
    responses={403: {"description": "Video limit exceeded"}, 500: {"description": "Internal server error"}},
)
async def create_video(video_data: VideoCreateRequest, user_id: CurrentUser):
    """
    Create a new video metadata record.
    NOTE: Video file should already be uploaded to S3.
    """
    try:
        logger.info(f"Creating video metadata for user: {user_id}")

        limit_check = subscription_service.check_usage_limit(user_id, "videos")
        if not limit_check["can_proceed"]:
            logger.warning(f"User {user_id} exceeded video limit: {limit_check['current_usage']}/{limit_check['limit']}")
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "limit_exceeded",
                    "message": f"You've reached your limit of {limit_check['limit']} videos this month",
                    "current_usage": limit_check["current_usage"],
                    "limit": limit_check["limit"],
                    "plan": limit_check["plan"],
                    "upgrade_message": "Upgrade to Professional for unlimited videos!",
                    "upgrade_url": "/subscription",
                },
            )

        video = videos_service.create_video(video_data.dict(), user_id)
        subscription_service.increment_usage(user_id, "videos", 1)
        updated_limit = subscription_service.check_usage_limit(user_id, "videos")

        return {
            "success": True,
            "message": "Video metadata created successfully",
            "video": video,
            "usage": {
                "videos_used": updated_limit["current_usage"],
                "videos_limit": updated_limit["limit"],
                "videos_remaining": updated_limit["remaining"],
                "plan": updated_limit["plan"],
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Video metadata creation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create video metadata: {str(e)}")


@router.get(
    "/",
    response_model=List[dict],
    responses=_R_500,
)
async def get_videos(
    user_id: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    skip: Annotated[int, Query(ge=0)] = 0,
    status: Annotated[Optional[str], Query()] = None,
    company_name: Annotated[Optional[str], Query()] = None,
    category: Annotated[Optional[str], Query()] = None,
    is_favorite: Annotated[Optional[bool], Query()] = None,
    sort_by: Annotated[str, Query()] = "created_at",
    sort_order: Annotated[int, Query()] = -1,
):
    """Get video metadata for the authenticated user. Returns metadata only — videos are streamed from S3."""
    try:
        videos = videos_service.get_user_videos(
            user_id=user_id,
            limit=limit,
            skip=skip,
            status=status,
            company_name=company_name,
            category=category,
            is_favorite=is_favorite,
            sort_by=sort_by,
            sort_order=sort_order,
        )
        logger.info(f"Retrieved {len(videos)} video records for user: {user_id}")
        return videos
    except Exception as e:
        logger.error(f"Failed to get videos: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get videos: {str(e)}")


@router.get("/stats", response_model=dict, responses=_R_500)
async def get_videos_stats(user_id: CurrentUser):
    """Get video statistics for the authenticated user."""
    try:
        stats = videos_service.get_videos_stats(user_id)
        return {"success": True, "stats": stats}
    except Exception as e:
        logger.error(f"Failed to get video stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get video stats: {str(e)}")


@router.get(
    "/search/{search_query}",
    response_model=List[dict],
    responses=_R_500,
)
async def search_videos(
    search_query: str,
    user_id: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    """Search video metadata for the authenticated user."""
    try:
        videos = videos_service.search_videos(user_id, search_query, limit)
        logger.info(f"Found {len(videos)} videos matching search query")
        return videos
    except Exception as e:
        logger.error(f"Video search failed: {e}")
        raise HTTPException(status_code=500, detail=f"Video search failed: {str(e)}")


@router.get("/proxy-download", responses=_R_500)
async def proxy_download_by_url(
    url: Annotated[str, Query()],
    filename: Annotated[str, Query()] = "video.mp4",
):
    """
    Stream any S3/CloudFront video URL through the backend so the browser
    receives Content-Disposition: attachment. No auth required — URLs are
    already time-limited or public CloudFront links.
    """
    try:
        logger.info(f"Proxy download for URL: {url[:80]}...")

        def iter_content():
            r = requests.get(url, stream=True, timeout=60)
            r.raise_for_status()
            for chunk in r.iter_content(chunk_size=65536):
                if chunk:
                    yield chunk

        # Strip characters that can't be encoded in latin-1 (required by HTTP header spec)
        safe_filename = filename.replace('"', '').encode('latin-1', errors='replace').decode('latin-1')
        # Use RFC 5987 encoding so Unicode titles are preserved in modern browsers
        from urllib.parse import quote
        utf8_encoded = quote(filename, safe='')
        return StreamingResponse(
            iter_content(),
            media_type="video/mp4",
            headers={"Content-Disposition": f'attachment; filename="{safe_filename}"; filename*=UTF-8\'\'{utf8_encoded}'},
        )
    except Exception as e:
        logger.error(f"proxy-download failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{video_id}", response_model=dict, responses=_R_404_500)
async def get_video(video_id: str, user_id: CurrentUser):
    """Get specific video metadata by ID. Returns metadata only — video is streamed from S3."""
    try:
        video = videos_service.get_video_by_id(video_id, user_id)
        if not video:
            raise HTTPException(status_code=404, detail=_VIDEO_NOT_FOUND)
        return {"success": True, "video": video}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get video: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get video: {str(e)}")


@router.put(
    "/{video_id}",
    response_model=dict,
    responses={400: {"description": "No valid fields"}, 404: {"description": _VIDEO_NOT_FOUND}, 500: {"description": "Internal server error"}},
)
async def update_video(video_id: str, update_data: VideoUpdateRequest, user_id: CurrentUser):
    """Update video metadata for the authenticated user."""
    try:
        update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
        if not update_dict:
            raise HTTPException(status_code=400, detail="No valid fields to update")
        success = videos_service.update_video(video_id, user_id, update_dict)
        if not success:
            raise HTTPException(status_code=404, detail=_VIDEO_NOT_FOUND)
        return {"success": True, "message": "Video metadata updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update video: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update video: {str(e)}")


@router.post("/{video_id}/analytics", response_model=dict, responses=_R_404_500)
async def update_video_analytics(video_id: str, analytics: VideoAnalyticsUpdate, user_id: CurrentUser):
    """Update video analytics (views, downloads, shares)."""
    try:
        success = videos_service.update_analytics(video_id, user_id, analytics.dict())
        if not success:
            raise HTTPException(status_code=404, detail=_VIDEO_NOT_FOUND)
        return {"success": True, "message": "Analytics updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update analytics: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update analytics: {str(e)}")


@router.get("/{video_id}/download", response_model=dict, responses=_R_404_500)
async def get_download_url(video_id: str, user_id: CurrentUser):
    """Get a presigned S3 download URL for a video (valid 1 hour)."""
    try:
        video = videos_service.get_video_by_id(video_id, user_id)
        if not video:
            raise HTTPException(status_code=404, detail=_VIDEO_NOT_FOUND)

        aws_access_key = os.getenv("AWS_ACCESS_KEY_ID")
        aws_secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
        aws_region = os.getenv("AWS_REGION", "us-east-1")

        if not aws_access_key or not aws_secret_key:
            return {"success": True, "download_url": video.get('video_url'), "method": "direct"}

        s3_key = video.get('s3_key', '').strip()
        s3_bucket = video.get('s3_bucket', '').strip()

        if not s3_key or not s3_bucket:
            logger.warning(f"Missing S3 info for video {video_id}: bucket={s3_bucket}, key={s3_key}")
            return {
                "success": True,
                "download_url": video.get('video_url'),
                "method": "direct",
                "message": "S3 key not available, using direct URL",
            }

        s3_client = boto3.client(
            "s3",
            aws_access_key_id=aws_access_key,
            aws_secret_access_key=aws_secret_key,
            region_name=aws_region,
        )
        presigned_url = s3_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': s3_bucket,
                'Key': s3_key,
                'ResponseContentDisposition': f'attachment; filename="{video.get("title", "video")}.mp4"',
            },
            ExpiresIn=3600,
        )
        logger.info(f"Generated presigned URL for video {video_id}")
        return {"success": True, "download_url": presigned_url, "method": "presigned", "expires_in": 3600}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate download URL: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate download URL: {str(e)}")


@router.get("/{video_id}/download-proxy", responses=_R_404_500)
async def download_video_proxy(video_id: str, user_id: CurrentUser):
    """Proxy download — streams video through backend to bypass CORS."""
    try:
        video = videos_service.get_video_by_id(video_id, user_id)
        if not video:
            raise HTTPException(status_code=404, detail=_VIDEO_NOT_FOUND)

        video_url = video.get('video_url')
        if not video_url:
            raise HTTPException(status_code=404, detail="Video URL not found")

        def iter_content():
            resp = requests.get(video_url, stream=True, timeout=60)
            for chunk in resp.iter_content(chunk_size=8192):
                if chunk:
                    yield chunk

        return StreamingResponse(
            iter_content(),
            media_type="video/mp4",
            headers={"Content-Disposition": f'attachment; filename="{video.get("title", "video")}.mp4"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to proxy download: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to download video: {str(e)}")


@router.delete("/{video_id}", response_model=dict, responses=_R_404_500)
async def delete_video(video_id: str, user_id: CurrentUser):
    """Delete a video: fetch record, delete from S3 (non-fatal), then delete from DB."""
    try:
        # Step 1: fetch record to get S3 info before deleting
        result = videos_service.delete_video(video_id, user_id)
        if not result['success']:
            raise HTTPException(status_code=404, detail=_VIDEO_NOT_FOUND)

        # Step 2: delete from S3 (non-fatal — DB delete already succeeded)
        s3_deleted = delete_s3_object(
            result.get('s3_bucket', ''),
            result.get('s3_key', ''),
        )

        return {"success": True, "s3_deleted": s3_deleted}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete video: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete video: {str(e)}")
