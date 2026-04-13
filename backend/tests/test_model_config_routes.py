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


def test_list_providers(client):
    """GET /model-config/providers — no auth required, returns all 4 provider lists."""
    response = client.get("/model-config/providers")
    assert response.status_code == 200
    data = response.json()
    assert "script_models" in data
    assert "voice_providers" in data
    assert "video_bg_providers" in data
    assert "research_providers" in data
    # Verify known values are present
    assert "claude-sonnet-4-6" in data["script_models"]
    assert "elevenlabs" in data["voice_providers"]
    assert "fal_kling" in data["video_bg_providers"]
    assert "serper" in data["research_providers"]
    # Lists must be sorted (the endpoint sorts them)
    assert data["script_models"] == sorted(data["script_models"])
