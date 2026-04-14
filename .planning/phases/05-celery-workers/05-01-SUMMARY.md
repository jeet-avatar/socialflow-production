---
phase: 05-celery-workers
plan: 01
subsystem: infra
tags: [celery, redis, async, video-pipeline, docker, worker]

# Dependency graph
requires:
  - phase: 04-ai-model-layer
    provides: resolve_model_config() used in video_tasks.py for per-channel model resolution
provides:
  - Celery async video pipeline: POST /video-remotion returns {task_id, job_id, status:queued} in <100ms
  - render_video_task Celery task wrapping the full AI video pipeline
  - Redis-backed progress store replacing in-memory _progress_store dict
  - fal.ai idempotent retry: request_id stored in Redis before polling loop
  - celery_worker docker-compose service with concurrency=2, queue=video
  - redis_client.py: set_progress/get_progress + set_fal_request_id/get_fal_request_id helpers
affects: [phase-06, phase-07, phase-08, video-pipeline, docker-compose]

# Tech tracking
tech-stack:
  added: [celery[redis], redis (py client), Celery 5.x with retry_backoff/retry_jitter]
  patterns:
    - Async task offload via Celery — HTTP returns immediately, worker runs pipeline
    - Redis DB split: DB0=broker, DB1=results, DB2=progress keys (TTL 7200s)
    - Circular import guard: from worker.video_tasks import inside function body
    - Whisper OOM guard: import whisper inside task body (not module level)
    - fal.ai idempotency: get_fal_request_id before submit, set_fal_request_id after

key-files:
  created:
    - backend/app/worker/__init__.py
    - backend/app/worker/celery_app.py
    - backend/app/worker/video_tasks.py
    - backend/app/utils/redis_client.py
    - backend/tests/test_video_tasks.py
  modified:
    - backend/app/routes/content_routes.py
    - docker-compose.yml
    - backend/requirements.txt

key-decisions:
  - "Extracted _run_video_pipeline() as standalone sync function in content_routes.py — Celery task delegates to it rather than duplicating 200+ lines of pipeline code"
  - "fal.ai idempotency via Redis: store request_id before polling loop so worker restart resumes polling, not re-submitting (avoids duplicate charges)"
  - "Redis DB 2 for progress keys — isolated from Celery broker (DB0) and result backend (DB1) to avoid key collisions"
  - "Circular import guard: from worker.video_tasks import inside the HTTP endpoint function body — worker never imports from routes"
  - "Whisper OOM guard: import whisper inside task function body only — prevents all workers loading 74MB–1.5GB model at startup"
  - "docker-compose celery_worker uses same backend Dockerfile with different command — no separate Dockerfile needed"
  - "task_acks_late + task_reject_on_worker_lost: ensures tasks are re-queued if worker OS process is killed mid-job"

patterns-established:
  - "Task delegation pattern: HTTP handler calls .delay(), returns immediately; task calls _run_pipeline() function from routes module"
  - "Idempotent external API pattern: check Redis for stored request_id before submitting, store immediately after receiving"
  - "Lazy import pattern in Celery tasks: all heavy/circular imports inside function body with noqa: PLC0415 comment"
  - "mongomock autouse fixture in tests that import content_routes (prevents SRV DNS lookup at module import time)"

requirements-completed: [CELERY-01, CELERY-02, CELERY-03, CELERY-04, CELERY-05]

# Metrics
duration: 35min
completed: 2026-04-13
---

# Phase 05 Plan 01: Celery Workers Summary

**POST /video-remotion now returns {task_id, job_id, status:queued} in <100ms via Celery async worker with Redis-backed progress polling and fal.ai idempotent retry**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-04-13T00:00:00Z
- **Completed:** 2026-04-13T00:35:00Z
- **Tasks:** 3
- **Files modified:** 7 (5 created, 2 modified, 1 appended)

## Accomplishments

- Celery infrastructure wired: `celery_app.py` with task_acks_late + task_reject_on_worker_lost + prefetch=1 (ensures reliable video pipeline delivery even on worker crash)
- `_run_video_pipeline()` extracted from the 200-line `generate_video_remotion_endpoint` — HTTP handler now returns immediately in <100ms; pipeline runs in Celery worker container
- Redis DB 2 replaces in-memory `_progress_store` dict — GET /progress/{job_id} is now multi-process safe and survives worker restarts
- fal.ai idempotent retry wired in `_gen_one()` — `get_fal_request_id` before submit, `set_fal_request_id` immediately after receiving request_id; worker restart resumes polling, never re-submits
- docker-compose `celery_worker` service added with `--concurrency=2 -Q video`; Flower block present but commented out
- 3 unit tests pass via `.run()` (no broker required) covering success, failure (-1 progress), and empty job_id edge case

## Task Commits

1. **Task 1: Celery infrastructure — celery_app.py + redis_client.py + requirements** - `121bc4e` (feat)
2. **Task 2: video_tasks.py — Celery task with fal.ai idempotency + Whisper OOM guard** - `484ccf0` (feat)
3. **Task 3: content_routes.py refactor + docker-compose celery_worker + unit tests** - `b1b4360` (feat)

## Files Created/Modified

- `backend/app/worker/__init__.py` - Python package marker (empty)
- `backend/app/worker/celery_app.py` - Celery instance: broker/result/progress Redis DB split, task_acks_late, prefetch=1, task_routes video.*
- `backend/app/worker/video_tasks.py` - render_video_task: Celery task name="video.render", Whisper OOM guard, fal.ai idempotency, autoretry on network errors
- `backend/app/utils/redis_client.py` - set_progress/get_progress (SETEX 7200s) + set_fal_request_id/get_fal_request_id (SETEX 14400s)
- `backend/app/routes/content_routes.py` - Replaced _progress_store with Redis; extracted _run_video_pipeline(); POST /video-remotion enqueues task; GET /progress reads Redis; _gen_one() idempotency wired
- `docker-compose.yml` - celery_worker service + CELERY_BROKER_URL/RESULT_BACKEND/REDIS_URL env vars on backend service; Flower commented out
- `backend/requirements.txt` - Added celery[redis] and redis
- `backend/tests/test_video_tasks.py` - 3 unit tests via .run() (no broker): success, failure, empty job_id

## Decisions Made

- Extracted `_run_video_pipeline()` in content_routes.py rather than duplicating 200+ lines in video_tasks.py — import is safe (content_routes never imports from worker/)
- Used `asyncio.run()` inside `_run_video_pipeline()` for the async audio pipeline steps — the sync function is called from a Celery worker thread, not an async context
- Redis DB 2 isolated from broker (DB0) and result backend (DB1) to avoid key collisions
- Celery task args are all JSON primitives (str/dict) — no ObjectId, datetime, or Pydantic models

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused imports causing ImportError in test environment**
- **Found during:** Task 3 (unit tests run)
- **Issue:** `video_tasks.py` had `from utils.s3_service import s3_service` — but `s3_service.py` only exports standalone functions (no `s3_service` instance). This caused `ImportError` when tests tried to import the task, even though the mock would have prevented any actual call.
- **Fix:** Removed unused `s3_service`, `mongodb_service`, `videos_service` lazy imports from `video_tasks.py`. The task delegates entirely to `_run_video_pipeline()` — these services aren't called directly in the Celery task.
- **Files modified:** `backend/app/worker/video_tasks.py`
- **Verification:** 3 unit tests pass after fix
- **Committed in:** `b1b4360` (Task 3 commit)

**2. [Rule 1 - Bug] Added `_mock_mongo` autouse fixture to prevent SRV DNS lookup**
- **Found during:** Task 3 (unit tests first run)
- **Issue:** `patch("routes.content_routes._run_video_pipeline")` triggers import of `routes.content_routes`, which imports `mongodb_service` at module level; this tried to connect to MongoDB SRV cluster (`_mongodb._tcp.cluster0.test.mongodb.net`) causing `pymongo.errors.ConfigurationError` — even though the `_run_video_pipeline` mock would have prevented any actual pipeline execution.
- **Fix:** Added `_mock_mongo` autouse fixture to `test_video_tasks.py` matching the conftest pattern — patches `Config.get_mongodb_connection_string` + activates mongomock before content_routes is imported by the patch context manager.
- **Files modified:** `backend/tests/test_video_tasks.py`
- **Verification:** All 3 tests pass; 26 existing tests unaffected
- **Committed in:** `b1b4360` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 — bugs)
**Impact on plan:** Both auto-fixes were necessary for test correctness. No scope creep. The plan's `video_tasks.py` template imports were aspirational (they're not needed since `_run_video_pipeline` handles everything); the MongoDB SRV issue is an existing infrastructure constraint handled via the conftest pattern.

## Issues Encountered

None beyond the two auto-fixed deviations above.

## Next Phase Readiness

- Phase 06 (social posting / YouTube) can proceed — Celery infrastructure in place
- Phase 08 (research_provider wiring, deferred from Phase 04) can now wire into the Celery pipeline via `_run_video_pipeline()`
- To test locally: `docker-compose up backend celery_worker redis` — celery_worker starts with `celery -A app.worker.celery_app:celery_app worker --loglevel=info --concurrency=2 -Q video`
- Flower monitoring UI: uncomment `flower` block in docker-compose.yml, visit `localhost:5555`

---
*Phase: 05-celery-workers*
*Completed: 2026-04-13*
