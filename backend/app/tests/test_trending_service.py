"""Tests for trending_service — run with pytest."""
import pytest
from unittest.mock import patch, MagicMock


def test_get_trending_returns_list_of_dicts():
    """Basic contract: returns a list of dicts with expected keys."""
    from utils.trending_service import get_trending_for_niche

    mock_feed = MagicMock()
    mock_feed.entries = [
        {
            "title": "Fed holds rates",
            "link": "https://example.com/1",
            "published": "Wed, 16 Apr 2026 10:00:00 GMT",
            "source": {"title": "Reuters"},
        }
    ]

    with patch("utils.trending_service.feedparser.parse", return_value=mock_feed), \
         patch("utils.trending_service._get_redis_client", return_value=None):
        result = get_trending_for_niche("personal finance", max_results=5)

    assert isinstance(result, list)
    assert len(result) == 1
    assert "title" in result[0]
    assert "url" in result[0]
    assert result[0]["title"] == "Fed holds rates"
    assert result[0]["source"] == "Reuters"


def test_get_trending_returns_empty_on_error():
    """On any fetch error, returns [] (non-fatal)."""
    from utils.trending_service import get_trending_for_niche

    with patch("utils.trending_service.feedparser.parse", side_effect=Exception("network error")), \
         patch("utils.trending_service._get_redis_client", return_value=None):
        result = get_trending_for_niche("tech")

    assert result == []


def test_empty_niche_uses_general_query():
    """Empty niche → uses fallback query for general news."""
    from utils.trending_service import _build_feed_url

    url = _build_feed_url("")
    assert "trending+news+today" in url

def test_niche_query_is_url_encoded():
    """Niche string is URL-encoded in feed URL."""
    from utils.trending_service import _build_feed_url

    url = _build_feed_url("personal finance")
    assert "personal+finance" in url or "personal%20finance" in url
