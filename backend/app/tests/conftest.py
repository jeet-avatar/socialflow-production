"""Conftest for app/tests — sets up sys.path so utils.* imports resolve."""
import os
import sys
from unittest.mock import MagicMock

# Add backend/app/ to sys.path so `import utils`, `import routes`, etc. work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Stub heavy / missing optional dependencies
for _mod in ["whisper", "moviepy", "moviepy.editor", "moviepy.video.io.VideoFileClip"]:
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

# Stub slowapi (not installed in test env)
_slowapi = MagicMock()
for _name in ["slowapi", "slowapi.errors", "slowapi.middleware", "slowapi.util"]:
    if _name not in sys.modules:
        sys.modules[_name] = _slowapi

# Required env vars so integrations_service and other modules don't crash at import
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017/test")
os.environ.setdefault("MONGODB_DATABASE", "socialflow_test")
os.environ.setdefault("MONGODB_USERNAME", "test")
os.environ.setdefault("MONGODB_PASSWORD", "test")
os.environ.setdefault("MONGODB_CLUSTER", "localhost")
