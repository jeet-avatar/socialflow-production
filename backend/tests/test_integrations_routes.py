"""
Tests for /api/integrations routes — save, list, get, delete, test-connection, OAuth stubs.

All routes live under the /api/integrations prefix.
External HTTP calls (Facebook, Instagram, etc.) are mocked.
MongoDB is provided by the mock_db / client fixtures from conftest.py.

IntegrationsService uses _ensure_connection() which calls mongodb_service.connect()
(a full DNS lookup). We bypass this by patching connect() to return True and setting
integrations_service.collection to the mock_db collection directly.
"""
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

import pytest
from bson import ObjectId


# ---------------------------------------------------------------------------
# Helpers / shared mocks
# ---------------------------------------------------------------------------

_USAGE_OK = {
    "can_proceed": True,
    "current_usage": 0,
    "limit": 3,
    "remaining": 3,
    "plan": "starter",
}

_USAGE_BLOCKED = {
    "can_proceed": False,
    "current_usage": 3,
    "limit": 3,
    "remaining": 0,
    "plan": "starter",
}


def _save_payload(platform="youtube"):
    return {
        "platform": platform,
        "credentials": {"clientId": "test-id", "clientSecret": "test-secret"},
        "is_connected": True,
    }


def _patch_subscription(allow=True):
    """Context manager that patches subscription service to allow or block."""
    usage = _USAGE_OK if allow else _USAGE_BLOCKED
    return patch(
        "utils.subscription_service.subscription_service.check_usage_limit",
        return_value=usage,
    )


def _patch_increment():
    return patch(
        "utils.subscription_service.subscription_service.increment_usage",
        return_value=None,
    )


@pytest.fixture(autouse=True)
def wire_integrations_service(mock_db):
    """
    IntegrationsService._ensure_connection() calls mongodb_service.connect() (DNS lookup).
    Bypass this by:
    1. Patching mongodb_service.connect to return True.
    2. Setting integrations_service.collection directly to the in-memory mock_db collection.
    3. Resetting collection to None after each test so the fixture is re-applied next time.
    """
    from utils import integrations_service as _svc_mod  # noqa: PLC0415
    from utils import mongodb_service as _mdb_mod  # noqa: PLC0415

    _svc = _svc_mod.integrations_service

    # Wire the in-memory collection before the test
    _svc.collection = mock_db["integrations"]

    with patch.object(_mdb_mod.mongodb_service, "connect", return_value=True):
        with patch.object(_mdb_mod.mongodb_service, "db", mock_db):
            yield

    # Reset so next test re-wires to its own mock_db
    _svc.collection = None


# ---------------------------------------------------------------------------
# POST /api/integrations/save
# ---------------------------------------------------------------------------

def test_save_requires_auth(client):
    """POST /save returns 401 without auth header."""
    response = client.post("/api/integrations/save", json=_save_payload())
    assert response.status_code == 401


def test_save_integration_success(client, auth_headers):
    """POST /save with valid payload returns 200."""
    with _patch_subscription(), _patch_increment():
        response = client.post(
            "/api/integrations/save",
            json=_save_payload("youtube"),
            headers=auth_headers,
        )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["integration"]["platform"] == "youtube"


def test_save_integration_persisted(client, auth_headers, mock_db):
    """After save, a doc exists in mock_db[integrations] for (user_id, platform)."""
    with _patch_subscription(), _patch_increment():
        response = client.post(
            "/api/integrations/save",
            json=_save_payload("youtube"),
            headers=auth_headers,
        )
    assert response.status_code == 200
    doc = mock_db["integrations"].find_one({"user_id": "dev_user", "platform": "youtube"})
    assert doc is not None
    assert doc["platform"] == "youtube"
    assert doc["user_id"] == "dev_user"


# ---------------------------------------------------------------------------
# GET /api/integrations/list
# ---------------------------------------------------------------------------

def test_list_requires_auth(client):
    """GET /list returns 401 without auth header."""
    response = client.get("/api/integrations/list")
    assert response.status_code == 401


def test_list_empty(client, auth_headers):
    """Authenticated GET /list returns success with empty or list."""
    response = client.get("/api/integrations/list", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert isinstance(data["integrations"], list)


def test_list_returns_saved(client, auth_headers):
    """After saving an integration, GET /list includes the platform name."""
    with _patch_subscription(), _patch_increment():
        client.post(
            "/api/integrations/save",
            json=_save_payload("youtube"),
            headers=auth_headers,
        )
    response = client.get("/api/integrations/list", headers=auth_headers)
    assert response.status_code == 200
    platforms = [i["platform"] for i in response.json()["integrations"]]
    assert "youtube" in platforms


# ---------------------------------------------------------------------------
# GET /api/integrations/{platform}
# ---------------------------------------------------------------------------

def test_get_requires_auth(client):
    """GET /youtube returns 401 without auth header."""
    response = client.get("/api/integrations/youtube")
    assert response.status_code == 401


def test_get_not_found(client, auth_headers):
    """GET /nonexistent_platform returns 200 with integration=None (not a 404)."""
    response = client.get("/api/integrations/nonexistent_platform", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["integration"] is None


def test_get_returns_saved(client, auth_headers):
    """Save then GET /youtube returns 200 with the platform field."""
    with _patch_subscription(), _patch_increment():
        client.post(
            "/api/integrations/save",
            json=_save_payload("youtube"),
            headers=auth_headers,
        )
    response = client.get("/api/integrations/youtube", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["integration"]["platform"] == "youtube"


# ---------------------------------------------------------------------------
# DELETE /api/integrations/{platform}
# ---------------------------------------------------------------------------

def test_delete_requires_auth(client):
    """DELETE /youtube returns 401 without auth header."""
    response = client.delete("/api/integrations/youtube")
    assert response.status_code == 401


def test_delete_not_found(client, auth_headers):
    """DELETE /nonexistent_platform must not return 500."""
    response = client.delete("/api/integrations/nonexistent_platform", headers=auth_headers)
    assert response.status_code in (200, 404)


def test_delete_removes_doc(client, auth_headers, mock_db):
    """After DELETE, the doc is gone from mock_db[integrations]."""
    # Seed the integration directly in mock_db
    mock_db["integrations"].insert_one({
        "_id": ObjectId(),
        "user_id": "dev_user",
        "platform": "youtube",
        "credentials": {"clientId": "enc_id", "clientSecret": "enc_secret"},
        "is_connected": True,
        "last_updated": datetime.now(timezone.utc),
        "last_tested": None,
    })
    response = client.delete("/api/integrations/youtube", headers=auth_headers)
    assert response.status_code == 200
    doc = mock_db["integrations"].find_one({"user_id": "dev_user", "platform": "youtube"})
    assert doc is None


# ---------------------------------------------------------------------------
# POST /api/integrations/test
# ---------------------------------------------------------------------------

def test_test_connection_requires_auth(client):
    """POST /test returns 401 without auth header."""
    response = client.post(
        "/api/integrations/test",
        json={"platform": "youtube", "credentials": {"clientId": "x", "clientSecret": "y"}},
    )
    assert response.status_code == 401


def test_test_connection_youtube_invalid_token(client, auth_headers):
    """POST /test with mocked _TESTERS["youtube"] returning success=False returns 200 with success=False."""
    import routes.integrations_routes as _ir  # noqa: PLC0415
    # _TESTERS holds function references set at import time; patch the dict entry directly.
    original = _ir._TESTERS.get("youtube")
    try:
        _ir._TESTERS["youtube"] = lambda creds: {"success": False, "error": "invalid token", "is_connected": False}
        response = client.post(
            "/api/integrations/test",
            json={"platform": "youtube", "credentials": {"clientId": "bad", "clientSecret": "bad"}},
            headers=auth_headers,
        )
    finally:
        if original is not None:
            _ir._TESTERS["youtube"] = original
        else:
            _ir._TESTERS.pop("youtube", None)
    assert response.status_code == 200
    assert response.json()["success"] is False


def test_test_connection_facebook_invalid(client, auth_headers):
    """POST /test with mocked _TESTERS["facebook"] returning success=False."""
    import routes.integrations_routes as _ir  # noqa: PLC0415
    original = _ir._TESTERS.get("facebook")
    try:
        _ir._TESTERS["facebook"] = lambda creds: {"success": False, "message": "invalid token", "is_connected": False}
        response = client.post(
            "/api/integrations/test",
            json={"platform": "facebook", "credentials": {"accessToken": "bad-token"}},
            headers=auth_headers,
        )
    finally:
        if original is not None:
            _ir._TESTERS["facebook"] = original
        else:
            _ir._TESTERS.pop("facebook", None)
    assert response.status_code == 200
    assert response.json()["success"] is False


def test_test_connection_instagram_invalid(client, auth_headers):
    """POST /test with mocked _TESTERS["instagram"] returning success=False."""
    import routes.integrations_routes as _ir  # noqa: PLC0415
    original = _ir._TESTERS.get("instagram")
    try:
        _ir._TESTERS["instagram"] = lambda creds: {"success": False, "message": "invalid token", "is_connected": False}
        response = client.post(
            "/api/integrations/test",
            json={"platform": "instagram", "credentials": {"accessToken": "bad-token"}},
            headers=auth_headers,
        )
    finally:
        if original is not None:
            _ir._TESTERS["instagram"] = original
        else:
            _ir._TESTERS.pop("instagram", None)
    assert response.status_code == 200
    assert response.json()["success"] is False


# ---------------------------------------------------------------------------
# OAuth authorize auth enforcement (no redirect URL validation)
# ---------------------------------------------------------------------------

def test_youtube_oauth_authorize_requires_auth(client):
    """GET /youtube/oauth/authorize returns 401 without auth header."""
    response = client.get("/api/integrations/youtube/oauth/authorize")
    assert response.status_code == 401


def test_tiktok_oauth_authorize_requires_auth(client):
    """GET /tiktok/oauth/authorize returns 401 without auth header."""
    response = client.get("/api/integrations/tiktok/oauth/authorize")
    assert response.status_code == 401
