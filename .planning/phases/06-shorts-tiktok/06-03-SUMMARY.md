---
phase: 06-shorts-tiktok
plan: "03"
subsystem: tiktok-posting
tags: [tiktok, content-posting, token-refresh, pull-from-url, file-upload, unit-tests]
dependency_graph:
  requires: [06-02-tiktok-oauth]
  provides: [post-video-to-tiktok, tiktok-post-helper]
  affects: [content-routes, tiktok-integration-loop]
tech_stack:
  added: []
  patterns: [PULL_FROM_URL-with-FILE_UPLOAD-fallback, chunked-PUT-upload, token-refresh-60min-window, poll-until-complete]
key_files:
  created:
    - backend/app/utils/tiktok_post_helper.py
    - backend/app/tests/test_tiktok_helper.py
    - backend/app/tests/conftest.py
  modified:
    - backend/app/routes/content_routes.py
decisions:
  - "PULL_FROM_URL attempted first for URL inputs; FILE_UPLOAD fallback triggered on domain_not_verified or local file path"
  - "Token refresh window is >60 minutes remaining — if within 60 min, refresh before posting"
  - "Privacy level defaults to SELF_ONLY (safe for unaudited TikTok apps); PUBLIC_TO_EVERYONE used only if creator_info confirms it"
  - "Status poll returns PROCESSING (success=True) after 2 min timeout — post is in-flight, not failed"
  - "app/tests/conftest.py created as Rule 3 deviation — required for pytest to find utils.* imports without the backend/tests/ conftest"
metrics:
  duration: "~3 minutes"
  completed: "2026-04-14"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
---

# Phase 06 Plan 03: TikTok Post Helper Summary

TikTok Content Posting API v2 integration — tiktok_post_helper.py with token refresh + PULL_FROM_URL + FILE_UPLOAD fallback, POST /post-to-tiktok route in content_routes.py, and 7 unit tests all passing.

## What Was Built

### Task 1: `backend/app/utils/tiktok_post_helper.py`

8-function module that closes the TikTok integration loop (Plan 02 stores tokens; Plan 03 uses them):

1. `_resolve_tiktok_credentials(user_id)` — fetches TikTok credentials from `integrations_service.get_integration(user_id, "tiktok", decrypt=True)`; validates `accessToken` and `openId` presence; returns failure dict if not configured.

2. `_refresh_if_needed(creds, user_id)` — checks `tokenExpiresAt - time.time()`. If > 3600s, returns creds unchanged. Otherwise POSTs to `TIKTOK_TOKEN_URL` with `grant_type=refresh_token`, updates `accessToken`/`refreshToken`/`tokenExpiresAt`, persists via `integrations_service.save_integration`. Best-effort: returns original creds on failure (doesn't abort post attempt).

3. `_get_allowed_privacy_level(access_token, open_id)` — queries `TIKTOK_CREATOR_INFO_URL`; returns `"PUBLIC_TO_EVERYONE"` if supported, otherwise `"SELF_ONLY"` (safe default).

4. `_post_pull_from_url(access_token, open_id, video_url, title, caption)` — POSTs to `TIKTOK_POST_INIT_URL` with `source: "PULL_FROM_URL"`; raises `ValueError("domain_not_verified")` on domain errors; returns `publish_id`.

5. `_upload_file_chunks(upload_url, file_path)` — reads 10MB chunks, sends PUT with `Content-Range` headers.

6. `_post_file_upload(access_token, open_id, file_path, title, caption)` — POSTs `FILE_UPLOAD` init with `video_size/chunk_size/total_chunk_count`, then calls `_upload_file_chunks`; returns `publish_id`.

7. `_poll_publish_status(access_token, publish_id)` — polls up to 24 times (5s intervals = 2 min); returns `{"success": True, "status": "PUBLISH_COMPLETE"}` on completion; raises `Exception(fail_reason)` on FAILED; returns `{"success": True, "status": "PROCESSING"}` on timeout (non-fatal).

8. `post_video_to_tiktok(file_path, caption, title, user_id)` — public entry point: resolve → refresh → PULL_FROM_URL (if URL) → FILE_UPLOAD fallback (if local path or domain error) → poll.

### Task 2: Route + Tests

**`backend/app/routes/content_routes.py`** — added `from utils.tiktok_post_helper import post_video_to_tiktok` import (line 44) and `POST /post-to-tiktok` route (line 2730) following the exact same pattern as `POST /post-to-youtube`: `_resolve_video_to_local_path` → call helper in try/finally → `_cleanup_temp`.

**`backend/app/tests/test_tiktok_helper.py`** — 7 unit tests:
1. `test_resolve_credentials_no_integration` — None integration → success=False
2. `test_resolve_credentials_missing_keys` — missing accessToken/openId → success=False
3. `test_refresh_not_needed` — tokenExpiresAt+7200s → requests.post NOT called
4. `test_refresh_needed` — tokenExpiresAt+30s → refresh URL called with grant_type=refresh_token
5. `test_pull_from_url_success` — mocked init+status → success=True, publish_id="tt_abc123"
6. `test_pull_from_url_domain_not_verified_fallback` — local file → FILE_UPLOAD init called
7. `test_poll_status_failed` — status=FAILED → Exception("video_too_long")

## Verification

All plan verification checks passed:

```
1. ast.parse tiktok_post_helper.py → "OK" ✓
2. ast.parse content_routes.py → "OK" ✓
3. grep post-to-tiktok content_routes.py → line 2730 ✓
4. pytest app/tests/test_tiktok_helper.py -v → 7 passed ✓
5. grep key functions tiktok_post_helper.py → all present ✓
6. pytest tests/ → 29 passed, zero regressions ✓
```

## Commits

| Hash | Message |
|------|---------|
| 5141267 | feat(06-03): create tiktok_post_helper.py with token refresh + PULL_FROM_URL + FILE_UPLOAD fallback |
| df61d32 | feat(06-03): add POST /post-to-tiktok route and unit tests |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created app/tests/conftest.py**
- **Found during:** Task 2 test authoring
- **Issue:** `backend/app/tests/` had no conftest.py; `backend/tests/conftest.py` sets up `sys.path` for `backend/tests/` only; running `python -m pytest app/tests/test_tiktok_helper.py` from `backend/` would fail on `import utils.*` without path setup
- **Fix:** Created minimal `app/tests/conftest.py` with `sys.path.insert` and env stubs
- **Files modified:** `backend/app/tests/conftest.py` (new)
- **Commit:** df61d32

## Self-Check: PASSED

- `backend/app/utils/tiktok_post_helper.py` — exists, 8 functions confirmed
- `backend/app/routes/content_routes.py` — post-to-tiktok on line 2730, import on line 44
- `backend/app/tests/test_tiktok_helper.py` — exists, 7 tests pass
- Commits 5141267 and df61d32 — present in git log
- Python syntax: both files ast.parse confirmed
- Full suite: 29 passed, zero regressions
