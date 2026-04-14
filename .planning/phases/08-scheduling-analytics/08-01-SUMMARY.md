---
phase: 08-scheduling-analytics
plan: 01
subsystem: backend-scheduler
tags: [apscheduler, cron, automation, channel-pipeline, analytics-router]
dependency_graph:
  requires: []
  provides: [scheduler.py, sync_channel, scheduler_lifespan, analytics_router_registered]
  affects: [channel_routes.py, main.py, requirements.txt]
tech_stack:
  added: [APScheduler==3.11.*]
  patterns: [MongoDBJobStore persistence, asynccontextmanager lifespan, deferred imports for circular-import guard, niche-to-dialogue generation before task dispatch]
key_files:
  created:
    - backend/app/worker/scheduler.py
  modified:
    - backend/app/routes/channel_routes.py
    - backend/app/main.py
    - backend/app/requirements.txt
decisions:
  - APScheduler MongoDBJobStore persists jobs in apscheduler_jobs collection — jobs survive restarts
  - All imports inside _run_channel_pipeline body to avoid circular imports at module load
  - generate_marketing_package called BEFORE render_video_task.delay — prevents "dialogue is required" silent failures
  - misfire_grace_time=3600 — missed fires re-run up to 1h late instead of being dropped
  - SCHEDULER_ENABLED env var disables scheduler on non-primary ECS tasks (multi-process safety)
  - sync_channel no-ops when _scheduler is None (SCHEDULER_ENABLED=false path)
  - analytics_router registered in main.py now so Plan 08-02 routes are reachable after that plan runs
metrics:
  duration: 2 minutes
  completed: 2026-04-14
  tasks_completed: 2
  files_changed: 4
---

# Phase 08 Plan 01: APScheduler Per-Channel Cron Scheduling + Analytics Router Registration Summary

**One-liner:** APScheduler with MongoDBJobStore fires per-channel cron jobs that generate dialogue via generate_marketing_package() before dispatching render_video_task, with dynamic job sync on channel PUT and analytics_router registered for Plan 08-02.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create scheduler.py with APScheduler lifespan, sync_channel, and cron job dispatcher | b3399bd | backend/app/worker/scheduler.py, backend/app/requirements.txt |
| 2 | Wire sync_channel into channel_routes.py, scheduler_lifespan into main.py, register analytics_router | 18f7196 | backend/app/routes/channel_routes.py, backend/app/main.py |

## What Was Built

### scheduler.py (new file)

- `scheduler_lifespan()` — asynccontextmanager that starts APScheduler with MongoDBJobStore on entry, calls `_load_active_channels()` to re-register all auto_post=True channels, and shuts down gracefully on exit
- `sync_channel(channel_id, auto_post, posting_frequency)` — called by channel_routes.py after every successful PUT; adds/replaces or removes the cron job atomically; no-ops if `_scheduler is None` (SCHEDULER_ENABLED=false path)
- `_run_channel_pipeline(channel_id)` — the cron callback:
  1. Loads channel from MongoDB; skips if auto_post=False at fire time
  2. Calls `generate_marketing_package(niche_prompt, user_id, sender_mode="company", target_duration="short")` to produce `video_dialogue`
  3. Returns early with error log if `video_dialogue` is empty (prevents silent Celery failure)
  4. Dispatches `render_video_task.delay(user_id, job_id, body={"channel_id", "dialogue", "niche"})`
- `FREQUENCY_CRON` maps daily/3x_week/weekly to CronTrigger kwargs (9am UTC)
- `misfire_grace_time=3600` — fires up to 1h late if backend was down
- All heavy imports inside function bodies (circular import guard)

### channel_routes.py changes

- Added `from worker.scheduler import sync_channel` import
- `update_channel()`: added `find_one` before `update_one` to capture existing document state; calls `sync_channel(channel_id, effective_auto_post, effective_frequency)` with merged field values before returning `{"success": True}`

### main.py changes

- Imported `scheduler_lifespan as _scheduler_lifespan` and `analytics_router` from routes.analytics_routes
- `startup_event()`: starts APScheduler after MongoDB init via `app.state.scheduler_ctx = _scheduler_lifespan(); await app.state.scheduler_ctx.__aenter__()`; APScheduler failure is non-fatal (logged as warning)
- Added `shutdown_event()`: calls `app.state.scheduler_ctx.__aexit__(None, None, None)` for clean shutdown
- Registered `analytics_router` with `app.include_router(analytics_router)`

### requirements.txt

- Added `APScheduler==3.11.*`

## Decisions Made

- **MongoDBJobStore over MemoryJobStore** — jobs survive ECS container restarts; persisted in `apscheduler_jobs` collection in the same MongoDB instance
- **Deferred imports in _run_channel_pipeline** — `render_video_task`, `generate_marketing_package`, `mongodb_service`, `ObjectId` all imported inside the function body following the same pattern as `video_tasks.py`'s whisper import guard
- **Niche-to-dialogue mandatory** — `_run_video_pipeline` (content_routes.py:2229) returns `{"error": "dialogue is required"}` immediately without dialogue. Generating it in the scheduler before dispatch ensures every automated cron fire has a valid body
- **SCHEDULER_ENABLED env var** — APScheduler should only run on one ECS task in multi-process deployments (Phase 10 sets it to false on secondary tasks)
- **analytics_router registered in Plan 08-01** — the import will fail at app start until analytics_routes.py is created by Plan 08-02. This is the accepted ordering: Plan 08-02 must run before the app is deployed

## Deviations from Plan

None — plan executed exactly as written.

## Verification Checklist

- [x] `python3 -c "from worker.scheduler import scheduler_lifespan, sync_channel, get_scheduler; print('scheduler import OK')"` — passes
- [x] `python3 -m py_compile worker/scheduler.py` — OK
- [x] `python3 -m py_compile routes/channel_routes.py` — OK
- [x] `python3 -m py_compile main.py` — OK
- [x] `grep "APScheduler" requirements.txt` — `APScheduler==3.11.*` found
- [x] `grep "^from worker.video_tasks\|^from utils.personalised_message" worker/scheduler.py` returns nothing (no module-level imports)
- [x] `grep "\"dialogue\": dialogue" worker/scheduler.py` — key present in render body
- [x] `grep "sync_channel\|existing_doc\|effective_auto_post" routes/channel_routes.py` — all wired
- [x] `grep "scheduler_lifespan\|scheduler_ctx\|shutdown_event\|analytics_router" main.py` — all wired

## Self-Check: PASSED

Files confirmed:
- `backend/app/worker/scheduler.py` — FOUND (commit b3399bd)
- `backend/app/routes/channel_routes.py` — FOUND (commit 18f7196)
- `backend/app/main.py` — FOUND (commit 18f7196)
- `backend/app/requirements.txt` — FOUND (commit b3399bd)
