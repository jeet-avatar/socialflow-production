"""Tests for /channels CRUD routes."""
from bson import ObjectId


def test_list_channels_empty(client, auth_headers):
    response = client.get("/channels", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_create_channel(client, auth_headers):
    payload = {
        "name": "My Tech Channel",
        "platform": "youtube",
        "niche": "software tutorials",
        "posting_frequency": "daily",
        "auto_post": True,
    }
    response = client.post("/channels", json=payload, headers=auth_headers)
    assert response.status_code == 201  # route uses status_code=201
    data = response.json()
    assert data["name"] == "My Tech Channel"
    assert data["user_id"] == "dev_user"
    assert "id" in data


def test_create_channel_invalid_platform(client, auth_headers):
    payload = {
        "name": "Bad Channel",
        "platform": "snapchat",  # not in allowed platforms
        "posting_frequency": "daily",
    }
    response = client.post("/channels", json=payload, headers=auth_headers)
    assert response.status_code == 422  # route raises HTTPException(422) for invalid platform


def test_update_channel(client, auth_headers, mock_db):
    channel_id = str(ObjectId())
    mock_db["channels"].insert_one({
        "_id": ObjectId(channel_id),
        "user_id": "dev_user",
        "name": "Old Name",
    })
    response = client.put(
        f"/channels/{channel_id}",
        json={"name": "New Name"},
        headers=auth_headers,
    )
    assert response.status_code == 200


def test_delete_channel_wrong_user(client, auth_headers, mock_db):
    """Deleting another user's channel must return 404."""
    channel_id = str(ObjectId())
    mock_db["channels"].insert_one({
        "_id": ObjectId(channel_id),
        "user_id": "other_user",
        "name": "Not Mine",
    })
    response = client.delete(f"/channels/{channel_id}", headers=auth_headers)
    assert response.status_code == 404


def test_channels_require_auth(client):
    """All channel endpoints must require authentication."""
    response = client.get("/channels")
    assert response.status_code == 401
