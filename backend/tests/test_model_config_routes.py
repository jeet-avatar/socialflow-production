"""Tests for /model-config routes."""


def test_get_default_config_not_found(client, auth_headers):
    """Model config does not exist yet — returns 200 with empty dict."""
    response = client.get("/model-config", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == {}


def test_upsert_default_config(client, auth_headers):
    payload = {
        "script_model": "gpt-4o",
        "voice_provider": "elevenlabs",
        "voice_id": "rachel",
        "video_bg_provider": "fal_kling",
        "research_provider": "serper",
    }
    response = client.post("/model-config", json=payload, headers=auth_headers)
    assert response.status_code == 200

    # Second upsert must not create a duplicate
    response2 = client.post("/model-config", json=payload, headers=auth_headers)
    assert response2.status_code == 200


def test_model_config_requires_auth(client):
    response = client.get("/model-config")
    assert response.status_code == 401
