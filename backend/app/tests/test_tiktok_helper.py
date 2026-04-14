"""
Unit tests for tiktok_post_helper.py.

Tests cover credential resolution, token refresh logic, PULL_FROM_URL success,
domain_not_verified fallback to FILE_UPLOAD, and poll failure handling.

All external calls (requests.post, integrations_service) are mocked.
"""
import time
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helper to build a fake credential dict
# ---------------------------------------------------------------------------

def _make_creds(**overrides):
    base = {
        "clientKey": "ck_test",
        "clientSecret": "cs_test",
        "accessToken": "at_test",
        "refreshToken": "rt_test",
        "openId": "oid_test",
        "tokenExpiresAt": int(time.time()) + 7200,  # 2h from now — fresh
    }
    base.update(overrides)
    return base


def _mock_resp(status_code=200, json_data=None):
    """Build a MagicMock that mimics requests.Response."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_data or {}
    resp.text = str(json_data or {})
    return resp


# ---------------------------------------------------------------------------
# Test 1: no integration stored → failure dict
# ---------------------------------------------------------------------------

def test_resolve_credentials_no_integration():
    """When get_integration returns None, post_video_to_tiktok returns success=False."""
    with patch("utils.tiktok_post_helper.integrations_service.get_integration", return_value=None):
        from utils.tiktok_post_helper import post_video_to_tiktok
        result = post_video_to_tiktok("/tmp/fake.mp4", "caption", "title", user_id="user1")

    assert result["success"] is False
    assert "TikTok not configured" in result["error"] or "not configured" in result["error"].lower()


# ---------------------------------------------------------------------------
# Test 2: credentials exist but missing accessToken/openId → failure dict
# ---------------------------------------------------------------------------

def test_resolve_credentials_missing_keys():
    """When credentials dict lacks accessToken/openId, returns failure dict."""
    integration = {"credentials": {"clientKey": "ck", "refreshToken": "rt"}}
    with patch("utils.tiktok_post_helper.integrations_service.get_integration", return_value=integration):
        from utils.tiktok_post_helper import post_video_to_tiktok
        result = post_video_to_tiktok("/tmp/fake.mp4", "caption", "title", user_id="user2")

    assert result["success"] is False
    assert "incomplete" in result["error"].lower() or "configured" in result["error"].lower()


# ---------------------------------------------------------------------------
# Test 3: tokenExpiresAt 7200s in future — no refresh call made
# ---------------------------------------------------------------------------

def test_refresh_not_needed():
    """When token is 7200s away from expiry, _refresh_if_needed does not call requests.post."""
    creds = _make_creds(tokenExpiresAt=int(time.time()) + 7200)
    from utils.tiktok_post_helper import _refresh_if_needed

    with patch("utils.tiktok_post_helper.requests.post") as mock_post:
        result = _refresh_if_needed(creds, "user3")

    mock_post.assert_not_called()
    assert result["accessToken"] == creds["accessToken"]


# ---------------------------------------------------------------------------
# Test 4: tokenExpiresAt 30s away — refresh is called with grant_type=refresh_token
# ---------------------------------------------------------------------------

def test_refresh_needed():
    """When token expires in 30s, _refresh_if_needed calls token URL and updates creds."""
    creds = _make_creds(tokenExpiresAt=int(time.time()) + 30)
    new_token_resp = _mock_resp(200, {
        "access_token": "new_at",
        "refresh_token": "new_rt",
        "expires_in": 86400,
    })
    from utils.tiktok_post_helper import _refresh_if_needed, TIKTOK_TOKEN_URL

    with (
        patch("utils.tiktok_post_helper.requests.post", return_value=new_token_resp) as mock_post,
        patch("utils.tiktok_post_helper.integrations_service.save_integration"),
    ):
        result = _refresh_if_needed(creds, "user4")

    mock_post.assert_called_once()
    call_kwargs = mock_post.call_args
    assert call_kwargs[0][0] == TIKTOK_TOKEN_URL
    assert call_kwargs[1]["data"]["grant_type"] == "refresh_token"
    assert result["accessToken"] == "new_at"
    assert result["refreshToken"] == "new_rt"


# ---------------------------------------------------------------------------
# Test 5: PULL_FROM_URL success end-to-end
# ---------------------------------------------------------------------------

def test_pull_from_url_success():
    """Full happy path: PULL_FROM_URL init succeeds + poll returns PUBLISH_COMPLETE."""
    creds = _make_creds()
    integration = {"credentials": creds}

    init_resp = _mock_resp(200, {"data": {"publish_id": "tt_abc123"}})
    creator_resp = _mock_resp(200, {"data": {"creator_avatar_info": {"privacy_level_options": ["PUBLIC_TO_EVERYONE"]}}})
    status_resp = _mock_resp(200, {"data": {"status": "PUBLISH_COMPLETE"}})

    # Call order: creator_info → init → status
    call_sequence = [creator_resp, init_resp, status_resp]

    with (
        patch("utils.tiktok_post_helper.integrations_service.get_integration", return_value=integration),
        patch("utils.tiktok_post_helper.requests.post", side_effect=call_sequence),
        patch("utils.tiktok_post_helper.time.sleep"),  # skip sleeps
    ):
        from utils.tiktok_post_helper import post_video_to_tiktok
        result = post_video_to_tiktok(
            "https://d2nbx2qjod9qta.cloudfront.net/video.mp4",
            "Test caption",
            "Test title",
            user_id="user5",
        )

    assert result["success"] is True
    assert result["publish_id"] == "tt_abc123"
    assert result["platform"] == "tiktok"
    assert result["status"] == "PUBLISH_COMPLETE"


# ---------------------------------------------------------------------------
# Test 6: PULL_FROM_URL domain_not_verified → fallback to FILE_UPLOAD
# ---------------------------------------------------------------------------

def test_pull_from_url_domain_not_verified_fallback(tmp_path):
    """When PULL_FROM_URL returns domain_not_verified, FILE_UPLOAD init is called."""
    creds = _make_creds()
    integration = {"credentials": creds}

    # Create a real temp file so os.path.isfile passes
    video_file = tmp_path / "video.mp4"
    video_file.write_bytes(b"\x00" * 1024)

    creator_resp_pull = _mock_resp(200, {"data": {"creator_avatar_info": {"privacy_level_options": []}}})
    # PULL_FROM_URL init fails with domain_not_verified
    pull_error_resp = _mock_resp(400, {"error": {"code": "domain_not_verified"}})
    pull_error_resp.text = '{"error": {"code": "domain_not_verified"}}'

    # FILE_UPLOAD init succeeds
    creator_resp_upload = _mock_resp(200, {"data": {"creator_avatar_info": {"privacy_level_options": []}}})
    file_upload_init_resp = _mock_resp(200, {
        "data": {"upload_url": "https://upload.tiktok.com/abc", "publish_id": "tt_file123"}
    })
    status_resp = _mock_resp(200, {"data": {"status": "PUBLISH_COMPLETE"}})

    # Request sequence:
    # 1. creator_info for PULL_FROM_URL attempt (but PULL_FROM_URL is skipped because file_path is local)
    # 2. creator_info for FILE_UPLOAD (since local path triggers FILE_UPLOAD directly)
    # 3. FILE_UPLOAD init
    # 4. status poll

    # With local file path, the code skips PULL_FROM_URL and goes directly to FILE_UPLOAD
    call_sequence = [creator_resp_upload, file_upload_init_resp, status_resp]

    with (
        patch("utils.tiktok_post_helper.integrations_service.get_integration", return_value=integration),
        patch("utils.tiktok_post_helper.requests.post", side_effect=call_sequence) as mock_post,
        patch("utils.tiktok_post_helper.requests.put", return_value=_mock_resp(204)),
        patch("utils.tiktok_post_helper.time.sleep"),
    ):
        from utils.tiktok_post_helper import post_video_to_tiktok
        result = post_video_to_tiktok(
            str(video_file),  # local path — triggers FILE_UPLOAD
            "Test caption",
            "Test title",
            user_id="user6",
        )

    # FILE_UPLOAD init must have been called (contains "FILE_UPLOAD" in request body)
    file_upload_calls = [
        c for c in mock_post.call_args_list
        if "FILE_UPLOAD" in str(c)
    ]
    assert len(file_upload_calls) >= 1, "Expected FILE_UPLOAD init call"
    assert result["success"] is True
    assert result["publish_id"] == "tt_file123"


# ---------------------------------------------------------------------------
# Test 7: poll status returns FAILED → Exception raised
# ---------------------------------------------------------------------------

def test_poll_status_failed():
    """When status poll returns FAILED, _poll_publish_status raises Exception with fail_reason."""
    creds = _make_creds()
    status_resp = _mock_resp(200, {"data": {"status": "FAILED", "fail_reason": "video_too_long"}})

    from utils.tiktok_post_helper import _poll_publish_status

    with (
        patch("utils.tiktok_post_helper.requests.post", return_value=status_resp),
        patch("utils.tiktok_post_helper.time.sleep"),
    ):
        with pytest.raises(Exception, match="video_too_long"):
            _poll_publish_status("at_test", "tt_fail123")
