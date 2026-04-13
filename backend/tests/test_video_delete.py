"""Tests for video delete — verifies S3 cleanup on delete."""
from unittest.mock import patch
from bson import ObjectId


def _seed_video(mock_db, video_id: str, user_id: str = "dev_user") -> None:
    mock_db["videos"].insert_one({
        "_id": ObjectId(video_id),
        "user_id": user_id,
        "title": "Test Video",
        "s3_bucket": "my-bucket",
        "s3_key": "videos/test.mp4",
    })


def test_video_delete_calls_s3(client, mock_db, auth_headers):
    """Deleting a video should attempt to remove the S3 object."""
    video_id = str(ObjectId())
    _seed_video(mock_db, video_id)

    with patch("routes.videos_routes.delete_s3_object") as mock_s3:
        mock_s3.return_value = True
        response = client.delete(f"/videos/{video_id}", headers=auth_headers)
        assert response.status_code == 200
        mock_s3.assert_called_once_with("my-bucket", "videos/test.mp4")


def test_video_delete_continues_if_s3_fails(client, mock_db, auth_headers):
    """S3 failure must not prevent the MongoDB record from being deleted."""
    video_id = str(ObjectId())
    _seed_video(mock_db, video_id)

    with patch("routes.videos_routes.delete_s3_object") as mock_s3:
        mock_s3.return_value = False
        response = client.delete(f"/videos/{video_id}", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["s3_deleted"] is False
        assert mock_db["videos"].find_one({"_id": ObjectId(video_id)}) is None


def test_video_delete_wrong_user(client, mock_db, auth_headers):
    """Deleting another user's video must return 404."""
    video_id = str(ObjectId())
    _seed_video(mock_db, video_id, user_id="other_user")

    with patch("routes.videos_routes.delete_s3_object"):
        response = client.delete(f"/videos/{video_id}", headers=auth_headers)
        assert response.status_code == 404
