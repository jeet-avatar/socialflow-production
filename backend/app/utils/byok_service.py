"""
BYOK (user_api_keys) MongoDB CRUD.

Stores one row per (user_id, provider). Plaintext keys NEVER leave this module —
they are only decrypted at the moment of upstream-provider dispatch.

Schema (matches SPEC §3):
    {
      _id: ObjectId,
      user_id: str,
      provider: 'fal'|'vertex'|'kling'|'runway'|'luma'|'higgsfield'|'openai',
      encrypted_key: str (base64url AES-GCM ciphertext, OR JSON-encoded multi-field for kling/vertex),
      key_hint: str (last 4 chars, displayable),
      validated: bool,
      validated_at: datetime|None,
      validation_error: str|None,
      last_used_at: datetime|None,
      created_at: datetime,
      updated_at: datetime,
    }
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional, Union

from utils.byok_crypto import encrypt, decrypt, key_hint
from utils.byok_validators import validate_key
from utils.mongodb_service import mongodb_service

logger = logging.getLogger(__name__)

_COLLECTION = "user_api_keys"
_MULTI_FIELD_PROVIDERS = {"kling", "vertex"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _collection():
    """Lazy collection accessor — also ensures the unique (user_id, provider) index."""
    if mongodb_service.db is None:
        if not mongodb_service.connect():
            raise RuntimeError("MongoDB not connected")
    col = mongodb_service.db[_COLLECTION]
    # Idempotent — pymongo no-ops if index already exists with same spec.
    col.create_index([("user_id", 1), ("provider", 1)], unique=True, name="uak_user_provider")
    return col


def _serialize_for_storage(provider: str, material: Union[str, dict]) -> tuple[str, str]:
    """Returns (encrypted_blob, hint)."""
    if provider in _MULTI_FIELD_PROVIDERS:
        if not isinstance(material, dict):
            raise ValueError(f"{provider} expects multi-field credentials (dict)")
        # Encrypt the JSON dump; hint shows tail of the most-secret field.
        plaintext = json.dumps(material, separators=(",", ":"))
        secret_field = material.get("secret") or material.get("key") or ""
        return encrypt(plaintext), key_hint(str(secret_field))
    if not isinstance(material, str):
        raise ValueError(f"{provider} expects a string key")
    return encrypt(material), key_hint(material)


def store_key(user_id: str, provider: str, material: Union[str, dict]) -> dict:
    """
    Encrypt + upsert. Validates after store and returns:
        {stored: True, validated: bool, validation_error: Optional[str], key_hint: str}
    """
    encrypted_blob, hint = _serialize_for_storage(provider, material)
    valid, err = validate_key(provider, material)

    now = _now()
    _collection().update_one(
        {"user_id": user_id, "provider": provider},
        {
            "$set": {
                "encrypted_key": encrypted_blob,
                "key_hint": hint,
                "validated": valid,
                "validated_at": now if valid else None,
                "validation_error": err,
                "updated_at": now,
            },
            "$setOnInsert": {
                "user_id": user_id,
                "provider": provider,
                "created_at": now,
                "last_used_at": None,
            },
        },
        upsert=True,
    )
    logger.info("BYOK store user=%s provider=%s validated=%s", user_id, provider, valid)
    return {"stored": True, "validated": valid, "validation_error": err, "key_hint": hint}


def list_keys(user_id: str) -> list[dict]:
    """Public projection — never returns encrypted_key."""
    rows = _collection().find({"user_id": user_id})
    out = []
    for row in rows:
        out.append({
            "provider": row["provider"],
            "has_key": True,
            "key_hint": row.get("key_hint"),
            "validated": row.get("validated", False),
            "validated_at": row.get("validated_at").isoformat() if row.get("validated_at") else None,
            "validation_error": row.get("validation_error"),
            "last_used_at": row.get("last_used_at").isoformat() if row.get("last_used_at") else None,
            "created_at": row.get("created_at").isoformat() if row.get("created_at") else None,
        })
    return out


def delete_key(user_id: str, provider: str) -> bool:
    res = _collection().delete_one({"user_id": user_id, "provider": provider})
    return res.deleted_count > 0


def get_decrypted_key(user_id: str, provider: str) -> Optional[Union[str, dict]]:
    """
    Decrypt and return the stored key. Used ONLY by provider adapters at dispatch time.
    Updates last_used_at as a side effect.
    """
    row = _collection().find_one({"user_id": user_id, "provider": provider})
    if not row:
        return None
    plaintext = decrypt(row["encrypted_key"])
    _collection().update_one(
        {"_id": row["_id"]},
        {"$set": {"last_used_at": _now()}},
    )
    if provider in _MULTI_FIELD_PROVIDERS:
        return json.loads(plaintext)
    return plaintext


def revalidate(user_id: str, provider: str) -> dict:
    """Re-test a stored key. Returns {valid, error}."""
    material = get_decrypted_key(user_id, provider)
    if material is None:
        return {"valid": False, "error": "no key stored"}
    valid, err = validate_key(provider, material)
    _collection().update_one(
        {"user_id": user_id, "provider": provider},
        {"$set": {
            "validated": valid,
            "validated_at": _now() if valid else None,
            "validation_error": err,
        }},
    )
    return {"valid": valid, "error": err}
