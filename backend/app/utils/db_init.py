"""Initialize new MongoDB collections and indexes. Called once at app startup."""
import logging

from pymongo import ASCENDING, DESCENDING
from pymongo.database import Database

logger = logging.getLogger(__name__)

NEW_COLLECTIONS = {
    "channels": [
        {"key": [("user_id", ASCENDING)], "name": "channels_user_id"},
        {"key": [("user_id", ASCENDING), ("platform", ASCENDING)], "name": "channels_user_platform"},
    ],
    "queued_videos": [
        {"key": [("channel_id", ASCENDING), ("status", ASCENDING)], "name": "qv_channel_status"},
        {"key": [("scheduled_at", ASCENDING)], "name": "qv_scheduled_at"},
        {"key": [("user_id", ASCENDING), ("status", ASCENDING)], "name": "qv_user_status"},
    ],
    "brand_kits": [
        {"key": [("user_id", ASCENDING)], "name": "bk_user_id", "unique": True},
        {"key": [("channel_id", ASCENDING)], "name": "bk_channel_id"},
    ],
    "topics": [
        {"key": [("channel_id", ASCENDING), ("status", ASCENDING)], "name": "topics_channel_status"},
        {"key": [("created_at", DESCENDING)], "name": "topics_created_at"},
    ],
    "model_configs": [
        # Compound unique: one config per (user, channel) pair; channel_id=None = user default
        {
            "key": [("user_id", ASCENDING), ("channel_id", ASCENDING)],
            "name": "mc_user_channel",
            "unique": True,
        },
    ],
}


def init_collections(db: Database) -> None:
    """Create new collections and indexes. Idempotent — safe to call on every startup."""
    existing = set(db.list_collection_names())
    for collection_name, indexes in NEW_COLLECTIONS.items():
        if collection_name not in existing:
            db.create_collection(collection_name)
            logger.info(f"Created collection: {collection_name}")
        col = db[collection_name]
        for idx in indexes:
            col.create_index(
                idx["key"],
                name=idx["name"],
                unique=idx.get("unique", False),
            )
            logger.info(f"Index '{idx['name']}' on '{collection_name}': ready")
