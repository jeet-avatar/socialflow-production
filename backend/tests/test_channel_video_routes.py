"""
Tests for channel video review queue endpoints:
  GET  /channels/{id}/videos
  POST /channels/{id}/videos/{vid}/approve
  POST /channels/{id}/videos/{vid}/reject
  POST /channels/{id}/accept-disclaimer

Run: cd backend && pytest tests/test_channel_video_routes.py -v
"""
from bson import ObjectId
import datetime


def test_list_videos_returns_empty_when_no_videos(client, auth_headers, mock_db):
    """GET /channels/{id}/videos returns [] when queued_videos is empty."""
    channel_id = str(ObjectId())
    mock_db["channels"].insert_one({
        "_id": ObjectId(channel_id),
        "user_id": "dev_user",
        "name": "Test Channel",
    })
    response = client.get(f"/channels/{channel_id}/videos", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_list_videos_filters_by_status(client, auth_headers, mock_db):
    """GET /channels/{id}/videos?status=pending_review returns matching videos."""
    channel_id = str(ObjectId())
    mock_db["channels"].insert_one({
        "_id": ObjectId(channel_id),
        "user_id": "dev_user",
        "name": "Test Channel",
    })
    vid_id = ObjectId()
    mock_db["queued_videos"].insert_one({
        "_id": vid_id,
        "channel_id": channel_id,
        "user_id": "dev_user",
        "status": "pending_review",
        "created_at": datetime.datetime.utcnow(),
    })
    response = client.get(
        f"/channels/{channel_id}/videos?status=pending_review",
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["status"] == "pending_review"
    assert "id" in data[0]
    assert "_id" not in data[0]


def test_list_videos_channel_not_found(client, auth_headers):
    """GET /channels/{id}/videos returns 404 for non-existent channel."""
    response = client.get(
        f"/channels/{str(ObjectId())}/videos",
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_approve_video_sets_status(client, auth_headers, mock_db):
    """POST /channels/{cid}/videos/{vid}/approve returns success."""
    channel_id = str(ObjectId())
    video_id = str(ObjectId())
    mock_db["channels"].insert_one({
        "_id": ObjectId(channel_id),
        "user_id": "dev_user",
        "name": "Test Channel",
    })
    mock_db["queued_videos"].insert_one({
        "_id": ObjectId(video_id),
        "channel_id": channel_id,
        "user_id": "dev_user",
        "status": "pending_review",
    })
    response = client.post(
        f"/channels/{channel_id}/videos/{video_id}/approve",
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["success"] is True

    # Verify DB was updated
    video = mock_db["queued_videos"].find_one({"_id": ObjectId(video_id)})
    assert video["status"] == "approved"
    assert "approved_at" in video


def test_reject_video_sets_status(client, auth_headers, mock_db):
    """POST /channels/{cid}/videos/{vid}/reject returns success."""
    channel_id = str(ObjectId())
    video_id = str(ObjectId())
    mock_db["channels"].insert_one({
        "_id": ObjectId(channel_id),
        "user_id": "dev_user",
        "name": "Test Channel",
    })
    mock_db["queued_videos"].insert_one({
        "_id": ObjectId(video_id),
        "channel_id": channel_id,
        "user_id": "dev_user",
        "status": "pending_review",
    })
    response = client.post(
        f"/channels/{channel_id}/videos/{video_id}/reject",
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["success"] is True

    # Verify DB was updated
    video = mock_db["queued_videos"].find_one({"_id": ObjectId(video_id)})
    assert video["status"] == "rejected"
    assert "rejected_at" in video


def test_approve_wrong_channel_returns_404(client, auth_headers, mock_db):
    """Approving a video that doesn't belong to the channel returns 404."""
    channel_id = str(ObjectId())
    other_channel_id = str(ObjectId())
    video_id = str(ObjectId())
    mock_db["channels"].insert_one({
        "_id": ObjectId(channel_id),
        "user_id": "dev_user",
        "name": "My Channel",
    })
    mock_db["queued_videos"].insert_one({
        "_id": ObjectId(video_id),
        "channel_id": other_channel_id,  # belongs to different channel
        "user_id": "dev_user",
        "status": "pending_review",
    })
    response = client.post(
        f"/channels/{channel_id}/videos/{video_id}/approve",
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_accept_disclaimer_updates_channel(client, auth_headers, mock_db):
    """POST /channels/{id}/accept-disclaimer sets auto_post=True and disclaimer fields."""
    channel_id = str(ObjectId())
    mock_db["channels"].insert_one({
        "_id": ObjectId(channel_id),
        "user_id": "dev_user",
        "name": "Test Channel",
        "posting_frequency": "weekly",
        "auto_post": False,
    })
    response = client.post(
        f"/channels/{channel_id}/accept-disclaimer",
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["success"] is True

    # Verify DB was updated
    ch = mock_db["channels"].find_one({"_id": ObjectId(channel_id)})
    assert ch["auto_post"] is True
    assert ch["auto_post_disclaimer_accepted"] is True
    assert "auto_post_disclaimer_accepted_at" in ch


def test_accept_disclaimer_channel_not_found(client, auth_headers):
    """POST /channels/{id}/accept-disclaimer returns 404 for non-existent channel."""
    response = client.post(
        f"/channels/{str(ObjectId())}/accept-disclaimer",
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_video_endpoints_require_auth(client):
    """All new video endpoints must require authentication."""
    cid = str(ObjectId())
    vid = str(ObjectId())
    assert client.get(f"/channels/{cid}/videos").status_code == 401
    assert client.post(f"/channels/{cid}/videos/{vid}/approve").status_code == 401
    assert client.post(f"/channels/{cid}/videos/{vid}/reject").status_code == 401
    assert client.post(f"/channels/{cid}/accept-disclaimer").status_code == 401
