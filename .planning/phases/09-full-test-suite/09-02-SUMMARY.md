---
phase: 09-full-test-suite
plan: 02
subsystem: testing
tags: [pytest, vitest, analytics-fetcher, content-routes, frontend-smoke, ci-hardening]

# Dependency graph
requires:
  - phase: 09-01
    provides: test patterns, conftest.py, analytics_routes.py bugs fixed
  - phase: 08-scheduling-analytics
    provides: analytics_fetcher.py — module under test
  - phase: 07-frontend-channels
    provides: ChannelAnalytics.tsx, ChannelDashboard.tsx — components under test
provides:
  - test_analytics_fetcher.py (18 tests): TikTok always-empty, YouTube full chain, Instagram/Facebook mocked-HTTP
  - test_content_routes_smoke.py (10 tests): voice-previews, progress endpoint, generate, 4x social posting auth enforcement
  - ChannelAnalytics.test.tsx (3 tests): smoke render with recharts mocked
  - ChannelDashboard.smoke.test.tsx (2 tests): smoke render with framer-motion mocked
  - ci.yml (hardened): no || true soft-fails, correct pytest path, SCHEDULER_ENABLED env
affects: [ci-pipeline, phase-10]

# Tech tracking
tech-stack:
  added:
    - vitest@^2.1.0 (frontend test runner)
    - "@testing-library/react@^16.0.0"
    - "@testing-library/jest-dom@^6.4.0"
    - jsdom@^25.0.0
  patterns:
    - "Google SDK stub: stub google + googleapiclient subtree in sys.modules, then import utils.youtube_post_helper explicitly before patching"
    - "Aliased-import patch path: content_routes imports `from utils.redis_client import get_progress as _get_progress` → patch at routes.content_routes._get_progress"
    - "Vitest frontend smoke: mock recharts + framer-motion at module level with vi.mock(); global.fetch mocked with vi.fn()"

key-files:
  created:
    - backend/tests/test_analytics_fetcher.py
    - backend/tests/test_content_routes_smoke.py
    - frontend/src/__tests__/ChannelAnalytics.test.tsx
    - frontend/src/__tests__/ChannelDashboard.smoke.test.tsx
  modified:
    - frontend/package.json
    - frontend/vite.config.ts
    - .github/workflows/ci.yml

key-decisions:
  - "Google SDK stub chain: youtube_post_helper.py has top-level from google.oauth2.credentials import Credentials — must stub google + google.oauth2 + google.auth + googleapiclient subtrees in sys.modules AND explicitly import utils.youtube_post_helper before patch() can traverse utils.youtube_post_helper.*"
  - "Aliased-import Redis patch: content_routes.py uses `from utils.redis_client import get_progress as _get_progress` (alias bound at import time) → patch at routes.content_routes._get_progress not utils.redis_client.get_progress"
  - "Vitest globals:true in vite.config.ts allows describe/it/expect without importing from vitest — simpler test files"
  - "Frontend smoke tests mock recharts in both ChannelAnalytics and ChannelDashboard tests — ChannelDashboard imports ChannelAnalytics which imports recharts"
  - "CI: removed || true from both test jobs; pytest path fixed from app/tests/ to tests/; added SCHEDULER_ENABLED=false to prevent APScheduler from starting in CI; JWT_SECRET_KEY added to ensure auth middleware initialises"

patterns-established:
  - "Google SDK stub pattern: build list of google.* + googleapiclient.* module paths, sys.modules.setdefault() all of them, then explicitly import the helper module to register it in sys.modules before patching"
  - "Content route progress test: patch routes.content_routes._get_progress (the alias) not utils.redis_client.get_progress (the source)"
  - "Frontend smoke test pattern: vi.mock recharts + framer-motion at top of file; global.fetch = vi.fn().mockResolvedValue({ok:true, json: async () => []})"

requirements-completed: [TEST-01, TEST-02, TEST-03]

# Metrics
duration: 49min
completed: 2026-04-15
---

# Phase 09 Plan 02: Full Test Suite — Analytics Fetcher + Content Smoke + Vitest + CI Summary

**28 new tests (18 backend + 10 backend smoke) + 5 frontend smoke tests, pushing suite from 82 to 110 backend tests (103 passing) and establishing Vitest for frontend; CI hardened with no soft-fails**

## Performance

- **Duration:** ~49 min
- **Started:** 2026-04-15T00:57:22Z
- **Completed:** 2026-04-15T01:46:00Z
- **Tasks:** 2
- **Files created/modified:** 8

## Accomplishments

- **test_analytics_fetcher.py (18 tests):** TikTok always-{} (2), YouTube credential resolution + full API chain + error paths (6), Instagram mocked-HTTP success/failure/exception (5), Facebook mocked-HTTP success/failure/exception (5)
- **test_content_routes_smoke.py (10 tests):** voice-previews requires-auth + authenticated, progress endpoint public + no-404, generate missing-fields, 4 social posting auth enforcement (youtube/instagram/facebook/tiktok)
- **ChannelAnalytics.test.tsx (3 tests):** renders without crashing, empty channelId, container not null — recharts mocked
- **ChannelDashboard.smoke.test.tsx (2 tests):** renders without crashing, accepts onOpenPipeline prop — framer-motion + recharts mocked
- **CI hardened:** removed all `|| true` soft-fails, fixed pytest path from `app/tests/` to `tests/`, added `SCHEDULER_ENABLED=false` + `JWT_SECRET_KEY` env vars to backend test job

## Task Commits

1. **Task 1: test_analytics_fetcher.py + test_content_routes_smoke.py** — `012d3d6`
2. **Task 2: Vitest + frontend smoke tests + CI hardening** — `b6d85ec`

## Final Test Counts

| Suite | Before | After | Target |
|-------|--------|-------|--------|
| Backend (collected) | 82 | 110 | 110+ |
| Backend (passing) | 75 | 103 | — |
| Backend (pre-existing fails) | 7 | 7 | unchanged |
| Frontend (vitest) | 5 (existing) | 11 | — |

Success criteria met: 110 backend tests collected (82 wave 1 + 28 wave 2).

## Files Created/Modified

- `backend/tests/test_analytics_fetcher.py` — 18 unit tests for all 4 fetcher functions
- `backend/tests/test_content_routes_smoke.py` — 10 smoke tests for content_routes auth + public endpoints
- `frontend/src/__tests__/ChannelAnalytics.test.tsx` — 3 Vitest smoke tests
- `frontend/src/__tests__/ChannelDashboard.smoke.test.tsx` — 2 Vitest smoke tests
- `frontend/package.json` — vitest + @testing-library/react + jsdom + test script
- `frontend/vite.config.ts` — vitest reference + test.environment=jsdom block
- `.github/workflows/ci.yml` — hardened: no || true, correct paths, CI env vars

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added full Google SDK stub chain before importing analytics_fetcher**
- **Found during:** Task 1 (first run: 6/18 YouTube tests fail with `AttributeError: module 'utils' has no attribute 'youtube_post_helper'`)
- **Issue:** Plan's stub strategy stubbed `googleapiclient` but not the full `google.*` tree. `youtube_post_helper.py` has top-level `from google.oauth2.credentials import Credentials` and `from google.auth.transport.requests import Request`. These fail at import time if not stubbed. Further, `utils.youtube_post_helper` must be explicitly imported after stubbing so that `patch("utils.youtube_post_helper.X")` can traverse `utils → youtube_post_helper`.
- **Fix:** Expanded sys.modules stubs to include `google`, `google.oauth2`, `google.oauth2.credentials`, `google.auth`, `google.auth.transport`, `google.auth.transport.requests` + added `import utils.youtube_post_helper` before patch calls.
- **Files modified:** `backend/tests/test_analytics_fetcher.py`
- **Commit:** 012d3d6

**2. [Rule 3 - Blocking] Patched aliased Redis import at correct module path for progress tests**
- **Found during:** Task 1 (progress endpoint tests fail: `redis.exceptions.ConnectionError: Error 8 connecting to redis:6379`)
- **Issue:** `content_routes.py` uses `from utils.redis_client import get_progress as _get_progress` (alias bound at import time). Patching `utils.redis_client.get_progress` doesn't affect the alias already bound in `content_routes`. Must patch `routes.content_routes._get_progress`.
- **Fix:** Changed patch target from `utils.redis_client.get_progress` to `routes.content_routes._get_progress`.
- **Files modified:** `backend/tests/test_content_routes_smoke.py`
- **Commit:** 012d3d6

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking import/patch issues)
**Impact on plan:** Both fixes were required to unblock test execution. No scope changes.

## Issues Encountered

- **act() warnings in Vitest:** ChannelDashboard and ChannelAnalytics both call `fetch` in `useEffect` → React warns about state updates not wrapped in `act()`. These are warnings only, not failures. Tests pass 11/11. Suppressing would require `waitFor()` wrappers; out of scope for smoke tests.
- **requirements-test.txt `|| true`:** CI still has `|| true` on `pip install requirements-test.txt` install step (not test step). This is acceptable — requirements-test.txt may not exist in early commits. Only the test execution steps were hardened (per plan spec).

## Next Phase Readiness

- 110 total backend tests, 103 passing, 7 pre-existing failures (test_channel_routes + test_model_config_routes — pre-date this phase)
- Frontend Vitest configured: `npm test` runs 11 tests across 4 files, all passing
- CI now fails the build if backend tests fail (no || true) — test suite is a real gating signal

---
*Phase: 09-full-test-suite*
*Completed: 2026-04-15*
