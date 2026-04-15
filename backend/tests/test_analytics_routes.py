"""
Tests for /analytics/{channel_id}/posts and /analytics/{channel_id}/refresh routes.

All MongoDB access goes through the mock_db / client fixtures from conftest.py.
All platform fetchers are patched at their import path inside analytics_routes.py.
No live HTTP calls, no real MongoDB connection.
"""
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock

import pytest
from bson import ObjectId


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _channel_id():
    return str(ObjectId())


def _seed_post(mock_db, channel_id, platform="youtube", last_fetched_at=None, **extra):
    """Insert a platform_posts document and return its string id."""
    post_id = ObjectId()
    doc = {
        "_id": post_id,
        "channel_id": channel_id,
        "user_id": "dev_user",
        "platform": platform,
        "platform_video_id": f"{platform}-vid-{str(post_id)[:8]}",
        "posted_at": datetime.now(timezone.utc),
        "views": extra.pop("views", 0),
        "likes": extra.pop("likes", 0),
        "comments": extra.pop("comments", 0),
    }
    if last_fetched_at is not None:
        doc["last_fetched_at"] = last_fetched_at
    doc.update(extra)
    mock_db["platform_posts"].insert_one(doc)
    return str(post_id)


_YT_PATCH = "utils.analytics_fetcher.fetch_youtube_stats"
_IG_PATCH = "utils.analytics_fetcher.fetch_instagram_stats"
_FB_PATCH = "utils.analytics_fetcher.fetch_facebook_stats"
_TK_PATCH = "utils.analytics_fetcher.fetch_tiktok_stats"


# ---------------------------------------------------------------------------
# GET /analytics/{channel_id}/posts
# ---------------------------------------------------------------------------

def test_list_posts_empty(client, auth_headers):
    """Returns empty list when no platform_posts exist for the channel."""
    channel_id = _channel_id()
    response = client.get(f"/analytics/{channel_id}/posts", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_list_posts_returns_seeded(client, auth_headers, mock_db):
    """Returns seeded platform_posts for the correct channel_id."""
    channel_id = _channel_id()
    _seed_post(mock_db, channel_id, views=10, likes=2, comments=1)
    response = client.get(f"/analytics/{channel_id}/posts", headers=auth_headers)
    assert response.status_code == 200
    posts = response.json()
    assert len(posts) == 1
    assert posts[0]["channel_id"] == channel_id


def test_list_posts_requires_auth(client):
    """GET /posts returns 401 without auth header."""
    channel_id = _channel_id()
    response = client.get(f"/analytics/{channel_id}/posts")
    assert response.status_code == 401


def test_list_posts_ignores_other_channels(client, auth_headers, mock_db):
    """GET only returns posts where channel_id matches — not other channels."""
    my_channel = _channel_id()
    other_channel = _channel_id()
    _seed_post(mock_db, my_channel)
    _seed_post(mock_db, other_channel)
    response = client.get(f"/analytics/{my_channel}/posts", headers=auth_headers)
    assert response.status_code == 200
    posts = response.json()
    assert len(posts) == 1
    assert posts[0]["channel_id"] == my_channel


def test_list_posts_sorted_newest_first(client, auth_headers, mock_db):
    """Posts are returned sorted by posted_at descending (newest first)."""
    channel_id = _channel_id()
    now = datetime.now(timezone.utc)
    older = now - timedelta(hours=2)
    newer = now - timedelta(minutes=30)

    old_id = ObjectId()
    new_id = ObjectId()
    mock_db["platform_posts"].insert_many([
        {
            "_id": old_id, "channel_id": channel_id, "user_id": "dev_user",
            "platform": "youtube", "platform_video_id": "vid-old",
            "posted_at": older, "views": 0, "likes": 0, "comments": 0,
        },
        {
            "_id": new_id, "channel_id": channel_id, "user_id": "dev_user",
            "platform": "youtube", "platform_video_id": "vid-new",
            "posted_at": newer, "views": 0, "likes": 0, "comments": 0,
        },
    ])
    response = client.get(f"/analytics/{channel_id}/posts", headers=auth_headers)
    assert response.status_code == 200
    posts = response.json()
    assert len(posts) == 2
    # Newer post must appear first
    assert posts[0]["platform_video_id"] == "vid-new"
    assert posts[1]["platform_video_id"] == "vid-old"


def test_list_posts_unknown_channel_returns_empty(client, auth_headers):
    """channel_id not in any platform_posts returns [] not 404."""
    response = client.get(f"/analytics/{_channel_id()}/posts", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_list_posts_includes_stats_fields(client, auth_headers, mock_db):
    """Seeded post with views/likes/comments is returned with those fields intact."""
    channel_id = _channel_id()
    _seed_post(mock_db, channel_id, views=100, likes=42, comments=7)
    response = client.get(f"/analytics/{channel_id}/posts", headers=auth_headers)
    assert response.status_code == 200
    post = response.json()[0]
    assert post["views"] == 100
    assert post["likes"] == 42
    assert post["comments"] == 7


# ---------------------------------------------------------------------------
# POST /analytics/{channel_id}/refresh
# ---------------------------------------------------------------------------

def test_refresh_requires_auth(client):
    """POST /refresh returns 401 without auth header."""
    channel_id = _channel_id()
    response = client.post(f"/analytics/{channel_id}/refresh")
    assert response.status_code == 401


def test_refresh_calls_youtube_fetcher(client, auth_headers, mock_db):
    """With a YouTube post and no last_fetched_at, refresh calls fetch_youtube_stats."""
    channel_id = _channel_id()
    _seed_post(mock_db, channel_id, platform="youtube")
    with patch(_YT_PATCH, return_value={"views": 10, "likes": 2, "comments": 1}) as mock_yt:
        response = client.post(f"/analytics/{channel_id}/refresh", headers=auth_headers)
    assert response.status_code == 200
    mock_yt.assert_called_once()


def test_refresh_calls_instagram_fetcher(client, auth_headers, mock_db):
    """Instagram post triggers fetch_instagram_stats."""
    channel_id = _channel_id()
    _seed_post(mock_db, channel_id, platform="instagram")
    with patch(_IG_PATCH, return_value={"views": 5, "likes": 1, "comments": 0}) as mock_ig:
        response = client.post(f"/analytics/{channel_id}/refresh", headers=auth_headers)
    assert response.status_code == 200
    mock_ig.assert_called_once()


def test_refresh_calls_facebook_fetcher(client, auth_headers, mock_db):
    """Facebook post triggers fetch_facebook_stats."""
    channel_id = _channel_id()
    _seed_post(mock_db, channel_id, platform="facebook")
    with patch(_FB_PATCH, return_value={"views": 3, "likes": 0, "comments": 0}) as mock_fb:
        response = client.post(f"/analytics/{channel_id}/refresh", headers=auth_headers)
    assert response.status_code == 200
    mock_fb.assert_called_once()


def test_refresh_tiktok_returns_empty(client, auth_headers, mock_db):
    """TikTok post: fetch_tiktok_stats always returns {} (N/A design)."""
    channel_id = _channel_id()
    _seed_post(mock_db, channel_id, platform="tiktok")
    with patch(_TK_PATCH, return_value={}) as mock_tk:
        response = client.post(f"/analytics/{channel_id}/refresh", headers=auth_headers)
    assert response.status_code == 200
    # tiktok fetcher was called
    mock_tk.assert_called_once()


def test_refresh_respects_ttl(client, auth_headers, mock_db):
    """Post with last_fetched_at = 30 min ago is still fresh — fetcher NOT called."""
    channel_id = _channel_id()
    fresh_time = datetime.now(timezone.utc) - timedelta(minutes=30)
    _seed_post(mock_db, channel_id, platform="youtube", last_fetched_at=fresh_time)
    with patch(_YT_PATCH, return_value={"views": 10, "likes": 2, "comments": 1}) as mock_yt:
        response = client.post(f"/analytics/{channel_id}/refresh", headers=auth_headers)
    assert response.status_code == 200
    mock_yt.assert_not_called()
    assert response.json()["skipped"] == 1


def test_refresh_stale_post_refetches(client, auth_headers, mock_db):
    """Post with last_fetched_at = 2h ago is stale — fetcher IS called."""
    channel_id = _channel_id()
    stale_time = datetime.now(timezone.utc) - timedelta(hours=2)
    _seed_post(mock_db, channel_id, platform="youtube", last_fetched_at=stale_time)
    with patch(_YT_PATCH, return_value={"views": 9, "likes": 1, "comments": 0}) as mock_yt:
        response = client.post(f"/analytics/{channel_id}/refresh", headers=auth_headers)
    assert response.status_code == 200
    mock_yt.assert_called_once()
    assert response.json()["refreshed"] == 1


def test_refresh_no_posts_returns_empty_list(client, auth_headers):
    """POST /refresh on a channel with no posts returns {"refreshed": 0, "skipped": 0}."""
    channel_id = _channel_id()
    response = client.post(f"/analytics/{channel_id}/refresh", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["refreshed"] == 0
    assert data["skipped"] == 0


def test_refresh_fetcher_exception_is_non_fatal(client, auth_headers, mock_db):
    """When fetcher raises an exception the route must still return 200."""
    channel_id = _channel_id()
    _seed_post(mock_db, channel_id, platform="youtube")
    with patch(_YT_PATCH, side_effect=Exception("API down")):
        response = client.post(f"/analytics/{channel_id}/refresh", headers=auth_headers)
    assert response.status_code == 200


def test_refresh_updates_last_fetched_at(client, auth_headers, mock_db):
    """After refresh, the platform_posts doc has an updated last_fetched_at."""
    channel_id = _channel_id()
    post_id = ObjectId(_seed_post(mock_db, channel_id, platform="youtube"))
    before = datetime.now(timezone.utc)
    with patch(_YT_PATCH, return_value={"views": 5, "likes": 1, "comments": 0}):
        response = client.post(f"/analytics/{channel_id}/refresh", headers=auth_headers)
    assert response.status_code == 200
    doc = mock_db["platform_posts"].find_one({"_id": post_id})
    assert doc is not None
    assert doc.get("last_fetched_at") is not None
    # last_fetched_at should be >= the time before we called refresh
    fetched_at = doc["last_fetched_at"]
    if fetched_at.tzinfo is None:
        fetched_at = fetched_at.replace(tzinfo=timezone.utc)
    assert fetched_at >= before


def test_refresh_updates_stats_in_db(client, auth_headers, mock_db):
    """After refresh with mocked stats, the platform_posts doc has the new stats."""
    channel_id = _channel_id()
    post_id = ObjectId(_seed_post(mock_db, channel_id, platform="youtube"))
    with patch(_YT_PATCH, return_value={"views": 5, "likes": 2, "comments": 1}):
        response = client.post(f"/analytics/{channel_id}/refresh", headers=auth_headers)
    assert response.status_code == 200
    doc = mock_db["platform_posts"].find_one({"_id": post_id})
    assert doc["stats"]["views"] == 5
    assert doc["stats"]["likes"] == 2
    assert doc["stats"]["comments"] == 1


def test_refresh_unknown_channel_returns_empty(client, auth_headers):
    """POST /refresh on unknown channel_id returns refreshed=0 not 404."""
    response = client.post(f"/analytics/{_channel_id()}/refresh", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["refreshed"] == 0


def test_refresh_mixed_stale_fresh_only_stale_refetched(client, auth_headers, mock_db):
    """Two posts: one fresh (30min) and one stale (2h). Only stale post triggers fetcher."""
    channel_id = _channel_id()
    now = datetime.now(timezone.utc)
    _seed_post(mock_db, channel_id, platform="youtube",
               last_fetched_at=now - timedelta(minutes=30))  # fresh
    _seed_post(mock_db, channel_id, platform="youtube",
               last_fetched_at=now - timedelta(hours=2))     # stale

    with patch(_YT_PATCH, return_value={"views": 1, "likes": 0, "comments": 0}) as mock_yt:
        response = client.post(f"/analytics/{channel_id}/refresh", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["refreshed"] == 1
    assert data["skipped"] == 1
    mock_yt.assert_called_once()
