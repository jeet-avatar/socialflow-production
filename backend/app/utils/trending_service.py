"""
Trending topics via Google News RSS.

get_trending_for_niche(niche, max_results=8) -> list[dict]

Caches results in Redis for CACHE_TTL seconds (default 6h).
Falls back to [] on any error (non-fatal — caller shows "No trends available").
"""
import logging
from urllib.parse import quote_plus

import feedparser

logger = logging.getLogger(__name__)

CACHE_TTL = 6 * 3600  # 6 hours in seconds
_FEED_BASE = "https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q={query}"


def _build_feed_url(niche: str) -> str:
    query = niche.strip() if niche.strip() else "trending news today"
    return _FEED_BASE.format(query=quote_plus(query))


def _get_redis_client():
    """Return Redis client or None if unavailable."""
    try:
        from utils.redis_client import _get_client
        return _get_client()
    except Exception:
        return None


def get_trending_for_niche(niche: str, max_results: int = 8) -> list[dict]:
    """
    Fetch trending news topics for a given niche.
    Results are cached in Redis for CACHE_TTL seconds.
    Returns list of {title, url, source, published_at}.
    Returns [] on any error.
    """
    cache_key = f"trending:{niche[:80]}"

    # Try Redis cache first
    redis = _get_redis_client()
    if redis:
        try:
            import json
            cached = redis.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass  # Cache miss is fine — fall through to fetch

    try:
        feed_url = _build_feed_url(niche)
        feed = feedparser.parse(feed_url)
        results = []
        for entry in feed.entries[:max_results]:
            source = ""
            if hasattr(entry, "source") and hasattr(entry.source, "title"):
                source = entry.source.title
            results.append({
                "title": entry.get("title", ""),
                "url": entry.get("link", ""),
                "source": source,
                "published_at": entry.get("published", ""),
            })

        # Store in Redis cache
        if redis and results:
            try:
                import json
                redis.setex(cache_key, CACHE_TTL, json.dumps(results))
            except Exception:
                pass

        logger.info("Trending: fetched %d topics for niche='%s'", len(results), niche[:40])
        return results

    except Exception as exc:
        logger.warning("Trending: failed to fetch for niche='%s': %s", niche[:40], exc)
        return []
