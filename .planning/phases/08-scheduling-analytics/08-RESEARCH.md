# Phase 08: Scheduling + Analytics - Research

**Researched:** 2026-04-14
**Domain:** Celery Beat dynamic scheduling, platform analytics APIs (YouTube/Instagram/Facebook/TikTok), frontend charting
**Confidence:** MEDIUM-HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCHED-01 | Cron-based auto-posting: channels with `auto_post=True` fire on their configured `posting_frequency` without manual triggers | APScheduler AsyncIOScheduler with per-channel cron jobs, keyed by `channel_id` |
| SCHED-02 | Schedule management: adding/removing/updating jobs when channel settings change (auto_post toggle, frequency change) | `scheduler.add_job(id=channel_id, replace_existing=True)` and `scheduler.remove_job(id=channel_id)` |
| SCHED-03 | Job persistence: schedules survive backend restart; missed jobs handled gracefully | APScheduler MongoDBJobStore persists jobs across restarts; `misfire_grace_time` handles missed fires |
| ANALYTICS-01 | Cross-platform metrics fetch: views, likes, comments pulled from YouTube/Instagram/Facebook/TikTok APIs and stored in MongoDB | Per-platform analytics helpers, `platform_posts` collection to store platform video IDs |
| ANALYTICS-02 | Dashboard display: ChannelDashboard shows per-channel aggregated performance metrics in charts | Recharts 3.x `LineChart`/`BarChart` inside ChannelDashboard or new `ChannelAnalytics.tsx` tab |
</phase_requirements>

---

## Summary

Phase 08 has two distinct sub-domains: **scheduling** (backend, Python) and **analytics** (backend APIs + frontend charts). The scheduling problem is: each channel with `auto_post=True` needs to fire `render_video_task` on a cron schedule without a human trigger. The analytics problem is: after a video is posted to a platform, the platform-specific video ID must be stored so the app can fetch back view/like/comment counts.

The existing stack already has Celery workers + Redis (Phase 05) and all four platform post helpers (Phase 06). The scheduling solution is **APScheduler** (not Celery Beat) — APScheduler runs inside the FastAPI process, integrates cleanly with `asynccontextmanager` lifespan, supports MongoDB job stores for persistence, and adds/removes jobs dynamically via Python API calls. Celery Beat is the alternative but requires a separate `beat` process and is more complex to configure for dynamic per-channel schedules without Django ORM or SQLAlchemy.

Analytics are platform-specific: YouTube uses `videos().list(part="statistics")`, Instagram uses `/{media_id}/insights?metric=views,likes,comments`, Facebook uses `/{video_id}/video_insights`, and TikTok analytics via the Content Posting API only returns a `publish_id` (not a video ID with stats). TikTok's Research API does provide stats but requires academic approval, making it impractical. The pragmatic approach is to store what each platform returns and skip TikTok stats fetch (display N/A or use a polling stub).

**Primary recommendation:** Use APScheduler 3.x with MongoDBJobStore for scheduling (add it to the FastAPI lifespan, store `channel_id` as job ID), and add a `platform_posts` MongoDB collection to track posted video IDs for analytics fetching.

---

## Standard Stack

### Core — Scheduling

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `APScheduler` | 3.11.x | Dynamic per-channel cron jobs in-process | No separate beat process; MongoDBJobStore already available; direct `add_job/remove_job` API; works with `asynccontextmanager` lifespan |
| `pymongo` | existing | MongoDBJobStore backend | Already installed; no extra dependencies |

### Core — Analytics (Backend)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `google-api-python-client` | existing | YouTube `videos().list(part="statistics")` | Already in `requirements.txt`; used by `youtube_post_helper.py` |
| `requests` | existing | Instagram/Facebook/TikTok HTTP calls | Already installed; pattern matches existing post helpers |

### Core — Analytics (Frontend)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `recharts` | 3.8.x | Line/Bar charts in React | Lightweight, D3-based, first-class TypeScript support, React 18 compatible, active maintenance |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| APScheduler | Celery Beat | Beat requires a separate process + static `beat_schedule`; dynamic per-channel schedules require `django-celery-beat` (Django ORM) or `sqlalchemy-celery-beat` (SQLAlchemy) — neither fits this stack. APScheduler works in-process with MongoDB natively. |
| APScheduler | Custom cron in Celery task | Would require a "meta task" that loops, harder to persist, error-prone; APScheduler is purpose-built for this. |
| recharts | Chart.js / @observablehq/plot | Chart.js requires imperative canvas API, not React-idiomatic. recharts is the standard for React+TypeScript dashboards. |
| recharts | visx (Airbnb) | visx is lower-level (D3 primitives); more work for standard bar/line charts. Use recharts unless custom viz needed. |

**Installation:**
```bash
# Backend
pip install APScheduler==3.11.*

# Frontend
npm install recharts
```

---

## Architecture Patterns

### Recommended Project Structure (new files)

```
backend/app/
├── worker/
│   ├── celery_app.py          # existing — unchanged
│   ├── video_tasks.py         # existing — unchanged
│   └── scheduler.py           # NEW: APScheduler instance + lifespan helper
├── routes/
│   ├── channel_routes.py      # MODIFY: call scheduler.sync_channel() on PUT /{id}
│   └── analytics_routes.py    # NEW: GET /analytics/{channel_id}
├── utils/
│   └── analytics_fetcher.py   # NEW: per-platform stats fetch functions
└── main.py                    # MODIFY: wire scheduler lifespan

frontend/src/components/channels/
├── ChannelDashboard.tsx        # MODIFY: add Analytics tab / stats section
└── ChannelAnalytics.tsx        # NEW: recharts LineChart/BarChart for channel metrics
```

### Pattern 1: APScheduler Lifespan in FastAPI

**What:** Start APScheduler with MongoDBJobStore in FastAPI's `asynccontextmanager` lifespan. On startup, load all channels with `auto_post=True` and register their cron jobs. Expose a `sync_channel()` helper that `channel_routes.py` calls when a channel is updated.

**When to use:** Any time a FastAPI app needs persistent, dynamic, per-entity scheduled tasks without a separate process.

```python
# backend/app/worker/scheduler.py
from contextlib import asynccontextmanager
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.mongodb import MongoDBJobStore
from apscheduler.triggers.cron import CronTrigger
import logging
import os

logger = logging.getLogger(__name__)

# Frequency → cron kwargs mapping
FREQUENCY_CRON = {
    "daily":    {"hour": 9, "minute": 0},          # 09:00 UTC daily
    "3x_week":  {"day_of_week": "mon,wed,fri", "hour": 9, "minute": 0},
    "weekly":   {"day_of_week": "mon", "hour": 9, "minute": 0},
}

_scheduler: AsyncIOScheduler | None = None


def get_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is None:
        raise RuntimeError("Scheduler not initialized")
    return _scheduler


@asynccontextmanager
async def scheduler_lifespan():
    """Use inside FastAPI lifespan to start/stop APScheduler."""
    global _scheduler
    mongo_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")

    jobstores = {
        "default": MongoDBJobStore(
            database="socialflow",
            collection="apscheduler_jobs",
            host=mongo_uri,
        )
    }
    _scheduler = AsyncIOScheduler(jobstores=jobstores, timezone="UTC")
    _scheduler.start()
    logger.info("APScheduler started with MongoDBJobStore")

    # Re-register all channels that have auto_post=True on startup
    await _load_active_channels()

    try:
        yield _scheduler
    finally:
        _scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped")


async def _load_active_channels():
    """On startup: ensure every auto_post=True channel has a scheduled job."""
    try:
        from utils.mongodb_service import mongodb_service
        col = mongodb_service.get_database()["channels"]
        channels = list(col.find({"auto_post": True}))
        for ch in channels:
            _upsert_job(str(ch["_id"]), ch["posting_frequency"])
        logger.info(f"Loaded {len(channels)} scheduled channels")
    except Exception as e:
        logger.warning(f"Failed to load scheduled channels on startup: {e}")


def _upsert_job(channel_id: str, posting_frequency: str) -> None:
    """Add or replace the cron job for a channel."""
    cron_kwargs = FREQUENCY_CRON.get(posting_frequency, FREQUENCY_CRON["weekly"])
    _scheduler.add_job(
        _run_channel_pipeline,
        CronTrigger(**cron_kwargs, timezone="UTC"),
        id=f"channel:{channel_id}",
        args=[channel_id],
        replace_existing=True,
        misfire_grace_time=3600,   # Fire up to 1h late if missed
        coalesce=True,             # Skip accumulated missed fires
    )


def sync_channel(channel_id: str, auto_post: bool, posting_frequency: str) -> None:
    """
    Called by channel_routes.py after any channel PUT.
    Adds, updates, or removes the cron job based on auto_post flag.
    """
    job_id = f"channel:{channel_id}"
    if auto_post:
        _upsert_job(channel_id, posting_frequency)
    else:
        try:
            _scheduler.remove_job(job_id)
        except Exception:
            pass  # Job may not exist if auto_post was already False


async def _run_channel_pipeline(channel_id: str) -> None:
    """Cron job callback: dispatch render_video_task for a channel."""
    import uuid
    from worker.video_tasks import render_video_task
    try:
        from utils.mongodb_service import mongodb_service
        col = mongodb_service.get_database()["channels"]
        from bson import ObjectId
        ch = col.find_one({"_id": ObjectId(channel_id)})
        if not ch or not ch.get("auto_post"):
            return  # Channel disabled since job was scheduled

        job_id = str(uuid.uuid4())
        render_video_task.delay(
            user_id=ch["user_id"],
            job_id=job_id,
            body={"channel_id": channel_id, "niche": ch.get("niche", "")},
        )
        logger.info(f"Dispatched render_video_task for channel {channel_id}, job_id={job_id}")
    except Exception as e:
        logger.error(f"Failed to dispatch pipeline for channel {channel_id}: {e}")
```

### Pattern 2: Wire Scheduler into channel_routes.py

**What:** After every PUT /{channel_id}, call `sync_channel()` so the schedule stays in sync with the channel document.

```python
# In channel_routes.py, after update_one succeeds:
from worker.scheduler import sync_channel

# Resolve effective auto_post and posting_frequency from merged update + existing doc
effective_auto_post = updates.get("auto_post", existing_doc.get("auto_post", False))
effective_frequency = updates.get("posting_frequency", existing_doc.get("posting_frequency", "weekly"))
sync_channel(channel_id, effective_auto_post, effective_frequency)
```

### Pattern 3: platform_posts Collection

**What:** When a post helper returns success, store the platform video ID in a new `platform_posts` collection. The analytics fetcher reads this collection to know which IDs to query.

```python
# MongoDB schema — platform_posts collection
{
    "channel_id": str,       # channel the video belongs to
    "user_id":    str,       # owner
    "platform":   str,       # "youtube" | "instagram" | "facebook" | "tiktok"
    "platform_video_id": str, # platform-specific ID
    "posted_at":  datetime,
    "last_fetched_at": datetime | None,
    "stats": {
        "views":    int,
        "likes":    int,
        "comments": int,
    }
}
```

### Pattern 4: Analytics Fetcher (per-platform)

**What:** One function per platform that accepts a user's integration credentials and a `platform_video_id`, returns `{"views": int, "likes": int, "comments": int}`.

```python
# backend/app/utils/analytics_fetcher.py

def fetch_youtube_stats(user_id: str, video_id: str) -> dict:
    """Uses existing youtube creds + google-api-python-client."""
    from utils.youtube_post_helper import _resolve_yt_credentials, _build_yt_oauth_creds
    from googleapiclient.discovery import build

    creds_raw = _resolve_yt_credentials(user_id)
    if isinstance(creds_raw, dict) and not creds_raw.get("success", True):
        return {}
    creds, err = _build_yt_oauth_creds(creds_raw)
    if err:
        return {}

    youtube = build("youtube", "v3", credentials=creds)
    resp = youtube.videos().list(part="statistics", id=video_id).execute()
    items = resp.get("items", [])
    if not items:
        return {}
    stats = items[0].get("statistics", {})
    return {
        "views":    int(stats.get("viewCount", 0)),
        "likes":    int(stats.get("likeCount", 0)),
        "comments": int(stats.get("commentCount", 0)),
    }


def fetch_instagram_stats(user_id: str, media_id: str) -> dict:
    """GET /{media_id}/insights?metric=views,likes,comments (Graph API v25.0)."""
    import requests as _req
    from utils.integrations_service import integrations_service
    integration = integrations_service.get_integration(user_id, "instagram", decrypt=True)
    if not integration:
        return {}
    token = integration.get("credentials", {}).get("accessToken", "")
    if not token:
        return {}

    resp = _req.get(
        f"https://graph.instagram.com/v25.0/{media_id}/insights",
        params={"metric": "views,likes,comments,total_interactions", "access_token": token},
        timeout=15,
    )
    if resp.status_code != 200:
        return {}

    result = {}
    for item in resp.json().get("data", []):
        name = item.get("name")
        val  = item.get("values", [{}])[0].get("value", 0) if item.get("values") else item.get("value", 0)
        if name == "views":    result["views"]    = int(val)
        if name == "likes":    result["likes"]    = int(val)
        if name == "comments": result["comments"] = int(val)
    return result


def fetch_facebook_stats(user_id: str, video_id: str) -> dict:
    """GET /{video_id}/video_insights?metric=total_video_views (Graph API)."""
    import requests as _req
    from utils.integrations_service import integrations_service
    integration = integrations_service.get_integration(user_id, "facebook", decrypt=True)
    if not integration:
        return {}
    token = integration.get("credentials", {}).get("accessToken", "")
    if not token:
        return {}

    resp = _req.get(
        f"https://graph.facebook.com/v25.0/{video_id}/video_insights",
        params={
            "metric": "total_video_views,total_video_reactions_by_type_total",
            "access_token": token,
        },
        timeout=15,
    )
    if resp.status_code != 200:
        return {}
    views = 0
    for item in resp.json().get("data", []):
        if item.get("name") == "total_video_views":
            views = int(item.get("values", [{}])[0].get("value", 0))
    return {"views": views, "likes": 0, "comments": 0}  # FB API doesn't expose likes via video_insights


def fetch_tiktok_stats(user_id: str, publish_id: str) -> dict:
    """TikTok Content Posting API does not expose view counts on publish_id.
    Research API requires academic approval. Return empty dict — display N/A in UI.
    """
    return {}
```

### Pattern 5: Analytics API Route

```python
# backend/app/routes/analytics_routes.py
# GET /analytics/{channel_id}/posts   — list platform_posts with stats
# POST /analytics/{channel_id}/refresh — trigger stats re-fetch for all posts
```

### Pattern 6: ChannelAnalytics.tsx (Frontend)

```typescript
// Source: recharts.github.io/en-US/guide/installation/
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

// Each data point: { date: string, views: number, likes: number }
<ResponsiveContainer width="100%" height={240}>
  <LineChart data={statsData}>
    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
    <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 11 }} />
    <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
    <Tooltip
      contentStyle={{ background: '#0d0d14', border: '1px solid rgba(255,255,255,0.1)' }}
    />
    <Line type="monotone" dataKey="views" stroke="#14b8a6" dot={false} strokeWidth={2} />
    <Line type="monotone" dataKey="likes" stroke="#3b82f6" dot={false} strokeWidth={2} />
  </LineChart>
</ResponsiveContainer>
```

### Anti-Patterns to Avoid

- **Using Celery Beat for dynamic per-channel schedules without a DB-backed scheduler:** The default `celery_app.conf.beat_schedule` is a static dict — adding per-channel entries at runtime requires `celery-sqlalchemy-beat` or `django-celery-beat`, neither of which is in this stack. Use APScheduler instead.
- **Storing API keys in MongoDB job args:** APScheduler job args are serialized and stored in MongoDB. Never put credentials in `args` or `kwargs`. The `_run_channel_pipeline` function should resolve credentials from the integrations collection at runtime.
- **Importing `render_video_task` at module level in `scheduler.py`:** This breaks the existing circular-import guard. Always import inside the function body (same pattern as `video_tasks.py` uses for whisper).
- **Using TikTok's Research API for analytics:** Requires academic approval and a separate app; impractical for a SaaS product. TikTok Content Posting API `publish_id` has no viewCount endpoint. Display N/A for TikTok stats.
- **Fetching analytics in real-time on every page load:** Platform APIs have rate limits (YouTube: 10,000 units/day; Instagram: 200 calls/hour). Cache stats in MongoDB with a `last_fetched_at` field and only re-fetch if stale (>1h).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Persistent cron schedules | Custom "scheduler" collection with manual polling loop | APScheduler MongoDBJobStore | APScheduler handles missed fires, coalescing, timezone, persistence, add/remove API |
| YouTube stats | Custom OAuth token management + API client | Reuse `_resolve_yt_credentials()` + `_build_yt_oauth_creds()` from `youtube_post_helper.py` | These functions already exist and handle token refresh |
| Chart components | Custom SVG or canvas charts | recharts | Handles responsive containers, tooltips, axes — 500+ lines of avoided complexity |
| Schedule-to-cron mapping | Custom parser | `CronTrigger(**FREQUENCY_CRON[freq])` dict lookup | One line; APScheduler validates cron expressions |

**Key insight:** The analytics and scheduling patterns both follow the "lazy-import + resolve at call time" pattern already established in `video_tasks.py`. Every new function that touches MongoDB or external APIs should import inside the function body.

---

## Common Pitfalls

### Pitfall 1: APScheduler circular imports

**What goes wrong:** `scheduler.py` imports `render_video_task` at module level. `main.py` imports `scheduler`. `video_tasks.py` imports from `worker.celery_app`. If `scheduler.py` imports `video_tasks.py` at module level, you get a circular dependency at import time.

**Why it happens:** The existing `celery_app.py` ISOLATION RULE comment (line 1-12 of `celery_app.py`) already documents this: "This module MUST NOT import from routes/, main.py, or any module that imports from routes/ at module level."

**How to avoid:** Import `render_video_task` inside `_run_channel_pipeline` function body, not at module level in `scheduler.py`.

**Warning signs:** `ImportError: cannot import name 'celery_app' from partially initialized module` at startup.

### Pitfall 2: APScheduler MongoDBJobStore serialization

**What goes wrong:** Job args contain non-JSON-serializable objects (e.g., ObjectId, datetime). APScheduler pickles/serializes job args — complex objects fail.

**Why it happens:** MongoDBJobStore stores jobs with pickle serialization by default.

**How to avoid:** Only pass JSON-primitive args (str, int, float) to `add_job`. Never pass ORM objects or MongoDB documents as args. The `channel_id` string is safe; MongoDB ObjectId is not (convert with `str()`).

**Warning signs:** `PicklingError` on `add_job()`.

### Pitfall 3: Instagram API breaking changes (April 2025)

**What goes wrong:** Code uses deprecated metric names (`impressions`, `video_views` for non-Reels content). API returns 400 errors.

**Why it happens:** Meta deprecated `impressions` and added `views` as of April 21, 2025 (Graph API v21+). The `video_views` metric was deprecated for non-Reels posts as of January 2025.

**How to avoid:** Use `views` (not `impressions`, not `video_views`) for all Instagram media insights. Use `total_interactions` instead of `impressions` for overall engagement.

**Warning signs:** 400 response: `"Invalid parameter"` or `"Unsupported get request"` from the insights endpoint.

### Pitfall 4: TikTok publish_id vs video_id

**What goes wrong:** Code tries to fetch analytics using the `publish_id` from `tiktok_post_helper.py` as if it were a TikTok video ID. TikTok's Content Posting API does NOT return a `video_id` once a post is published — `PUBLISH_COMPLETE` status has no video identifier.

**Why it happens:** Confusing the publish lifecycle ID with the platform's content ID. TikTok only provides `video_id` after moderation completes, and only via webhook (not polling).

**How to avoid:** Store `publish_id` in `platform_posts` but mark TikTok stats as N/A. If webhook support is added later, the webhook payload contains the final `video_id`.

**Warning signs:** Attempting `GET /v2/video/query/?publish_id=...` returns 404 or empty results.

### Pitfall 5: YouTube quota exhaustion

**What goes wrong:** Fetching stats for every video on every page load exhausts the 10,000 units/day quota.

**Why it happens:** `videos().list()` costs 1 unit per call; at 100 videos × many users, quota is hit within hours.

**How to avoid:** Cache stats in the `platform_posts` MongoDB document. Only re-fetch when `last_fetched_at` is more than 1 hour old (check before calling API).

**Warning signs:** YouTube API returns `quotaExceeded` error (the `_classify_http_error` function in `youtube_post_helper.py` already handles this string).

### Pitfall 6: Multiple backend instances double-scheduling

**What goes wrong:** In production (2 ECS tasks), both instances start APScheduler and both try to fire the same channel job at the scheduled time. Each task is dispatched twice.

**Why it happens:** APScheduler runs in-process; with multiple uvicorn workers or ECS tasks, each has its own scheduler instance.

**How to avoid:** For Phase 08 (pre-ECS scale), single-process deployment sidesteps this. Add a `_SCHEDULER_ENABLED` env var (default `"true"`) so only one ECS task starts the scheduler (set to `"false"` on the second task). Document this as a known limitation for Phase 10 (production deploy).

**Warning signs:** Duplicate Celery tasks in the queue per cron fire.

---

## Code Examples

Verified patterns from official sources:

### YouTube stats fetch (google-api-python-client)
```python
# Source: https://developers.google.com/youtube/v3/docs/videos
youtube = build("youtube", "v3", credentials=creds)
response = youtube.videos().list(
    part="statistics",
    id="VIDEO_ID_HERE",
).execute()
stats = response["items"][0]["statistics"]
# stats keys: viewCount, likeCount, commentCount (all str, convert to int)
```

### Instagram media insights (Graph API v25.0)
```python
# Source: https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights/
# Deprecated as of Apr 21 2025: impressions, plays, ig_reels_aggregated_all_plays_count
# Current metrics: views, likes, comments, reach, saved, shares, total_interactions
GET https://graph.instagram.com/v25.0/{ig-media-id}/insights
    ?metric=views,likes,comments
    &access_token={token}
```

### APScheduler dynamic add/remove (APScheduler 3.x)
```python
# Source: https://apscheduler.readthedocs.io/en/3.x/userguide.html
from apscheduler.triggers.cron import CronTrigger

scheduler.add_job(
    func,
    CronTrigger(day_of_week="mon,wed,fri", hour=9, minute=0, timezone="UTC"),
    id="channel:abc123",
    replace_existing=True,
    misfire_grace_time=3600,
    coalesce=True,
)

# Remove
scheduler.remove_job("channel:abc123")  # raises JobLookupError if not found
```

### recharts ResponsiveContainer (v3.x)
```typescript
// Source: https://recharts.github.io/en-US/guide/installation/
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

<ResponsiveContainer width="100%" height={240}>
  <LineChart data={data}>
    <XAxis dataKey="date" />
    <YAxis />
    <Tooltip />
    <Line type="monotone" dataKey="views" stroke="#14b8a6" />
  </LineChart>
</ResponsiveContainer>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Instagram `impressions` metric | Instagram `views` metric | April 21, 2025 (Graph API v21+) | Must use `views`, not `impressions` in insights requests |
| Instagram `video_views` for non-Reels | Deprecated — use `views` | January 2025 (v21+) | Only `views` works universally |
| Instagram `plays`, `reel_plays` | All deprecated | April 21, 2025 | Replaced by unified `views` metric |
| Celery Beat static schedule config | APScheduler dynamic jobs | N/A — project choice | Dynamic per-channel schedules without separate beat process |
| recharts v2 | recharts v3 (breaking changes) | 2024 | `3.0 migration guide` exists; `dataKey` now typed with generics |

**Deprecated/outdated:**
- Instagram `impressions` metric: deprecated April 2025 — use `views`
- TikTok Research API for app analytics: requires academic approval, not usable in SaaS context

---

## Open Questions

1. **TikTok video ID after posting**
   - What we know: `tiktok_post_helper.py` returns only `publish_id`; Content Posting API does not expose a final `video_id` in the polling endpoint
   - What's unclear: Whether TikTok webhooks are practical to set up (requires registering a webhook endpoint in the developer portal)
   - Recommendation: Store `publish_id` in `platform_posts`, display "N/A" for TikTok stats in Phase 08; defer TikTok analytics to a future phase

2. **APScheduler multi-process safety in ECS (Phase 10)**
   - What we know: Two ECS tasks will both start APScheduler in Phase 10; MongoDBJobStore does NOT provide distributed locking — both processes will fire the same job
   - What's unclear: Whether Phase 10's ECS setup will use 2 tasks from the start
   - Recommendation: Add `SCHEDULER_ENABLED=true` env var; Phase 10 sets it to `false` on the second task. Document in Phase 10 research.

3. **Channel → niche → script generation flow for auto-posting**
   - What we know: `render_video_task` calls `_run_video_pipeline()` which requires a `dialogue` or `niche` field in the body; channels have a `niche` field
   - What's unclear: Whether the full pipeline (research → script → video → post) should run end-to-end for auto-posts, or if some input is still required
   - Recommendation: For Phase 08, auto-post triggers with `body={"channel_id": channel_id, "niche": ch["niche"]}` and relies on the existing AI pipeline to generate content from the niche. Verify `_run_video_pipeline` handles `niche`-only input (no pre-written dialogue).

---

## Sources

### Primary (HIGH confidence)
- [YouTube Data API v3 - Videos: list](https://developers.google.com/youtube/v3/docs/videos/list) — `statistics` part, field names `viewCount`, `likeCount`, `commentCount`
- [Instagram Media Insights - Meta for Developers](https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights/) — April 2025 metric changes, `views` replacing `impressions`
- [APScheduler 3.x user guide](https://apscheduler.readthedocs.io/en/3.x/userguide.html) — `AsyncIOScheduler`, `MongoDBJobStore`, `add_job`, `remove_job`, `CronTrigger`
- [recharts npm](https://www.npmjs.com/package/recharts) — version 3.8.1, React 18 compatible
- Project codebase: `celery_app.py`, `video_tasks.py`, `channel_routes.py`, `tiktok_post_helper.py`, `youtube_post_helper.py`, `ChannelDashboard.tsx`

### Secondary (MEDIUM confidence)
- [Facebook Video Insights - Meta for Developers](https://developers.facebook.com/docs/video-api/guides/insights/) — `total_video_views` metric, `/{video_id}/video_insights` endpoint
- [APScheduler MongoDBJobStore module docs](https://apscheduler.readthedocs.io/en/3.x/modules/jobstores/mongodb.html) — constructor parameters
- [FastAPI + APScheduler lifespan pattern](https://www.nashruddinamin.com/blog/running-scheduled-jobs-in-fastapi) — `AsyncIOScheduler` + `asynccontextmanager` lifespan

### Tertiary (LOW confidence — mark for validation)
- TikTok Content Posting API analytics: Research API requires approval; TikTok `publish_id` has no stats endpoint — based on current developer docs + community reports but TikTok API surface changes frequently
- Facebook `total_video_reactions_by_type_total` metric name — needs validation against current Graph API v25.0 reference

---

## Metadata

**Confidence breakdown:**
- Standard stack (APScheduler, recharts): HIGH — verified via official docs + PyPI
- YouTube analytics: HIGH — verified via official Google Developers docs (field names confirmed)
- Instagram analytics: HIGH — verified via official Meta Developers docs (April 2025 field changes confirmed)
- Facebook analytics: MEDIUM — endpoint pattern confirmed; exact metric names need validation against v25.0 reference
- TikTok analytics: LOW — publish_id limitation confirmed; Research API approval requirement confirmed
- APScheduler MongoDB integration: MEDIUM — constructor pattern confirmed; production multi-process behavior is a known open question

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 for stable parts (APScheduler, YouTube, recharts); 2026-04-28 for Instagram/TikTok (Meta and TikTok APIs change frequently)
