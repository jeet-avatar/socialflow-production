"""
Tests for new channel video endpoints.
Uses FastAPI TestClient with dev-bypass auth (DEV_BYPASS_AUTH=true).

Run: pytest app/tests/test_channel_video_routes.py -v
"""
import os
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

# Dev bypass must be set before any app import
os.environ.setdefault("DEV_BYPASS_AUTH", "true")


def _make_app():
    """Build minimal app with only channel router for isolation."""
    from fastapi import FastAPI
    from routes.channel_routes import router
    app = FastAPI()
    app.include_router(router)
    return app


@pytest.fixture
def client():
    return TestClient(_make_app())


def _auth():
    """Authorization header that triggers dev-bypass (user_id='dev_user')."""
    return {"Authorization": "Bearer dev-bypass"}


def test_list_videos_returns_empty_when_no_videos(client):
    """GET /channels/{id}/videos returns [] when queued_videos is empty."""
    with patch("routes.channel_routes._col") as mock_col, \
         patch("routes.channel_routes._qv_col") as mock_qv:
        mock_col.return_value.find_one.return_value = {"_id": "abc", "user_id": "dev_user"}
        mock_qv.return_value.find.return_value.sort.return_value.limit.return_value = []
        resp = client.get("/channels/507f1f77bcf86cd799439011/videos", headers=_auth())
    assert resp.status_code == 200
    assert resp.json() == []


def test_approve_video_sets_status(client):
    """POST /channels/{cid}/videos/{vid}/approve sets status=approved."""
    from bson import ObjectId
    cid = str(ObjectId())
    vid = str(ObjectId())
    with patch("routes.channel_routes._col") as mock_col, \
         patch("routes.channel_routes._qv_col") as mock_qv:
        mock_col.return_value.find_one.return_value = {"_id": cid, "user_id": "dev_user"}
        mock_qv.return_value.find_one.return_value = {"_id": vid, "channel_id": cid, "user_id": "dev_user"}
        mock_qv.return_value.update_one.return_value = MagicMock(matched_count=1)
        resp = client.post(f"/channels/{cid}/videos/{vid}/approve", headers=_auth())
    assert resp.status_code == 200
    assert resp.json()["success"] is True


def test_reject_video_sets_status(client):
    """POST /channels/{cid}/videos/{vid}/reject sets status=rejected."""
    from bson import ObjectId
    cid = str(ObjectId())
    vid = str(ObjectId())
    with patch("routes.channel_routes._col") as mock_col, \
         patch("routes.channel_routes._qv_col") as mock_qv:
        mock_col.return_value.find_one.return_value = {"_id": cid, "user_id": "dev_user"}
        mock_qv.return_value.find_one.return_value = {"_id": vid, "channel_id": cid, "user_id": "dev_user"}
        mock_qv.return_value.update_one.return_value = MagicMock(matched_count=1)
        resp = client.post(f"/channels/{cid}/videos/{vid}/reject", headers=_auth())
    assert resp.status_code == 200
    assert resp.json()["success"] is True


def test_accept_disclaimer_updates_channel(client):
    """POST /channels/{id}/accept-disclaimer sets disclaimer fields + auto_post=true."""
    from bson import ObjectId
    cid = str(ObjectId())
    with patch("routes.channel_routes._col") as mock_col, \
         patch("routes.channel_routes.sync_channel") as mock_sync:
        mock_col.return_value.find_one.return_value = {
            "_id": cid,
            "user_id": "dev_user",
            "posting_frequency": "weekly",
        }
        mock_col.return_value.update_one.return_value = MagicMock(matched_count=1)
        resp = client.post(f"/channels/{cid}/accept-disclaimer", headers=_auth())
    assert resp.status_code == 200
    assert resp.json()["success"] is True
