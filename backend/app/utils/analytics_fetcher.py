"""
Per-platform video stats fetchers.

Each function accepts (user_id: str, platform_video_id: str) and returns:
    {"views": int, "likes": int, "comments": int}
or {} on error / missing credentials.

ALL imports are lazy (inside function bodies) — same pattern as video_tasks.py.
This prevents circular imports and avoids loading heavy SDKs at module startup.

RATE LIMIT GUIDANCE:
- YouTube: 10,000 units/day. videos().list costs 1 unit. Cache stats; only
  call refresh when last_fetched_at is >1h old (enforced in analytics_routes.py).
- Instagram: 200 calls/hour per token.
- Facebook: standard Graph API rate limits apply.
- TikTok: publish_id is a lifecycle ID, NOT a video ID. Content Posting API
  does NOT expose view counts. Research API requires academic approval.
  fetch_tiktok_stats() always returns {} — display "N/A" in UI.
"""
import logging

logger = logging.getLogger(__name__)


def fetch_youtube_stats(user_id: str, video_id: str) -> dict:
    """
    Fetch view/like/comment counts from YouTube Data API v3.
    Reuses _resolve_yt_credentials() and _build_yt_oauth_creds() from
    youtube_post_helper.py — no custom OAuth token management needed.
    """
    try:
        from utils.youtube_post_helper import (  # noqa: PLC0415
            _resolve_yt_credentials,
            _build_yt_oauth_creds,
        )
        from googleapiclient.discovery import build  # noqa: PLC0415

        creds_raw = _resolve_yt_credentials(user_id)
        if isinstance(creds_raw, dict) and not creds_raw.get("success", True):
            logger.debug(f"fetch_youtube_stats: no credentials for user {user_id}")
            return {}

        creds, err = _build_yt_oauth_creds(creds_raw)
        if err:
            logger.debug(f"fetch_youtube_stats: cred build error: {err}")
            return {}

        youtube = build("youtube", "v3", credentials=creds)
        resp = youtube.videos().list(part="statistics", id=video_id).execute()
        items = resp.get("items", [])
        if not items:
            return {}
        stats = items[0].get("statistics", {})
        return {
            "views":    int(stats.get("viewCount",    0)),
            "likes":    int(stats.get("likeCount",    0)),
            "comments": int(stats.get("commentCount", 0)),
        }
    except Exception as exc:
        logger.warning(f"fetch_youtube_stats video_id={video_id}: {exc}")
        return {}


def fetch_instagram_stats(user_id: str, media_id: str) -> dict:
    """
    Fetch views/likes/comments from Instagram Graph API v25.0.
    Uses `views` metric (not `impressions` — deprecated April 21, 2025).
    """
    try:
        import requests as _req  # noqa: PLC0415
        from utils.integrations_service import integrations_service  # noqa: PLC0415

        integration = integrations_service.get_integration(user_id, "instagram", decrypt=True)
        if not integration:
            return {}
        token = integration.get("credentials", {}).get("accessToken", "")
        if not token:
            return {}

        resp = _req.get(
            f"https://graph.instagram.com/v25.0/{media_id}/insights",
            params={
                "metric": "views,likes,comments,total_interactions",
                "access_token": token,
            },
            timeout=15,
        )
        if resp.status_code != 200:
            logger.warning(f"fetch_instagram_stats media_id={media_id}: HTTP {resp.status_code}")
            return {}

        result: dict = {}
        for item in resp.json().get("data", []):
            name = item.get("name")
            # v25.0: some metrics use "values" list, others use "value" directly
            if item.get("values"):
                val = item["values"][0].get("value", 0)
            else:
                val = item.get("value", 0)
            if name == "views":    result["views"]    = int(val)
            if name == "likes":    result["likes"]    = int(val)
            if name == "comments": result["comments"] = int(val)
        return result
    except Exception as exc:
        logger.warning(f"fetch_instagram_stats media_id={media_id}: {exc}")
        return {}


def fetch_facebook_stats(user_id: str, video_id: str) -> dict:
    """
    Fetch total_video_views from Facebook Graph API v25.0.
    Note: Facebook video_insights does not expose likes via this endpoint.
    likes and comments are returned as 0 — display partial stats in UI.
    """
    try:
        import requests as _req  # noqa: PLC0415
        from utils.integrations_service import integrations_service  # noqa: PLC0415

        integration = integrations_service.get_integration(user_id, "facebook", decrypt=True)
        if not integration:
            return {}
        token = integration.get("credentials", {}).get("accessToken", "")
        if not token:
            return {}

        resp = _req.get(
            f"https://graph.facebook.com/v25.0/{video_id}/video_insights",
            params={
                "metric": "total_video_views",
                "access_token": token,
            },
            timeout=15,
        )
        if resp.status_code != 200:
            logger.warning(f"fetch_facebook_stats video_id={video_id}: HTTP {resp.status_code}")
            return {}

        views = 0
        for item in resp.json().get("data", []):
            if item.get("name") == "total_video_views":
                vals = item.get("values", [{}])
                views = int(vals[0].get("value", 0)) if vals else 0
        return {"views": views, "likes": 0, "comments": 0}
    except Exception as exc:
        logger.warning(f"fetch_facebook_stats video_id={video_id}: {exc}")
        return {}


def fetch_tiktok_stats(user_id: str, publish_id: str) -> dict:
    """
    TikTok Content Posting API does not expose view/like/comment counts on
    publish_id. The Research API requires academic approval (impractical for SaaS).
    Returns {} — analytics_routes.py displays "N/A" for TikTok posts.
    """
    return {}
