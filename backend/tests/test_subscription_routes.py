"""Tests for /api/subscription routes — pricing, auth enforcement."""


def test_get_plans_returns_three_tiers(client):
    """Plans endpoint must return exactly 3 tiers with correct prices."""
    response = client.get("/api/subscription/plans")
    assert response.status_code == 200
    plans = response.json()["plans"]
    assert len(plans) == 3
    prices = {p["id"]: p["price"] for p in plans}
    assert prices["starter"] == 29
    assert prices["creator"] == 79
    assert prices["agency"] == 199


def test_no_forty_nine_dollar_plan(client):
    """$49 price must not appear anywhere in the plans response."""
    response = client.get("/api/subscription/plans")
    assert response.status_code == 200
    assert "49" not in response.text


def test_subscription_status_requires_auth(client):
    """Status endpoint must require authentication."""
    response = client.get("/api/subscription/status/some-user-id")
    assert response.status_code == 401


def test_subscription_status_forbidden_for_wrong_user(client, auth_headers):
    """Authenticated user must not access another user's subscription."""
    response = client.get(
        "/api/subscription/status/different-user-id",
        headers=auth_headers,
    )
    assert response.status_code == 403


def test_subscription_cancel_requires_auth(client):
    response = client.post("/api/subscription/cancel/some-user-id")
    assert response.status_code == 401


def test_subscription_config_is_public(client):
    """Config endpoint (publishable key) must be publicly accessible."""
    response = client.get("/api/subscription/config")
    assert response.status_code == 200
