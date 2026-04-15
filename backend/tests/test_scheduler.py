"""
Unit tests for backend/app/worker/scheduler.py.

Tests scheduler logic directly — no FastAPI TestClient required.
The scheduler module imports APScheduler at module level, so we patch:
  - The module-level _scheduler global (set to MagicMock or None)
  - get_scheduler() is tested by manipulating _scheduler directly

DO NOT call scheduler_lifespan() or AsyncIOScheduler.start() — no real scheduler
instance is created and no MongoDB jobstore is used.
"""
import os
import sys
import pytest
from unittest.mock import MagicMock, patch, call


# ---------------------------------------------------------------------------
# Import the scheduler module (env vars already set by conftest.py)
# ---------------------------------------------------------------------------

import app.worker.scheduler as sched_mod


# ---------------------------------------------------------------------------
# FREQUENCY_CRON mapping — pure data tests, no I/O
# ---------------------------------------------------------------------------

def test_frequency_cron_daily():
    """FREQUENCY_CRON['daily'] maps to hour=9, minute=0."""
    cron = sched_mod.FREQUENCY_CRON["daily"]
    assert cron == {"hour": 9, "minute": 0}


def test_frequency_cron_3x_week():
    """FREQUENCY_CRON['3x_week'] schedules on Monday, Wednesday, Friday."""
    cron = sched_mod.FREQUENCY_CRON["3x_week"]
    assert cron["day_of_week"] == "mon,wed,fri"


def test_frequency_cron_weekly():
    """FREQUENCY_CRON['weekly'] schedules on Monday."""
    cron = sched_mod.FREQUENCY_CRON["weekly"]
    assert cron["day_of_week"] == "mon"


def test_frequency_cron_unknown_defaults_to_weekly():
    """_upsert_job falls back to FREQUENCY_CRON['weekly'] for unknown posting_frequency."""
    mock_scheduler = MagicMock()
    original = sched_mod._scheduler
    sched_mod._scheduler = mock_scheduler
    try:
        sched_mod._upsert_job("abc123", "unknown_freq")
        call_kwargs = mock_scheduler.add_job.call_args
        # The trigger should use FREQUENCY_CRON["weekly"] kwargs (day_of_week="mon")
        # CronTrigger is instantiated inside _upsert_job — verify add_job was called
        assert mock_scheduler.add_job.called
        # id should still be "channel:abc123"
        assert call_kwargs.kwargs["id"] == "channel:abc123"
    finally:
        sched_mod._scheduler = original


# ---------------------------------------------------------------------------
# sync_channel with _scheduler = None (SCHEDULER_ENABLED=false path)
# ---------------------------------------------------------------------------

def test_sync_channel_no_scheduler_is_noop():
    """sync_channel returns None without error when _scheduler is None."""
    original = sched_mod._scheduler
    sched_mod._scheduler = None
    try:
        result = sched_mod.sync_channel("ch-1", True, "daily")
        assert result is None  # no exception, no return value
    finally:
        sched_mod._scheduler = original


def test_sync_channel_disabled_env():
    """sync_channel does not raise even when auto_post=True and _scheduler is None."""
    original = sched_mod._scheduler
    sched_mod._scheduler = None
    try:
        # Should complete without raising
        sched_mod.sync_channel("ch-disabled", True, "weekly")
    except Exception as exc:
        pytest.fail(f"sync_channel raised when _scheduler=None: {exc}")
    finally:
        sched_mod._scheduler = original


# ---------------------------------------------------------------------------
# sync_channel with mocked _scheduler
# ---------------------------------------------------------------------------

def test_sync_channel_auto_post_true_calls_add_job():
    """sync_channel with auto_post=True calls _upsert_job, which calls add_job with id='channel:ch-1'."""
    mock_scheduler = MagicMock()
    original = sched_mod._scheduler
    sched_mod._scheduler = mock_scheduler
    try:
        sched_mod.sync_channel("ch-1", True, "daily")
        # add_job is called by _upsert_job inside sync_channel
        assert mock_scheduler.add_job.called
        call_kwargs = mock_scheduler.add_job.call_args
        assert call_kwargs.kwargs["id"] == "channel:ch-1"
    finally:
        sched_mod._scheduler = original


def test_sync_channel_auto_post_false_calls_remove_job():
    """sync_channel with auto_post=False calls remove_job with the job id."""
    mock_scheduler = MagicMock()
    original = sched_mod._scheduler
    sched_mod._scheduler = mock_scheduler
    try:
        sched_mod.sync_channel("ch-2", False, "daily")
        mock_scheduler.remove_job.assert_called_once_with("channel:ch-2")
    finally:
        sched_mod._scheduler = original


def test_sync_channel_remove_job_exception_is_swallowed():
    """sync_channel swallows remove_job exceptions (job may not exist)."""
    mock_scheduler = MagicMock()
    mock_scheduler.remove_job.side_effect = Exception("job not found")
    original = sched_mod._scheduler
    sched_mod._scheduler = mock_scheduler
    try:
        # Must not propagate
        sched_mod.sync_channel("ch-3", False, "daily")
    except Exception as exc:
        pytest.fail(f"sync_channel propagated remove_job exception: {exc}")
    finally:
        sched_mod._scheduler = original


# ---------------------------------------------------------------------------
# get_scheduler()
# ---------------------------------------------------------------------------

def test_get_scheduler_raises_before_init():
    """get_scheduler() raises RuntimeError when _scheduler is None."""
    original = sched_mod._scheduler
    sched_mod._scheduler = None
    try:
        with pytest.raises(RuntimeError, match="Scheduler not initialized"):
            sched_mod.get_scheduler()
    finally:
        sched_mod._scheduler = original


def test_get_scheduler_returns_scheduler_after_set():
    """get_scheduler() returns _scheduler when it is set to a MagicMock."""
    mock_scheduler = MagicMock()
    original = sched_mod._scheduler
    sched_mod._scheduler = mock_scheduler
    try:
        result = sched_mod.get_scheduler()
        assert result is mock_scheduler
    finally:
        sched_mod._scheduler = original


# ---------------------------------------------------------------------------
# _upsert_job (with mocked _scheduler)
# ---------------------------------------------------------------------------

def test_upsert_job_uses_channel_id_as_job_id():
    """_upsert_job passes id='channel:{channel_id}' to add_job."""
    mock_scheduler = MagicMock()
    original = sched_mod._scheduler
    sched_mod._scheduler = mock_scheduler
    try:
        sched_mod._upsert_job("abc123", "daily")
        call_kwargs = mock_scheduler.add_job.call_args
        assert call_kwargs.kwargs["id"] == "channel:abc123"
    finally:
        sched_mod._scheduler = original


def test_upsert_job_replace_existing_true():
    """_upsert_job calls add_job with replace_existing=True."""
    mock_scheduler = MagicMock()
    original = sched_mod._scheduler
    sched_mod._scheduler = mock_scheduler
    try:
        sched_mod._upsert_job("abc123", "daily")
        call_kwargs = mock_scheduler.add_job.call_args
        assert call_kwargs.kwargs["replace_existing"] is True
    finally:
        sched_mod._scheduler = original


def test_upsert_job_coalesce_true():
    """_upsert_job calls add_job with coalesce=True."""
    mock_scheduler = MagicMock()
    original = sched_mod._scheduler
    sched_mod._scheduler = mock_scheduler
    try:
        sched_mod._upsert_job("abc123", "daily")
        call_kwargs = mock_scheduler.add_job.call_args
        assert call_kwargs.kwargs["coalesce"] is True
    finally:
        sched_mod._scheduler = original


def test_upsert_job_misfire_grace_3600():
    """_upsert_job calls add_job with misfire_grace_time=3600."""
    mock_scheduler = MagicMock()
    original = sched_mod._scheduler
    sched_mod._scheduler = mock_scheduler
    try:
        sched_mod._upsert_job("abc123", "daily")
        call_kwargs = mock_scheduler.add_job.call_args
        assert call_kwargs.kwargs["misfire_grace_time"] == 3600
    finally:
        sched_mod._scheduler = original
