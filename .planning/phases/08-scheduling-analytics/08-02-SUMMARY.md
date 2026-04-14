---
phase: 08-scheduling-analytics
plan: 02
subsystem: backend-analytics
tags: [analytics, platform-posts, youtube, instagram, facebook, tiktok, mongodb]
dependency_graph:
  requires: [08-01]
  provides: [analytics_fetcher.py, analytics_routes.py, platform_posts_collection, platform_posts_inserts]
  affects: [content_routes.py, db_init.py, main.py]
tech_stack:
  added: []
  patterns: [lazy imports inside function bodies, try/except non-fatal analytics insert, 1-hour TTL cache, project-standard auth_middleware.verify_token pattern]
key_files:
  created:
    - backend/app/utils/analytics_fetcher.py
    - backend/app/routes/analytics_routes.py
  modified:
    - backend/app/utils/db_init.py
    - backend/app/routes/content_routes.py
decisions:
  - Instagram uses views metric (not impressions — deprecated April 21, 2025)
  - fetch_tiktok_stats always returns {} — TikTok publish_id is lifecycle ID, not video ID; no public stats API
  - All platform_posts inserts wrapped in try/except — analytics failures must never break publish response
  - STATS_TTL_SECONDS=3600 — refresh endpoint skips posts fetched within last 1 hour
  - analytics_fetcher.py lazy imports (all inside function bodies) — same pattern as video_tasks.py
  - analytics_routes.py registered in main.py during Plan 08-01 — no main.py changes needed here
metrics:
  duration: 2 minutes
  completed: 2026-04-14
  tasks_completed: 3
  files_changed: 4
---

# Phase 08 Plan 02: Cross-Platform Analytics Backend Summary

**One-liner:** platform_posts MongoDB collection tracks video IDs per-platform; analytics_fetcher.py pulls stats from YouTube/Instagram/Facebook APIs (TikTok N/A); analytics_routes.py exposes GET/POST endpoints; all four posting routes in content_routes.py insert records on successful publish.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create analytics_fetcher.py with per-platform stats functions and add platform_posts collection to db_init.py | ca6b48d | backend/app/utils/analytics_fetcher.py, backend/app/utils/db_init.py |
| 2 | Create analytics_routes.py with GET /posts and POST /refresh | a193481 | backend/app/routes/analytics_routes.py |
| 3 | Wire platform_posts inserts into all four posting routes in content_routes.py | 31701b5 | backend/app/routes/content_routes.py |

## What Was Built

### analytics_fetcher.py (new file)

- `fetch_youtube_stats(user_id, video_id)` — calls YouTube Data API v3 `videos().list(part="statistics")`, reuses `_resolve_yt_credentials` and `_build_yt_oauth_creds` from `youtube_post_helper.py`
- `fetch_instagram_stats(user_id, media_id)` — calls Instagram Graph API v25.0 `/{media_id}/insights`, uses `views` metric (not deprecated `impressions`)
- `fetch_facebook_stats(user_id, video_id)` — calls Facebook Graph API v25.0 `/{video_id}/video_insights`, returns `total_video_views` only (likes/comments = 0, not available via this endpoint)
- `fetch_tiktok_stats(user_id, publish_id)` — always returns `{}` with docstring explaining that TikTok `publish_id` is a lifecycle ID, not a video ID; Research API requires academic approval
- All imports are lazy (inside function bodies) — avoids circular imports and heavy SDK loads at module startup

### analytics_routes.py (new file)

- `GET /analytics/{channel_id}/posts` — returns all `platform_posts` for channel sorted newest-first (limit 100); stats are cached values (may be 0 until first refresh)
- `POST /analytics/{channel_id}/refresh` — re-fetches stats from platform APIs for stale posts (TTL 1 hour); returns `{"refreshed": int, "skipped": int}` summary; always updates `last_fetched_at` even if platform returns empty stats
- Auth: project-standard `get_current_user` dependency with `auth_middleware.verify_token(authorization)` — same pattern as `channel_routes.py:25-36`
- Router prefix `/analytics`, tags `["analytics"]` — registered in `main.py` by Plan 08-01

### db_init.py changes

Added `platform_posts` collection with 4 indexes:
- `pp_channel_id` — by `channel_id` (for GET /posts query)
- `pp_user_id` — by `user_id` (for ownership filtering)
- `pp_channel_platform` — compound `(channel_id, platform)` (for platform-specific queries)
- `pp_posted_at` — by `posted_at` descending (for sort performance)

### content_routes.py changes

4 `platform_posts` insert_one calls added after each successful publish:
- **YouTube** (`post_video_to_youtube_route`): inserts with `result["video_id"]` as `platform_video_id`, after try/finally cleanup block
- **Instagram** (`post_video_to_instagram_route`): inserts with `result["media_id"]` as `platform_video_id`, after try/finally cleanup block
- **Facebook** (`post_video_to_facebook`): inserts with `result["video_id"]` as `platform_video_id`, after `_cleanup_temp` call
- **TikTok** (`post_video_to_tiktok_route`): inserts with `result["publish_id"]` as `platform_video_id`, after try/finally cleanup block

All inserts:
- Wrapped in `try/except` with `logger.warning` — publish response is never broken by analytics failure
- Only fire when `result.get("success")` is truthy AND platform video ID is present AND `channel_id` is non-empty
- Use lazy imports (`from datetime import datetime, timezone` and `from utils.mongodb_service import mongodb_service as _mdb`) inside the try block

## Decisions Made

- **`views` not `impressions` for Instagram** — `impressions` deprecated April 21, 2025 per Meta developer changelog; `views` is the correct v25.0 metric
- **TikTok N/A by design** — `publish_id` from TikTok Content Posting API is a status lifecycle ID, not a retrievable video ID for stats. No workaround available without Research API academic approval
- **Non-fatal analytics inserts** — wrapping platform_posts inserts in try/except ensures that a MongoDB connectivity issue or schema error never fails a successful video publish
- **1-hour TTL cache** — prevents rate limit exhaustion on YouTube (10K units/day) and Instagram (200/hr/token); refresh endpoint skips posts fetched within the last hour
- **Lazy imports in analytics_fetcher.py** — same pattern as video_tasks.py whisper import guard; prevents circular imports and avoids loading googleapiclient at module startup

## Deviations from Plan

None — plan executed exactly as written.

## Verification Checklist

- [x] `python3 -m py_compile utils/analytics_fetcher.py` — OK
- [x] `python3 -m py_compile routes/analytics_routes.py` — OK
- [x] `python3 -m py_compile utils/db_init.py` — OK
- [x] `python3 -m py_compile routes/content_routes.py` — OK
- [x] All 4 fetch functions exist: `fetch_youtube_stats`, `fetch_instagram_stats`, `fetch_facebook_stats`, `fetch_tiktok_stats`
- [x] `@router.get("/{channel_id}/posts")` and `@router.post("/{channel_id}/refresh")` confirmed in analytics_routes.py
- [x] `platform_posts` collection with 4 indexes in db_init.py
- [x] No forbidden auth pattern in analytics_routes.py (`get_current_user_id`, `x_user_id`, try/except import fallback)
- [x] `auth_middleware.verify_token` used in analytics_routes.py `get_current_user`
- [x] Exactly 4 `platform_posts.insert_one` calls in content_routes.py
- [x] 4 non-fatal `platform_posts insert failed` guards
- [x] No module-level imports in analytics_fetcher.py (only `import logging`)

## Self-Check: PASSED

Files confirmed:
- `backend/app/utils/analytics_fetcher.py` — FOUND (commit ca6b48d)
- `backend/app/routes/analytics_routes.py` — FOUND (commit a193481)
- `backend/app/utils/db_init.py` — FOUND (commit ca6b48d)
- `backend/app/routes/content_routes.py` — FOUND (commit 31701b5)
