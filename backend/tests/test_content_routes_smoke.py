"""
Smoke tests for content_routes — lightweight auth enforcement checks.

These tests verify that routes exist and enforce auth (or respond) without
triggering real pipelines (no OpenAI, no ElevenLabs, no S3, no YouTube).

10 test cases:
1. voice_previews_requires_auth
2. voice_previews_authenticated_responds
3. progress_endpoint_missing_job
4. progress_endpoint_no_auth_required
5. generate_with_valid_payload
6. post_to_youtube_requires_auth
7. post_to_instagram_requires_auth
8. post_to_facebook_requires_auth
9. post_to_tiktok_requires_auth
10. generate_missing_required_fields

Routes (content_routes has no prefix — registered directly on app):
  GET  /voice-previews
  GET  /video-remotion/progress/{job_id}
  POST /generate
  POST /post-to-youtube
  POST /post-to-instagram
  POST /post-to-facebook
  POST /post-to-tiktok
"""
import pytest
from unittest.mock import patch


# ---------------------------------------------------------------------------
# voice-previews
# ---------------------------------------------------------------------------

def test_voice_previews_requires_auth(client):
    """GET /voice-previews without Authorization header → 401."""
    resp = client.get("/voice-previews")
    assert resp.status_code == 401


def test_voice_previews_authenticated_responds(client, auth_headers):
    """GET /voice-previews with auth → NOT 401 or 422 (may be 500 — API key missing, that's OK)."""
    resp = client.get("/voice-previews", headers=auth_headers)
    assert resp.status_code not in (401, 422), (
        f"Expected service-level response, got {resp.status_code}: {resp.text}"
    )


# ---------------------------------------------------------------------------
# video-remotion/progress
# Progress endpoint calls Redis (get_progress). Mock the redis get_progress util
# to avoid ConnectionError in test environments without Redis.
# ---------------------------------------------------------------------------

def test_progress_endpoint_missing_job(client):
    """GET /video-remotion/progress/{job_id} with unknown job_id → 200, never 500.

    Patch at routes.content_routes._get_progress (the aliased import, not the utils module).
    content_routes.py: `from utils.redis_client import get_progress as _get_progress`
    → alias is bound at import time; must patch the name in content_routes module.
    """
    with patch("routes.content_routes._get_progress", return_value={}):
        resp = client.get("/video-remotion/progress/nonexistent-job-id-abc123")
    assert resp.status_code in (200, 404), (
        f"Unexpected status {resp.status_code}: {resp.text}"
    )


def test_progress_endpoint_no_auth_required(client):
    """GET /video-remotion/progress/{job_id} is a public status endpoint — no auth check."""
    with patch("routes.content_routes._get_progress", return_value={"percent": 0, "stage": "queued"}):
        resp = client.get("/video-remotion/progress/any-job-id")
    # If 401 is returned, the route erroneously enforces auth
    assert resp.status_code != 401, "Progress endpoint should not require auth"
    assert resp.status_code != 422, f"422 means route signature mismatch: {resp.text}"


# ---------------------------------------------------------------------------
# /generate (uses Header() auth — not CurrentUser Depends, so no 401 on missing token)
# ---------------------------------------------------------------------------

def test_generate_with_valid_payload(client, auth_headers):
    """POST /generate with valid payload responds (may be 500 if OpenAI unavailable — that's OK)."""
    resp = client.post(
        "/generate",
        json={"dialogue": "test content"},
        headers=auth_headers,
    )
    # 401/422 = structural problem; 200/500 = expected range (OpenAI key is fake in test env)
    assert resp.status_code not in (401, 422), (
        f"Unexpected status {resp.status_code}: {resp.text}"
    )


def test_generate_missing_required_fields(client, auth_headers):
    """POST /generate with empty body → 200 with error key (route handles gracefully)."""
    resp = client.post("/generate", json={}, headers=auth_headers)
    # Route returns {"error": "Either prompt or company_name is required"} with 200
    assert resp.status_code == 200
    body = resp.json()
    assert "error" in body


# ---------------------------------------------------------------------------
# Social posting routes — auth enforcement (POST without auth → 401)
# ---------------------------------------------------------------------------

def test_post_to_youtube_requires_auth(client):
    """POST /post-to-youtube without auth → 401."""
    resp = client.post(
        "/post-to-youtube",
        json={"video_url": "https://example.com/video.mp4"},
    )
    assert resp.status_code == 401


def test_post_to_instagram_requires_auth(client):
    """POST /post-to-instagram without auth → 401."""
    resp = client.post(
        "/post-to-instagram",
        json={"video_url": "https://example.com/video.mp4"},
    )
    assert resp.status_code == 401


def test_post_to_facebook_requires_auth(client):
    """POST /post-to-facebook without auth → 401."""
    resp = client.post(
        "/post-to-facebook",
        json={"video_url": "https://example.com/video.mp4"},
    )
    assert resp.status_code == 401


def test_post_to_tiktok_requires_auth(client):
    """POST /post-to-tiktok without auth → 401."""
    resp = client.post(
        "/post-to-tiktok",
        json={"video_url": "https://example.com/video.mp4"},
    )
    assert resp.status_code == 401
