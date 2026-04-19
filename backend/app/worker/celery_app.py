"""
Celery application instance for SocialFlow.

ISOLATION RULE: This module MUST NOT import from routes/, main.py, or any
module that imports from routes/ at module level. Routes import from here
(for .delay()), never the other way around.

Redis DB allocation:
  DB 0 — Celery broker (task messages)
  DB 1 — Celery result backend (task results, 24h TTL)
  DB 2 — Raw progress keys (set by redis_client.py, 2h TTL)
"""
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
    # Ack task only after it completes — ensures re-queue on worker crash
    task_acks_late=True,
    # Re-queue task if the worker dies (requires task_acks_late=True)
    task_reject_on_worker_lost=True,
    # One task at a time per worker — video tasks take 5-60 min each
    worker_prefetch_multiplier=1,
    # Route all "video.*" tasks to the "video" queue
    task_routes={"video.*": {"queue": "video"}},
    # Task module autodiscovery — avoids circular import via include list
    include=[
        "app.worker.video_tasks",
        "app.worker.notification_tasks",
        "app.worker.generation_tasks",
    ],
)
