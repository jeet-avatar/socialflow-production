"""
Model config routes test stubs — implemented in Phase 03.

Tests to implement:
- GET /model-config returns {} for user with no config
- POST /model-config creates default config (channel_id=None)
- POST /model-config with channel_id creates channel-specific config
- POST /model-config twice (same user+channel) upserts not duplicates
- GET /model-config/{channel_id} falls back to default when no channel config set
"""
