---
phase: 09-full-test-suite
plan: 01
subsystem: testing
tags: [pytest, mongomock, apscheduler, analytics, integrations, scheduler]

# Dependency graph
requires:
  - phase: 08-scheduling-analytics
    provides: analytics_routes.py, integrations_routes.py, scheduler.py — all three modules under test
provides:
  - test_analytics_routes.py (20 tests): GET /analytics/{id}/posts + POST /refresh, TTL logic, all 4 platforms, exception handling
  - test_integrations_routes.py (18 tests): CRUD (save/list/get/delete), test-connection with mocked _TESTERS, OAuth authorize auth guards
  - test_scheduler.py (15 tests): FREQUENCY_CRON mapping, sync_channel, get_scheduler, _upsert_job parameters
affects: [phase-10, future-phases-that-touch-analytics, future-phases-that-touch-integrations]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lazy-import mock path: when fetchers are imported inside function body via `from utils.X import fn`, patch at `utils.X.fn` not `routes.module.fn`"
    - "IntegrationsService fixture: bypass _ensure_connection() DNS lookup by assigning mock_db['collection'] directly to service.collection"
    - "Module-level global test pattern: save original, set mock, test, restore in try/finally — used for _scheduler global in scheduler.py"
    - "_TESTERS dict patching: replace dict entry directly when module-level name patch is insufficient (dict holds function reference, not name binding)"
    - "Timezone normalization: mongomock returns naive datetimes; compare with UTC-aware datetimes by calling .replace(tzinfo=timezone.utc)"

key-files:
  created:
    - backend/tests/test_analytics_routes.py
    - backend/tests/test_integrations_routes.py
    - backend/tests/test_scheduler.py
  modified:
    - backend/app/routes/analytics_routes.py

key-decisions:
  - "Fetcher mock path: `utils.analytics_fetcher.fetch_*_stats` (not `routes.analytics_routes.fetch_*`) — fetchers are lazy-imported inside function body, so they live in the fetcher module namespace at patch time"
  - "analytics_routes.py route signature fix: `user_id: str = CurrentUser` → `user_id: CurrentUser` — the = was treating the Depends annotation as a default value, making user_id a query param and breaking auth"
  - "Timezone normalization added to analytics_routes.py stale-check: mongomock stores datetimes as naive UTC; comparisons against timezone.utc-aware stale_threshold would raise TypeError"
  - "Fetcher try/except added to analytics_routes.py refresh loop: production fetchers catch internally but tests may patch to raise; non-fatal guard needed"
  - "_TESTERS dict patching pattern: test_connection route uses `_TESTERS.get(platform)` which holds original function reference; patch the dict key not the module name"

patterns-established:
  - "IntegrationsService test pattern: autouse fixture assigns mock_db[collection] to service.collection before test, resets to None after"
  - "Scheduler test pattern: import sched_mod directly, manipulate _scheduler global with try/finally, no AsyncIOScheduler.start()"

requirements-completed: [TEST-01, TEST-02]

# Metrics
duration: 35min
completed: 2026-04-15
---

# Phase 09 Plan 01: Full Test Suite — Analytics, Integrations, Scheduler Summary

**53 new pytest tests across 3 modules (analytics_routes, integrations_routes, scheduler) pushing suite from 29 to 82 tests, with 3 analytics_routes.py bugs fixed as part of test authoring**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-04-15T00:04:00Z
- **Completed:** 2026-04-15T00:39:25Z
- **Tasks:** 3
- **Files modified:** 4 (3 new test files + 1 route fix)

## Accomplishments
- 20 analytics route tests: empty/seeded list, auth enforcement, newest-first sort, all 4 platforms (yt/ig/fb/tiktok), TTL fresh/stale logic, exception non-fatal, DB updates verified
- 18 integrations route tests: full CRUD with auth guards, delete doc removal, test-connection with _TESTERS dict patching, OAuth authorize auth checks
- 15 scheduler unit tests: FREQUENCY_CRON data, sync_channel add/remove/exception-swallow, get_scheduler raise/return, _upsert_job parameter assertions (id, replace_existing, coalesce, misfire_grace)
- Fixed 3 pre-existing bugs in analytics_routes.py discovered during test authoring

## Task Commits

1. **Task 1: test_analytics_routes.py** — `a2e7ac5` (feat + 3 bug fixes in analytics_routes.py)
2. **Task 2: test_integrations_routes.py** — `af0f4cd` (feat)
3. **Task 3: test_scheduler.py** — `f309540` (feat)

## Files Created/Modified
- `backend/tests/test_analytics_routes.py` — 20 tests for GET /analytics/{id}/posts and POST /refresh
- `backend/tests/test_integrations_routes.py` — 18 tests for integrations CRUD + OAuth stubs
- `backend/tests/test_scheduler.py` — 15 unit tests for scheduler logic
- `backend/app/routes/analytics_routes.py` — 3 bug fixes (route signature, timezone, exception guard)

## Decisions Made
- Fetcher mock path: `utils.analytics_fetcher.fetch_*` not `routes.analytics_routes.fetch_*` — lazy imports mean the names only exist in the fetcher module at patch time
- IntegrationsService bypassed via autouse fixture that directly wires `mock_db["integrations"]` to `service.collection` — avoids `_ensure_connection()` DNS lookup
- _TESTERS dict patching: replace dict entry not module name because `test_connection` route resolves via `_TESTERS.get(platform)` which holds the original function object

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `user_id: str = CurrentUser` → `user_id: CurrentUser` in both analytics routes**
- **Found during:** Task 1 (test_analytics_routes.py — first run all 20 failed with 422 validation error)
- **Issue:** Both `list_channel_posts` and `refresh_channel_stats` declared `user_id: str = CurrentUser`. FastAPI treated `user_id` as an optional query parameter with `CurrentUser` as its default value, not as a Depends() injection. This caused FastAPI to attempt to serialize `CurrentUser` (the type alias `Annotated[str, Depends(...)]`) as a query parameter schema, producing a 422 on every request and breaking auth enforcement.
- **Fix:** Changed `user_id: str = CurrentUser` → `user_id: CurrentUser` in both function signatures
- **Files modified:** `backend/app/routes/analytics_routes.py`
- **Verification:** All 20 analytics tests pass including 7 auth-enforcement tests that verify 401 without header
- **Committed in:** a2e7ac5 (Task 1 commit)

**2. [Rule 1 - Bug] Added timezone normalization for `last_fetched_at` comparison in refresh loop**
- **Found during:** Task 1 (TTL tests — `test_refresh_respects_ttl`, `test_refresh_stale_post_refetches`, `test_refresh_mixed_stale_fresh_only_stale_refetched` all failed with `TypeError: can't compare offset-naive and offset-aware datetimes`)
- **Issue:** mongomock returns stored datetimes as timezone-naive. The route's `stale_threshold` is `datetime.now(timezone.utc) - timedelta(seconds=STATS_TTL_SECONDS)` which is UTC-aware. Comparing naive < aware raises TypeError.
- **Fix:** Added `if last_fetched.tzinfo is None: last_fetched = last_fetched.replace(tzinfo=timezone.utc)` before the stale check
- **Files modified:** `backend/app/routes/analytics_routes.py`
- **Verification:** All 3 TTL tests pass
- **Committed in:** a2e7ac5 (Task 1 commit)

**3. [Rule 2 - Missing Critical] Added try/except around fetcher call in refresh loop**
- **Found during:** Task 1 (`test_refresh_fetcher_exception_is_non_fatal` — patched fetcher to raise Exception, got 500)
- **Issue:** `fetcher(user_id, platform_video_id)` had no exception guard. Production `analytics_fetcher.py` functions always catch internally (return `{}`), but the test patches to raise directly. A raised exception propagated out of the loop, causing a 500 response. The plan spec says "non-fatal" but the code didn't implement that guard.
- **Fix:** Wrapped fetcher call in try/except, logs warning, sets `new_stats = {}` on exception
- **Files modified:** `backend/app/routes/analytics_routes.py`
- **Verification:** `test_refresh_fetcher_exception_is_non_fatal` returns 200
- **Committed in:** a2e7ac5 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bugs, 1 Rule 2 missing critical)
**Impact on plan:** All 3 fixes were blocking for test correctness and fix real bugs in production code. No scope creep.

## Issues Encountered
- Lazy-import mock path discovery: analytics_routes.py imports fetchers inside the route function body (`from utils.analytics_fetcher import ...`). Plan spec said to patch at `routes.analytics_routes.fetch_youtube_stats` — this path doesn't exist (names are local to the function). Fixed by patching `utils.analytics_fetcher.fetch_youtube_stats` instead.
- `_TESTERS` dict: `test_connection` route calls `_TESTERS.get(platform)` which holds the original function reference set at import time. Patching the module-level name `routes.integrations_routes.test_youtube_credentials` doesn't affect the dict. Fixed by directly replacing `_ir._TESTERS["youtube"]` in tests with try/finally cleanup.

## Next Phase Readiness
- 82 total tests (75 passing, 7 pre-existing failures in channel_routes + model_config_routes unrelated to this plan)
- analytics_routes.py bugs fixed — production TTL logic now handles mongomock-style naive datetimes and guards fetcher exceptions
- All 3 new test files are independent and runnable in isolation
- Pre-existing 7 failures are in test_channel_routes.py and test_model_config_routes.py — pre-date this plan, not introduced here

---
*Phase: 09-full-test-suite*
*Completed: 2026-04-15*
