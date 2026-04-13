"""Shared test fixtures for SocialFlow backend tests."""
import os
import sys

# ---------------------------------------------------------------------------
# Stub heavy / missing dependencies FIRST — before any app module is imported.
# These only need to exist; their real behaviour is irrelevant for route tests.
# ---------------------------------------------------------------------------
from unittest.mock import MagicMock

class _PassthroughASGIMiddleware:
    """Minimal ASGI pass-through — replaces SlowAPIASGIMiddleware in tests."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        await self.app(scope, receive, send)


class _RateLimitExceeded(Exception):
    pass


class _Limiter:
    def __init__(self, *args, **kwargs):
        pass
    def limit(self, *args, **kwargs):
        def decorator(fn):
            return fn
        return decorator
    # Allow attribute access for anything else (e.g. app registration)
    def __getattr__(self, name):
        return MagicMock()


def _make_slowapi_stub():
    """Return a fake `slowapi` package tree with the symbols main.py needs."""
    root = MagicMock()
    root.Limiter = _Limiter
    root.SlowAPIMiddleware = _PassthroughASGIMiddleware

    errors_mod = MagicMock()
    errors_mod.RateLimitExceeded = _RateLimitExceeded
    root.errors = errors_mod

    middleware_mod = MagicMock()
    middleware_mod.SlowAPIASGIMiddleware = _PassthroughASGIMiddleware
    root.middleware = middleware_mod

    util_mod = MagicMock()
    util_mod.get_remote_address = MagicMock(return_value="127.0.0.1")
    root.util = util_mod

    return root

_slowapi_pkg = _make_slowapi_stub()
for _mod_name in ["slowapi", "slowapi.errors", "slowapi.middleware", "slowapi.util"]:
    if _mod_name not in sys.modules:
        sys.modules[_mod_name] = _slowapi_pkg if _mod_name == "slowapi" else getattr(_slowapi_pkg, _mod_name.split(".")[-1])

# Stub whisper / moviepy (heavy ML libs not installed in the test env)
for _mod in ["whisper", "moviepy", "moviepy.editor", "moviepy.video.io.VideoFileClip"]:
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

# Ensure `app/` is on sys.path so `import utils`, `import routes`, etc. resolve
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))

# Set required env vars BEFORE any app module imports (several validate at load time)
os.environ["DEV_BYPASS_AUTH"] = "true"
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:5173")
# Plain URI (no SRV) so MongoClient / mongomock don't do DNS lookups
os.environ["MONGODB_URI"] = "mongodb://localhost:27017/test"
os.environ["MONGODB_USERNAME"] = "test_user"
os.environ["MONGODB_PASSWORD"] = "test_pass"
os.environ["MONGODB_CLUSTER"] = "cluster0.test.mongodb.net"  # Placeholder (patched below)
os.environ["MONGODB_DATABASE"] = "socialflow_test"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
os.environ.setdefault("OPENAI_API_KEY", "sk-test")

import pytest
import mongomock
from unittest.mock import patch

_PLAIN_URI = "mongodb://localhost:27017/test"


def make_mock_db():
    """Create an in-memory mongomock database."""
    client = mongomock.MongoClient()
    return client["socialflow_test"]


@pytest.fixture
def mock_db():
    """In-memory MongoDB via mongomock."""
    return make_mock_db()


@pytest.fixture
def client(mock_db):
    """
    FastAPI TestClient with all MongoDB access replaced by mongomock.

    Patch stack (applied in order):
    1. config.get_mongodb_connection_string → returns plain localhost URI
       so UserService falls back to MONGODB_URI (avoids SRV DNS lookup)
    2. mongomock.patch → intercepts all pymongo.MongoClient() calls
    3. mongodb_service.get_database → returns the isolated mock_db fixture
    4. mongodb_service.db → same mock_db (for services that access .db directly)
    """
    # Import here so sys.path is in place first
    from utils import mongodb_service as _mdb_mod  # noqa: PLC0415
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
        from fastapi.testclient import TestClient
        from app.main import app  # noqa: PLC0415
        with TestClient(app) as c:
            yield c


@pytest.fixture
def auth_headers():
    """Headers that pass the dev-bypass auth middleware."""
    return {"Authorization": "dev-bypass"}


@pytest.fixture
def test_user_id():
    return "dev_user"
