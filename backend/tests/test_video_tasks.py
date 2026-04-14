"""
Unit tests for render_video_task.

Uses render_video_task.run() to execute the task synchronously in the test
process without a real Celery broker. All external APIs are mocked.

DO NOT use CELERY_TASK_ALWAYS_EAGER — it is deprecated in Celery 5.x and
skips serialization/deserialization, hiding real production bugs.
"""
from unittest.mock import MagicMock, patch

import mongomock
import pytest


@pytest.fixture()
def job_id():
    return "test-job-phase05"


@pytest.fixture()
def base_body():
    return {
        "dialogue": "Hello world. This is a test script.",
        "company_name": "Acme Corp",
        "job_id": "test-job-phase05",
    }


@pytest.fixture(autouse=True)
def _mock_mongo():
    """Patch MongoDB at the service level so content_routes imports don't hit SRV DNS."""
    _PLAIN_URI = "mongodb://localhost:27017/test"
    from utils import mongodb_service as _mdb_mod  # noqa: PLC0415
    client = mongomock.MongoClient()
    mock_db = client["socialflow_test"]
    with (
        patch(
            "utils.config.Config.get_mongodb_connection_string",
            return_value=_PLAIN_URI,
        ),
        mongomock.patch(servers=["localhost:27017"]),
        patch(
            "utils.mongodb_service.mongodb_service.get_database",
            return_value=mock_db,
        ),
        patch.object(_mdb_mod.mongodb_service, "db", mock_db),
    ):
        yield


def test_render_video_task_success(job_id, base_body):
    """Task succeeds end-to-end with mocked externals. Calls .run() — no broker."""
    from app.worker.video_tasks import render_video_task

    with (
        patch("routes.content_routes._run_video_pipeline") as mock_pipeline,
        patch("app.worker.video_tasks.set_progress") as mock_progress,
    ):
        mock_pipeline.return_value = {
            "success": True,
            "video_url": "https://cdn.example.com/video.mp4",
            "video_id": "vid-abc123",
        }

        # .run() bypasses the broker — runs synchronously in the test process
        result = render_video_task.run(
            user_id="user-xyz",
            job_id=job_id,
            body=base_body,
        )

    assert result["success"] is True
    assert "video_url" in result
    # Verify progress was set at least at start (5%) and end (100%)
    progress_calls = [call.args[1] for call in mock_progress.call_args_list]
    assert 5 in progress_calls or 10 in progress_calls, "Expected start progress call"
    assert 100 in progress_calls, "Expected completion progress call"


def test_render_video_task_failure_sets_progress(job_id, base_body):
    """On pipeline failure, progress is set to -1 'Failed' before re-raising."""
    from app.worker.video_tasks import render_video_task

    with (
        patch("routes.content_routes._run_video_pipeline", side_effect=RuntimeError("API down")),
        patch("app.worker.video_tasks.set_progress") as mock_progress,
    ):
        with pytest.raises(RuntimeError, match="API down"):
            render_video_task.run(
                user_id="user-xyz",
                job_id=job_id,
                body=base_body,
            )

    # Verify failure progress was recorded
    progress_calls = [(c.args[1], c.args[2]) for c in mock_progress.call_args_list]
    assert (-1, "Failed") in progress_calls, f"Expected (-1, 'Failed') in calls: {progress_calls}"


def test_render_video_task_empty_job_id(base_body):
    """Task handles empty job_id gracefully (set_progress no-ops on empty id)."""
    from app.worker.video_tasks import render_video_task

    body_no_job = {**base_body, "job_id": ""}

    with (
        patch("routes.content_routes._run_video_pipeline") as mock_pipeline,
        patch("app.worker.video_tasks.set_progress"),
    ):
        mock_pipeline.return_value = {"success": True, "video_url": "https://x.com/v.mp4", "video_id": "v1"}

        result = render_video_task.run(
            user_id="user-xyz",
            job_id="",
            body=body_no_job,
        )

    assert result["success"] is True
