"""
Analytics routes for per-channel post performance metrics.

Routes:
  GET  /analytics/{channel_id}/posts    — list platform_posts with cached stats
  POST /analytics/{channel_id}/refresh  — re-fetch stale stats from platform APIs
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Annotated, Any, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, Header, HTTPException

from utils.middleware.auth_middleware import auth_middleware
from utils.mongodb_service import mongodb_service

logger = logging.getLogger(__name__)

# Stats are considered stale after this many seconds; refresh skips fresh entries
STATS_TTL_SECONDS = 3600  # 1 hour

router = APIRouter(prefix="/analytics", tags=["analytics"])


# ── Auth dependency (project-standard pattern from channel_routes.py:25-36) ──

def get_current_user(authorization: Annotated[Optional[str], Header()] = None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_info = auth_middleware.verify_token(authorization)
    if not user_info:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if not user_info.get("user_id"):
        raise HTTPException(status_code=401, detail="Invalid token - no user_id")
    return user_info["user_id"]


CurrentUser = Annotated[str, Depends(get_current_user)]


def _col():
    return mongodb_service.get_database()["platform_posts"]


def _serialize(doc: dict) -> dict:
    """Convert ObjectId to string and return JSON-safe dict."""
    doc["id"] = str(doc.pop("_id", ""))
    return doc


@router.get("/{channel_id}/posts")
def list_channel_posts(channel_id: str, user_id: CurrentUser) -> list[dict[str, Any]]:
    """
    Return all platform_posts for a channel, sorted newest first.
    Stats are whatever is currently cached in MongoDB (may be 0 until first refresh).
    """
    posts = list(
        _col().find({"channel_id": channel_id, "user_id": user_id})
               .sort("posted_at", -1)
               .limit(100)
    )
    return [_serialize(p) for p in posts]


@router.post("/{channel_id}/refresh")
def refresh_channel_stats(channel_id: str, user_id: CurrentUser) -> dict[str, Any]:
    """
    Re-fetch stats from platform APIs for all stale posts in this channel.
    A post is considered stale if last_fetched_at is None or older than STATS_TTL_SECONDS.
    Returns {"refreshed": int, "skipped": int} summary.
    """
    from utils.analytics_fetcher import (  # noqa: PLC0415
        fetch_youtube_stats,
        fetch_instagram_stats,
        fetch_facebook_stats,
        fetch_tiktok_stats,
    )

    FETCHERS = {
        "youtube":   fetch_youtube_stats,
        "instagram": fetch_instagram_stats,
        "facebook":  fetch_facebook_stats,
        "tiktok":    fetch_tiktok_stats,
    }

    col = _col()
    posts = list(col.find({"channel_id": channel_id, "user_id": user_id}))
    now = datetime.now(timezone.utc)
    stale_threshold = now - timedelta(seconds=STATS_TTL_SECONDS)

    refreshed = 0
    skipped = 0

    for post in posts:
        last_fetched = post.get("last_fetched_at")

        # Skip if stats are still fresh.
        # Normalize last_fetched to UTC-aware for comparison (mongomock may return naive datetimes).
        if last_fetched:
            if last_fetched.tzinfo is None:
                last_fetched = last_fetched.replace(tzinfo=timezone.utc)
            if last_fetched > stale_threshold:
                skipped += 1
                continue

        platform = post.get("platform", "")
        platform_video_id = post.get("platform_video_id", "")
        fetcher = FETCHERS.get(platform)

        if not fetcher or not platform_video_id:
            skipped += 1
            continue

        try:
            new_stats = fetcher(user_id, platform_video_id)
        except Exception:
            logger.warning(
                f"analytics refresh: fetcher raised for channel={channel_id} "
                f"platform={platform} video_id={platform_video_id} — skipping"
            )
            new_stats = {}

        # Build update — always update last_fetched_at even if stats empty
        update: dict[str, Any] = {"last_fetched_at": now}
        if new_stats:
            update["stats"] = {
                "views":    new_stats.get("views", 0),
                "likes":    new_stats.get("likes", 0),
                "comments": new_stats.get("comments", 0),
            }

        col.update_one({"_id": post["_id"]}, {"$set": update})
        refreshed += 1
        logger.info(
            f"analytics refresh: channel={channel_id} platform={platform} "
            f"video_id={platform_video_id} stats={new_stats or 'N/A'}"
        )

    return {"refreshed": refreshed, "skipped": skipped}
