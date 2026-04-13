"""Tests for CORS configuration."""


def test_cors_unknown_origin_rejected(client):
    """Origin not in ALLOWED_ORIGINS must not receive ACAO header."""
    response = client.options(
        "/health",
        headers={
            "Origin": "https://evil.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert "access-control-allow-origin" not in response.headers


def test_cors_known_origin_allowed(client):
    """Origin in ALLOWED_ORIGINS must receive ACAO header."""
    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code < 500
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"
