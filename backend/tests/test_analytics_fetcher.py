"""
Unit tests for analytics_fetcher.py — all 4 platform fetcher functions.

ALL imports are lazy (inside function bodies) in analytics_fetcher.py.
Strategy:
  - Stub googleapiclient in sys.modules BEFORE importing the fetcher module.
  - Patch at the utils.* import path, not at analytics_fetcher (names are local
    to function scope — same pattern discovered in Phase 09-01 for analytics_routes).
  - No live network calls, no real credentials.

18 test cases across tiktok (2), youtube (6), instagram (5), facebook (5).
"""
from unittest.mock import patch, MagicMock, PropertyMock
import sys
import pytest

# ---------------------------------------------------------------------------
# Stub ALL Google/googleapis packages BEFORE any import — youtube_post_helper
# has top-level `from google.oauth2.credentials import Credentials` etc.
# ---------------------------------------------------------------------------
_gc_mock = MagicMock()
for _mod_name in [
    "googleapiclient",
    "googleapiclient.discovery",
    "googleapiclient.errors",
    "googleapiclient.http",
    "google",
    "google.oauth2",
    "google.oauth2.credentials",
    "google.auth",
    "google.auth.transport",
    "google.auth.transport.requests",
]:
    sys.modules.setdefault(_mod_name, _gc_mock)

# Import utils.youtube_post_helper explicitly so that `patch("utils.youtube_post_helper.X")`
# resolves — the module must be in sys.modules before patch() can traverse it.
import utils.youtube_post_helper  # noqa: E402, F401

# Now it's safe to import the fetcher functions
from utils.analytics_fetcher import (  # noqa: E402
    fetch_tiktok_stats,
    fetch_youtube_stats,
    fetch_instagram_stats,
    fetch_facebook_stats,
)


# ===========================================================================
# fetch_tiktok_stats (2 cases — always {})
# ===========================================================================

class TestFetchTiktokStats:
    def test_tiktok_returns_empty_dict(self):
        """TikTok publish_id is a lifecycle ID, not a video ID. Always {}."""
        result = fetch_tiktok_stats("u1", "pub-abc")
        assert result == {}

    def test_tiktok_ignores_publish_id(self):
        """Any publish_id value must return {}."""
        for publish_id in ["", "any-id-123", "0", None]:
            result = fetch_tiktok_stats("u1", publish_id)
            assert result == {}, f"Expected {{}} for publish_id={publish_id!r}"


# ===========================================================================
# fetch_youtube_stats (6 cases)
# ===========================================================================

class TestFetchYoutubeStats:
    def test_youtube_no_credentials_returns_empty(self):
        """_resolve_yt_credentials returns {'success': False} → {}."""
        with patch(
            "utils.youtube_post_helper._resolve_yt_credentials",
            return_value={"success": False},
        ):
            result = fetch_youtube_stats("u1", "vid-abc")
        assert result == {}

    def test_youtube_cred_build_error_returns_empty(self):
        """_build_yt_oauth_creds returns (None, error_str) → {}."""
        with (
            patch(
                "utils.youtube_post_helper._resolve_yt_credentials",
                return_value={"success": True, "raw": "creds"},
            ),
            patch(
                "utils.youtube_post_helper._build_yt_oauth_creds",
                return_value=(None, "token expired"),
            ),
        ):
            result = fetch_youtube_stats("u1", "vid-abc")
        assert result == {}

    def test_youtube_api_success(self):
        """Full happy path: creds OK → build() → videos().list().execute() → stats."""
        mock_creds = MagicMock()
        mock_youtube = MagicMock()
        mock_youtube.videos.return_value.list.return_value.execute.return_value = {
            "items": [
                {
                    "statistics": {
                        "viewCount": "100",
                        "likeCount": "5",
                        "commentCount": "3",
                    }
                }
            ]
        }

        with (
            patch(
                "utils.youtube_post_helper._resolve_yt_credentials",
                return_value={"success": True, "raw": "creds"},
            ),
            patch(
                "utils.youtube_post_helper._build_yt_oauth_creds",
                return_value=(mock_creds, None),
            ),
            patch(
                "googleapiclient.discovery.build",
                return_value=mock_youtube,
            ),
        ):
            result = fetch_youtube_stats("u1", "vid-abc")

        assert result == {"views": 100, "likes": 5, "comments": 3}

    def test_youtube_empty_items_returns_empty(self):
        """API returns {'items': []} → {}."""
        mock_creds = MagicMock()
        mock_youtube = MagicMock()
        mock_youtube.videos.return_value.list.return_value.execute.return_value = {"items": []}

        with (
            patch(
                "utils.youtube_post_helper._resolve_yt_credentials",
                return_value={"success": True},
            ),
            patch(
                "utils.youtube_post_helper._build_yt_oauth_creds",
                return_value=(mock_creds, None),
            ),
            patch(
                "googleapiclient.discovery.build",
                return_value=mock_youtube,
            ),
        ):
            result = fetch_youtube_stats("u1", "vid-abc")

        assert result == {}

    def test_youtube_exception_returns_empty(self):
        """_resolve_yt_credentials raises → caught by outer try/except → {}."""
        with patch(
            "utils.youtube_post_helper._resolve_yt_credentials",
            side_effect=Exception("network error"),
        ):
            result = fetch_youtube_stats("u1", "vid-abc")
        assert result == {}

    def test_youtube_missing_stat_fields_default_zero(self):
        """statistics={} (no viewCount etc.) → all fields default to 0."""
        mock_creds = MagicMock()
        mock_youtube = MagicMock()
        mock_youtube.videos.return_value.list.return_value.execute.return_value = {
            "items": [{"statistics": {}}]
        }

        with (
            patch(
                "utils.youtube_post_helper._resolve_yt_credentials",
                return_value={"success": True},
            ),
            patch(
                "utils.youtube_post_helper._build_yt_oauth_creds",
                return_value=(mock_creds, None),
            ),
            patch(
                "googleapiclient.discovery.build",
                return_value=mock_youtube,
            ),
        ):
            result = fetch_youtube_stats("u1", "vid-abc")

        assert result == {"views": 0, "likes": 0, "comments": 0}


# ===========================================================================
# fetch_instagram_stats (5 cases)
# ===========================================================================

class TestFetchInstagramStats:
    def test_instagram_no_integration_returns_empty(self):
        """get_integration returns None → {}."""
        with patch(
            "utils.integrations_service.integrations_service.get_integration",
            return_value=None,
        ):
            result = fetch_instagram_stats("u1", "media-abc")
        assert result == {}

    def test_instagram_no_token_returns_empty(self):
        """Integration exists but credentials.accessToken is empty → {}."""
        mock_integration = {"credentials": {"accessToken": ""}}
        with patch(
            "utils.integrations_service.integrations_service.get_integration",
            return_value=mock_integration,
        ):
            result = fetch_instagram_stats("u1", "media-abc")
        assert result == {}

    def test_instagram_http_error_returns_empty(self):
        """HTTP 400 response → {}."""
        mock_integration = {"credentials": {"accessToken": "tok-abc"}}
        mock_response = MagicMock()
        mock_response.status_code = 400

        with (
            patch(
                "utils.integrations_service.integrations_service.get_integration",
                return_value=mock_integration,
            ),
            patch("requests.get", return_value=mock_response),
        ):
            result = fetch_instagram_stats("u1", "media-abc")
        assert result == {}

    def test_instagram_api_success(self):
        """200 + valid JSON → {'views': 50, 'likes': 3, 'comments': 1}."""
        mock_integration = {"credentials": {"accessToken": "tok-abc"}}
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": [
                {"name": "views",    "values": [{"value": 50}]},
                {"name": "likes",    "value": 3},
                {"name": "comments", "values": [{"value": 1}]},
            ]
        }

        with (
            patch(
                "utils.integrations_service.integrations_service.get_integration",
                return_value=mock_integration,
            ),
            patch("requests.get", return_value=mock_response),
        ):
            result = fetch_instagram_stats("u1", "media-abc")

        assert result == {"views": 50, "likes": 3, "comments": 1}

    def test_instagram_exception_returns_empty(self):
        """requests.get raises ConnectionError → caught by outer try/except → {}."""
        import requests as _req

        mock_integration = {"credentials": {"accessToken": "tok-abc"}}

        with (
            patch(
                "utils.integrations_service.integrations_service.get_integration",
                return_value=mock_integration,
            ),
            patch(
                "requests.get",
                side_effect=_req.exceptions.ConnectionError("timeout"),
            ),
        ):
            result = fetch_instagram_stats("u1", "media-abc")
        assert result == {}


# ===========================================================================
# fetch_facebook_stats (5 cases)
# ===========================================================================

class TestFetchFacebookStats:
    def test_facebook_no_integration_returns_empty(self):
        """get_integration returns None → {}."""
        with patch(
            "utils.integrations_service.integrations_service.get_integration",
            return_value=None,
        ):
            result = fetch_facebook_stats("u1", "fb-vid-abc")
        assert result == {}

    def test_facebook_no_token_returns_empty(self):
        """Integration exists but token is empty → {}."""
        mock_integration = {"credentials": {"accessToken": ""}}
        with patch(
            "utils.integrations_service.integrations_service.get_integration",
            return_value=mock_integration,
        ):
            result = fetch_facebook_stats("u1", "fb-vid-abc")
        assert result == {}

    def test_facebook_http_error_returns_empty(self):
        """HTTP 403 response → {}."""
        mock_integration = {"credentials": {"accessToken": "fb-tok"}}
        mock_response = MagicMock()
        mock_response.status_code = 403

        with (
            patch(
                "utils.integrations_service.integrations_service.get_integration",
                return_value=mock_integration,
            ),
            patch("requests.get", return_value=mock_response),
        ):
            result = fetch_facebook_stats("u1", "fb-vid-abc")
        assert result == {}

    def test_facebook_api_success(self):
        """200 + valid JSON with total_video_views → {'views': 200, 'likes': 0, 'comments': 0}."""
        mock_integration = {"credentials": {"accessToken": "fb-tok"}}
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": [
                {"name": "total_video_views", "values": [{"value": 200}]},
            ]
        }

        with (
            patch(
                "utils.integrations_service.integrations_service.get_integration",
                return_value=mock_integration,
            ),
            patch("requests.get", return_value=mock_response),
        ):
            result = fetch_facebook_stats("u1", "fb-vid-abc")

        assert result == {"views": 200, "likes": 0, "comments": 0}

    def test_facebook_exception_returns_empty(self):
        """requests.get raises → caught by outer try/except → {}."""
        import requests as _req

        mock_integration = {"credentials": {"accessToken": "fb-tok"}}

        with (
            patch(
                "utils.integrations_service.integrations_service.get_integration",
                return_value=mock_integration,
            ),
            patch(
                "requests.get",
                side_effect=_req.exceptions.ConnectionError("refused"),
            ),
        ):
            result = fetch_facebook_stats("u1", "fb-vid-abc")
        assert result == {}
