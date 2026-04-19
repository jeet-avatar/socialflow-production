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
    "platform_posts": [
        {"key": [("channel_id", ASCENDING)], "name": "pp_channel_id"},
        {"key": [("user_id", ASCENDING)], "name": "pp_user_id"},
        {"key": [("channel_id", ASCENDING), ("platform", ASCENDING)], "name": "pp_channel_platform"},
        {"key": [("posted_at", DESCENDING)], "name": "pp_posted_at"},
    ],
    "notifications": [
        {"key": [("user_id", ASCENDING), ("created_at", DESCENDING)], "name": "notif_user_created"},
        {"key": [("user_id", ASCENDING), ("read", ASCENDING)], "name": "notif_user_read"},
        {"key": [("channel_id", ASCENDING)], "name": "notif_channel_id"},
    ],
    "user_api_keys": [
        {
            "key": [("user_id", ASCENDING), ("provider", ASCENDING)],
            "name": "uak_user_provider",
            "unique": True,
        },
    ],
    "generation_jobs": [
        {"key": [("user_id", ASCENDING), ("created_at", DESCENDING)], "name": "gj_user_created"},
        {"key": [("status", ASCENDING)], "name": "gj_status"},
        {"key": [("job_id", ASCENDING)], "name": "gj_job_id", "unique": True},
    ],
    "credit_balances": [
        {"key": [("user_id", ASCENDING)], "name": "cb_user_id", "unique": True},
    ],
    "credit_transactions": [
        {"key": [("user_id", ASCENDING), ("created_at", DESCENDING)], "name": "ct_user_created"},
        {"key": [("reference_id", ASCENDING)], "name": "ct_reference"},
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
