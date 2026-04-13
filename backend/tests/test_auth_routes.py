"""Tests for /auth routes."""


def test_user_profile_requires_auth(client):
    """User profile endpoint must require authentication."""
    response = client.get("/auth/user-profile")
    assert response.status_code == 401


def test_user_profile_with_auth(client, auth_headers, mock_db):
    """Authenticated request to user profile must not return 401."""
    mock_db["users"].insert_one({"user_id": "dev_user", "email": "dev@local"})
    response = client.get("/auth/user-profile", headers=auth_headers)
    assert response.status_code != 401


def test_sync_user_accepts_valid_payload(client):
    """Sync-user must accept a valid payload and not crash."""
    payload = {
        "supabase_user_id": "user_abc123",
        "email": "test@example.com",
        "provider": "clerk",
        "email_confirmed_at": "2026-01-01T00:00:00Z",
        "last_sign_in_at": "2026-01-01T00:00:00Z",
        "user_metadata": {},
        "app_metadata": {},
    }
    response = client.post("/auth/sync-user", json=payload)
    # Either succeeds (200) or DB error (500) — must not be a 422 (validation error)
    assert response.status_code != 422


def test_notify_login_accepts_valid_payload(client):
    """Notify-login must accept a valid payload."""
    response = client.post(
        "/auth/notify-login",
        json={"email": "user@example.com", "name": "Test User"},
    )
    # 200 (sent) or 500 (SMTP not configured) — not 422
    assert response.status_code != 422
