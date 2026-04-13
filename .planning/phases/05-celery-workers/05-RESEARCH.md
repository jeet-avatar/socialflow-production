# Phase 05: Celery Workers - Research

**Researched:** 2026-04-13
**Domain:** Celery + FastAPI async task queue, Redis backend, video generation pipeline
**Confidence:** HIGH

---

## Summary

The video generation pipeline in `content_routes.py` is currently fully synchronous within HTTP request handlers. The main endpoint `POST /video-remotion` blocks the FastAPI worker for the entire duration of: ElevenLabs TTS (2-10s) + Whisper transcription (5-15s) + DALL-E backgrounds (per-scene, 5-10s each, up to 8 scenes) + fal.ai Kling clips (8s poll × 75 polls × up to 6 scenes = up to 10 min per clip) + Remotion render (variable). With fal.ai AI mode enabled, a single request can block for 30-60+ minutes. FastAPI's default timeout or Uvicorn's 30s limit will kill it long before completion.

The `_progress_store` dict already exists (`content_routes.py:80`) as an in-memory progress tracker keyed by `job_id`. This must be replaced with Redis storage so progress survives across workers and is multi-process safe. The polling endpoint `GET /video-remotion/progress/{job_id}` already exists and only needs its backend swapped from the in-memory dict to Redis.

Redis is already running in `docker-compose.yml` (redis:7.2-alpine on port 6379) and is already a declared dependency for the backend service. No new infrastructure is needed. The pattern is: HTTP endpoint enqueues a Celery task → returns `{task_id, job_id}` immediately → Celery worker runs the pipeline → writes progress to Redis → client polls `/video-remotion/progress/{job_id}`.

**Primary recommendation:** Add `celery[redis]` to `requirements.txt`, create `backend/app/worker/celery_app.py` and `backend/app/worker/video_tasks.py`, move the body of `generate_video_remotion_endpoint` into a Celery task, swap `_progress_store` for Redis writes, add a `celery_worker` service to `docker-compose.yml` using the same backend Dockerfile. No new infrastructure required.

---

## Codebase Analysis

### What Async Work Exists Today

| Endpoint | File:Line | Current Blocking Behavior | Celery Candidate? |
|----------|-----------|--------------------------|-------------------|
| `POST /video-remotion` | `content_routes.py:2193` | Blocks: ElevenLabs + Whisper + DALL-E/fal.ai + Remotion render + S3 upload. 5-60+ min total | YES — primary target |
| `POST /video-remotion/analyze` | `content_routes.py:2970` | Blocks: ElevenLabs + Whisper + GPT-4o-mini scene agent. ~30-90s | OPTIONAL — already returns before render |
| `POST /video-remotion/render-clip` | `content_routes.py:1918` | Blocks: fal.ai Kling polling (up to 10 min) | YES — secondary target |
| `POST /video-remotion/render-bg-image` | `content_routes.py:1837` | Blocks: DALL-E (10-30s) + S3 upload | LOW PRIORITY — tolerable |
| `POST /generate` | `content_routes.py:1623` | Blocks: GPT-4o text generation (~5-15s) | NO — short enough |
| `POST /video` (legacy) | `content_routes.py:1677` | Blocks: `generate_video()` utility. Old flow. | LOW PRIORITY |

**Primary Celery targets: `POST /video-remotion` and `POST /video-remotion/render-clip`**

### Progress Store (Existing — Must Migrate)

```python
# content_routes.py:80 — currently in-memory (dies on worker restart, not multi-process safe)
_progress_store: dict[str, dict] = {}

def _set_progress(job_id: str, percent: int, stage: str, detail: str = "") -> None:
    if not job_id:
        return
    _progress_store[job_id] = {"percent": percent, "stage": stage, "detail": detail, "ts": time.time()}
```

The polling endpoint `GET /video-remotion/progress/{job_id}` reads from `_progress_store`. After Celery migration:
- `_set_progress` writes to `Redis` with `SETEX` (TTL 2h to match current 7200s prune logic)
- The polling endpoint reads from Redis instead of the dict
- Same API contract — frontend polling code unchanged

### Redis Availability

Redis is **already in docker-compose.yml** (redis:7.2-alpine, port 6379, with healthcheck). The backend service already `depends_on: redis: condition: service_healthy`. The `rate_limiter.py` references Redis via slowapi. No Redis client is currently imported in the backend — this will be the first direct Redis usage.

**Redis URL:** `redis://redis:6379` in docker-compose, `redis://localhost:6379` locally.

Use database 0 for Celery broker, database 1 for Celery result backend, database 2 for raw progress keys (separate from Celery result backend to avoid key collisions).

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `celery[redis]` | 5.3.x | Task queue + Redis transport | Industry standard for Python async jobs, well-tested with FastAPI |
| `redis` | 5.x | Redis Python client + Celery result backend | Required by celery[redis] extra; also for direct progress writes |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `flower` | 2.x | Celery web monitoring UI | Opt-in — adds a docker-compose service on port 5555 |
| `pytest-celery` | 1.x | Official pytest plugin for Celery integration tests | Only if writing integration tests against a real broker |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Celery | ARQ (async job queue) | ARQ is asyncio-native but smaller ecosystem, fewer retry options |
| Celery | FastAPI BackgroundTasks | BackgroundTasks runs in the same process — still blocks on worker count, no retry, no distributed workers |
| Redis | RabbitMQ | RabbitMQ is more feature-complete but adds infrastructure not already present |
| celery[redis] | celery[sqs] | SQS avoids self-managed Redis but adds AWS dependency and latency |

**Redis is already in docker-compose — no new infrastructure needed. Use Celery + Redis.**

**Installation:**
```bash
pip install "celery[redis]==5.3.*" "redis==5.*"
```

Add to `backend/requirements.txt`:
```
celery[redis]
redis
```

---

## Architecture Patterns

### Recommended Project Structure

```
backend/app/
├── worker/
│   ├── __init__.py
│   ├── celery_app.py       # Celery instance + config (imported by FastAPI + worker)
│   └── video_tasks.py      # @celery_app.task for video generation
├── routes/
│   └── content_routes.py   # Modified: enqueue task, return task_id immediately
├── utils/
│   ├── redis_client.py     # Shared Redis connection for progress writes
│   └── ...
└── main.py                 # Unchanged — does not import worker directly
```

### Pattern 1: Task Submission (Return Immediately)

**What:** HTTP endpoint enqueues Celery task, returns task_id in <100ms. Client polls progress.
**When to use:** Any endpoint that takes >5s to complete.

```python
# backend/app/worker/celery_app.py
import os
from celery import Celery

celery_app = Celery("socialflow")
celery_app.conf.update(
    broker_url=os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0"),
    result_backend=os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/1"),
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    task_acks_late=True,           # Ack only after task completes (safe retries)
    worker_prefetch_multiplier=1,  # One task at a time per worker (video tasks are CPU/memory heavy)
)
```

```python
# backend/app/routes/content_routes.py — modified endpoint
@router.post("/video-remotion")
async def generate_video_remotion_endpoint(request: Request, user_info: CurrentUser):
    body = await request.json()
    job_id = body.get("job_id") or str(uuid.uuid4())

    # Enqueue — returns immediately (<100ms)
    from worker.video_tasks import render_video_task
    task = render_video_task.delay(
        user_id=user_info.get("user_id"),
        job_id=job_id,
        body=body,
    )
    return {"task_id": task.id, "job_id": job_id, "status": "queued"}
```

### Pattern 2: Progress via Redis (Shared Across Workers)

**What:** Tasks write progress to Redis with TTL. Polling endpoint reads from Redis. Same API surface as today.

```python
# backend/app/utils/redis_client.py
import os
import redis

_redis_url = os.getenv("REDIS_URL", "redis://redis:6379/2")
_client = redis.from_url(_redis_url, decode_responses=True)

def set_progress(job_id: str, percent: int, stage: str, detail: str = "") -> None:
    import json, time
    if not job_id:
        return
    _client.setex(
        f"progress:{job_id}",
        7200,  # 2-hour TTL — matches existing prune logic
        json.dumps({"percent": percent, "stage": stage, "detail": detail, "ts": time.time()})
    )

def get_progress(job_id: str) -> dict:
    import json
    raw = _client.get(f"progress:{job_id}")
    return json.loads(raw) if raw else {}
```

```python
# content_routes.py — polling endpoint (UNCHANGED API contract)
@router.get("/video-remotion/progress/{job_id}")
async def get_render_progress(job_id: str):
    from utils.redis_client import get_progress
    entry = get_progress(job_id)
    return {
        "percent": entry.get("percent", 0),
        "stage":   entry.get("stage",   "queued"),
        "detail":  entry.get("detail",  ""),
    }
```

### Pattern 3: Celery Task with Retry

**What:** Celery task wraps the video pipeline. `autoretry_for` handles transient external API errors.

```python
# backend/app/worker/video_tasks.py
from worker.celery_app import celery_app
from utils.redis_client import set_progress

@celery_app.task(
    bind=True,
    name="video.render",
    max_retries=3,
    default_retry_delay=10,        # 10s base (exponential with retry_backoff)
    autoretry_for=(
        requests.Timeout,
        requests.ConnectionError,
        httpx.TimeoutException,
        httpx.ConnectError,
    ),
    retry_backoff=True,            # Celery 5.x: exponential backoff
    retry_backoff_max=120,         # Cap at 120s between retries
    retry_jitter=True,             # Add jitter to avoid thundering herd
)
def render_video_task(self, user_id: str, job_id: str, body: dict):
    """Run the full Remotion video pipeline asynchronously."""
    set_progress(job_id, 5, "Starting")
    try:
        # ... pipeline logic extracted from generate_video_remotion_endpoint ...
        set_progress(job_id, 100, "Done")
        return {"success": True, "video_url": video_url, "video_id": video_id}
    except Exception as exc:
        set_progress(job_id, -1, "Failed", str(exc))
        raise  # Let Celery handle retry logic
```

### Pattern 4: Docker Compose — Same Dockerfile, Different Command

**What:** Add `celery_worker` service to `docker-compose.yml` using same backend image, different CMD.

```yaml
# docker-compose.yml — add this service
celery_worker:
  build:
    context: .
    dockerfile: backend/Dockerfile
  command: celery -A app.worker.celery_app:celery_app worker --loglevel=info --concurrency=2 -Q video
  restart: unless-stopped
  env_file:
    - path: backend/.env
      required: false
  environment:
    - CELERY_BROKER_URL=redis://redis:6379/0
    - CELERY_RESULT_BACKEND=redis://redis:6379/1
    - REDIS_URL=redis://redis:6379/2
  depends_on:
    redis:
      condition: service_healthy

# Optional — add to existing backend service
backend:
  environment:
    - CELERY_BROKER_URL=redis://redis:6379/0
    - CELERY_RESULT_BACKEND=redis://redis:6379/1
    - REDIS_URL=redis://redis:6379/2
```

**Concurrency note:** `--concurrency=2` is intentional. Video tasks are I/O-bound (polling fal.ai, S3 uploads) but also CPU-bound (Whisper transcription). Start at 2 concurrent tasks per worker to avoid OOM on small instances.

### Pattern 5: Flower Monitoring (Optional)

Add to docker-compose only if desired:
```yaml
flower:
  image: mher/flower:2.0
  command: celery --broker=redis://redis:6379/0 flower --port=5555
  ports:
    - "5555:5555"
  depends_on:
    - redis
```

Access at `http://localhost:5555`. Shows task history, worker status, failure rates. Decision: include in docker-compose commented out so it's easy to enable.

### Anti-Patterns to Avoid

- **Calling `result.get()` in the HTTP handler:** Blocks FastAPI's event loop, defeats the purpose. The endpoint MUST return immediately.
- **Using FastAPI `BackgroundTasks` for video generation:** Runs in the same process, shares memory with HTTP workers, no retry, no monitoring, dies if the process restarts.
- **Importing the Celery app in `main.py` startup:** Creates a circular import if task modules import from routes. Keep `celery_app.py` isolated — routes import from it, not the other way around.
- **Using one Redis DB for everything:** Broker keys (celery task messages), result backend keys (task results), and progress keys (progress writes) should use separate Redis DBs (0/1/2) to prevent key collisions and simplify debugging.
- **Worker prefetch > 1 for video tasks:** Each video task can take 30-60 minutes. If a worker prefetches 4 tasks and processes them sequentially, the 4th task waits 2+ hours. Set `worker_prefetch_multiplier=1`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Task retry with backoff | Custom retry loop with `time.sleep()` | `autoretry_for` + `retry_backoff=True` | Celery handles serialization, max_retries, jitter, task state transitions |
| Task state tracking | Custom state machine in MongoDB | `AsyncResult(task_id).status` | Celery stores PENDING/STARTED/SUCCESS/FAILURE in Redis result backend automatically |
| Worker process management | subprocess.Popen, systemd units | docker-compose `celery_worker` service | Restart policy, healthcheck, env var injection all handled |
| Progress persistence | In-memory dict (current `_progress_store`) | Redis SETEX with TTL | Multi-process safe, survives worker restart, TTL auto-cleans |

**Key insight:** The current `_progress_store` dict is process-local — if the worker dies or restarts, all progress data is lost. Redis with TTL is the correct primitive for this use case.

---

## Common Pitfalls

### Pitfall 1: Task Arguments Must Be JSON-Serializable

**What goes wrong:** Passing a MongoDB document (with `ObjectId`), a datetime, or a Pydantic model as a task argument. Celery serializes with JSON and the task silently fails or raises `TypeError`.
**Why it happens:** Celery's default serializer is JSON — Python objects that aren't JSON-native (ObjectId, datetime, bytes) aren't serializable.
**How to avoid:** Only pass primitive types to tasks: `str`, `int`, `float`, `bool`, `list[str]`, `dict[str, str/int/float]`. Convert ObjectId to `str(oid)` before passing. Reconstruct DB objects inside the task.
**Warning signs:** `TypeError: Object of type ObjectId is not JSON serializable` in Celery worker logs.

### Pitfall 2: Progress Updates Invisible Across Workers

**What goes wrong:** `_progress_store` is an in-memory dict. After moving to Celery, the HTTP worker (serving polling requests) is a different process than the Celery worker (running the task). The HTTP process never sees updates.
**Why it happens:** Python dict is process-local. Celery worker and uvicorn workers are separate OS processes.
**How to avoid:** Replace `_progress_store` with Redis writes (`redis_client.setex`) in the Celery task. The polling endpoint reads from Redis — accessible by any process.
**Warning signs:** `/video-remotion/progress/{job_id}` always returns `percent: 0, stage: queued` even though the task is running.

### Pitfall 3: `task_always_eager` Hides Real Bugs

**What goes wrong:** Setting `CELERY_TASK_ALWAYS_EAGER=True` in tests makes tasks run synchronously in the calling process. This skips serialization/deserialization and broker communication. Bugs that only manifest via the queue won't be caught.
**Why it happens:** Eager mode is a test shortcut that removes Celery from the equation entirely.
**How to avoid:** Test task logic directly by calling `render_video_task.run(...)` (bypasses queue) for unit tests. For integration tests, mock the external APIs (ElevenLabs, fal.ai, Remotion) and use `render_video_task.apply()` (runs synchronously but through Celery's machinery). Do NOT use `task_always_eager` in the test suite.
**Warning signs:** Tests pass but production tasks fail silently.

### Pitfall 4: Celery Worker OOM on Video Tasks

**What goes wrong:** Whisper loads an ML model into memory (~74MB for base, ~1.5GB for large). fal.ai clips are ~5-10MB each. With `--concurrency=4`, 4 Whisper instances run simultaneously → OOM kill.
**Why it happens:** Default Celery concurrency is `os.cpu_count()`, which can be 8+ on modern hosts.
**How to avoid:** Set `--concurrency=2` for the video worker (I/O-bound tasks + external API polling). Consider `--pool=threads` if moving to async-native Celery tasks, but thread pool has the GIL.
**Warning signs:** Container gets OOM-killed; tasks PENDING forever; `dmesg` shows OOM killer.

### Pitfall 5: Circular Import — `main.py` ↔ `celery_app.py` ↔ route modules

**What goes wrong:** If `main.py` imports from `celery_app.py`, and `celery_app.py` imports from routes (for task registration), and routes import from `main.py`, Python raises `ImportError: cannot import name`.
**Why it happens:** Celery's autodiscovery imports task modules at startup.
**How to avoid:** Keep `worker/celery_app.py` isolated. Routes import `celery_app` for `.delay()`. Celery app uses `include=["app.worker.video_tasks"]` for task autodiscovery. `main.py` does NOT import from `worker/` at all.
**Warning signs:** `ImportError` or `AppRegistryNotReady` at startup.

### Pitfall 6: fal.ai Polling Loop Inside a Celery Task

**What goes wrong:** The current `_gen_one()` for fal.ai uses `time.sleep(8)` in a loop (up to 75 × 8s = 10 min per clip). Inside a Celery task this is fine — the worker thread sleeps and other tasks run. But with `task_acks_late=True`, if the worker dies mid-poll, the task is re-queued and starts over (fal.ai job is already running, cost already incurred).
**Why it happens:** Celery re-queues unacknowledged tasks on worker restart.
**How to avoid:** Store the fal.ai `request_id` in Redis progress state at submission time. On retry, check if `request_id` exists in Redis and resume polling instead of re-submitting. This makes fal.ai polling idempotent.
**Warning signs:** Duplicate fal.ai charges; doubled video generation costs.

---

## Code Examples

### Complete `celery_app.py`

```python
# backend/app/worker/celery_app.py
import os
from celery import Celery

celery_app = Celery("socialflow")

celery_app.conf.update(
    broker_url=os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0"),
    result_backend=os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/1"),
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_routes={"video.*": {"queue": "video"}},
    include=["app.worker.video_tasks"],
)
```

### Task Definition Pattern

```python
# backend/app/worker/video_tasks.py
import requests
import httpx
from celery import shared_task
from worker.celery_app import celery_app
from utils.redis_client import set_progress

@celery_app.task(
    bind=True,
    name="video.render",
    max_retries=2,
    autoretry_for=(requests.Timeout, requests.ConnectionError, httpx.TimeoutException),
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
)
def render_video_task(self, user_id: str, job_id: str, body: dict):
    set_progress(job_id, 5, "Starting")
    try:
        # Extract args from body (all JSON primitives)
        dialogue = body.get("dialogue", "")
        company_name = body.get("company_name", "")
        # ... run the pipeline ...
        set_progress(job_id, 100, "Done")
        return {"success": True, "video_url": video_url, "video_id": video_id}
    except Exception as exc:
        set_progress(job_id, -1, "Failed", str(exc)[:200])
        raise  # Trigger autoretry or mark as FAILURE
```

### Unit Test Pattern (No Broker Required)

```python
# tests/test_video_tasks.py
from unittest.mock import patch, MagicMock
from app.worker.video_tasks import render_video_task

def test_render_video_task_success():
    """Test task logic without a real broker or external APIs."""
    body = {
        "dialogue": "Hello world test script.",
        "company_name": "Acme Corp",
        "job_id": "test-job-123",
    }

    with patch("app.worker.video_tasks._generate_voiceover_bytes") as mock_vo, \
         patch("app.worker.video_tasks._call_remotion_render") as mock_render, \
         patch("app.worker.video_tasks.set_progress") as mock_progress:

        mock_vo.return_value = b"fake_audio"
        mock_render.return_value = {"output_path": "/tmp/fake.mp4", "file_size_bytes": 1000}

        # .run() bypasses the broker — runs synchronously in the calling process
        result = render_video_task.run(
            user_id="user-abc",
            job_id="test-job-123",
            body=body,
        )

    assert result["success"] is True
    mock_progress.assert_called()  # Verify progress was reported
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `CELERY_TASK_ALWAYS_EAGER` for tests | Direct `.run()` call or `apply()` | Celery 5.x (deprecated eager) | Eager mode doesn't test serialization; `.run()` is cleaner |
| Single Redis DB for everything | Separate DBs (0=broker, 1=results, 2=progress) | Best practice circa 2023 | Avoids key collisions, easier debugging |
| `prefetch_multiplier` default (4) | `worker_prefetch_multiplier=1` | Recommended for long tasks | Prevents task starvation on slow queues |
| `task_acks_on_failure_or_timeout=True` | `task_acks_late=True` | Celery 5.x best practice | Ensures tasks re-queued on worker crash |

**Deprecated/outdated:**
- `CELERY_TASK_ALWAYS_EAGER`: Deprecated. Do not use for testing. Use `.run()` or mock instead.
- `celery.result.AsyncResult` with `get()` in HTTP handlers: Valid for admin/debug endpoints but never in the main request path.

---

## Open Questions

1. **Should `POST /video-remotion/analyze` also become async?**
   - What we know: `/analyze` runs ElevenLabs + Whisper + GPT-4o agent, ~30-90s. It returns scene descriptors for the user to review — it's Step 1 before the render.
   - What's unclear: Is 30-90s tolerable if the user sees a spinner? Or is it a timeout risk on the frontend?
   - Recommendation: Defer to Phase 06. The immediate pain point is `/video-remotion` (the render + fal.ai step). `/analyze` can be addressed later if user feedback shows it's an issue.

2. **fal.ai polling idempotency on retry**
   - What we know: If a Celery task is re-queued (worker crash), `_generate_scene_veo3_clips` re-submits to fal.ai, causing duplicate charges.
   - What's unclear: How often do workers crash in practice? What is fal.ai's job ID lifetime?
   - Recommendation: In Phase 05, store `fal_request_id` in Redis progress at submission time. On retry, check Redis before re-submitting. This is a ~10-line addition to `_gen_one()`.

3. **Flower in v1?**
   - What we know: Flower adds a monitoring UI showing task history, worker status, failure rates. Adds one more docker-compose service.
   - What's unclear: Is the extra complexity worth it for a solo-developer project at this stage?
   - Recommendation: Add to `docker-compose.yml` as a commented-out service with a note. Enable when debugging is needed. Do NOT make it a required service.

4. **Result persistence for completed tasks**
   - What we know: Celery stores task results in Redis result backend (DB 1). TTL defaults to 24 hours.
   - What's unclear: If the user closes the browser before getting the result, can they retrieve the video_url later?
   - Recommendation: Save `video_url` and `video_id` to MongoDB inside the task (already done in the current synchronous flow). The Celery result backend is a fallback, not the primary storage. This is already handled.

---

## Sources

### Primary (HIGH confidence)

- [TestDriven.io FastAPI + Celery tutorial](https://testdriven.io/blog/fastapi-and-celery/) — Celery setup, task submission, status polling, Docker setup
- [Celery official testing docs](https://docs.celeryq.dev/en/stable/userguide/testing.html) — test patterns, eager mode deprecation
- [Markaicode: Redis + Celery for AI Jobs](https://markaicode.com/redis-celery-long-running-ai-jobs/) — Redis-direct progress write pattern for AI tasks
- Codebase: `content_routes.py:79-88` — existing `_progress_store` and `_set_progress` implementation
- Codebase: `docker-compose.yml:1-36` — Redis already present (redis:7.2-alpine, port 6379)
- Codebase: `requirements.txt` — no Celery or redis client present; `slowapi==0.1.9` is current

### Secondary (MEDIUM confidence)

- [Celery 5 retry patterns — Reintech](https://reintech.io/blog/error-handling-retry-policies-celery-tasks) — `autoretry_for`, `retry_backoff`, `retry_jitter` config
- [Flower Docker Hub](https://hub.docker.com/r/mher/flower) — mher/flower:2.0 image; `celery flower --port=5555` command
- [Celery task routing — Usman Asif](https://usmanasifbutt.github.io/blog/2025/03/13/celery-task-routing-and-retries.html) — named queues, task_routes config

### Tertiary (LOW confidence)

- [Medium: Celery + Redis + FastAPI 2025](https://medium.com/@dewasheesh.rana/celery-redis-fastapi-the-ultimate-2025-production-guide-broker-vs-backend-explained-5b84ef508fa7) — broker vs backend DB separation recommendation (multiple sources agree)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Celery + Redis is well-documented; Redis is already in docker-compose
- Architecture: HIGH — Pattern directly maps existing `_progress_store` to Redis; task extraction is mechanical refactor
- Pitfalls: HIGH — All pitfalls verified from codebase inspection (process isolation, OOM risk from Whisper) + official Celery docs
- fal.ai idempotency: MEDIUM — Pattern is sound but untested against fal.ai's actual job ID lifetime

**Research date:** 2026-04-13
**Valid until:** 2026-05-13 (Celery 5.x is stable; Redis 7.x is stable; no breaking changes expected)
