"""
AES-256-GCM encryption for BYOK (Bring Your Own Key) storage.

The plaintext key is never persisted. Only the GCM ciphertext (nonce|ct|tag,
base64url) and a 4-char hint go to MongoDB. The hint is what the FE displays;
the ciphertext is opaque and only decrypted at the moment of dispatch to the
upstream provider.

Env: BYOK_ENCRYPTION_KEY = 64 hex chars (32 bytes). Generate with:
    openssl rand -hex 32
"""

import base64
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


_NONCE_LEN = 12  # GCM standard nonce size
_KEY_LEN = 32    # AES-256


class ByokCryptoError(Exception):
    """Raised when crypto setup or operations fail."""


def _load_key() -> bytes:
    raw = os.getenv("BYOK_ENCRYPTION_KEY", "").strip()
    if not raw:
        raise ByokCryptoError(
            "BYOK_ENCRYPTION_KEY not set — generate with `openssl rand -hex 32` "
            "and set in backend/.env"
        )
    try:
        key = bytes.fromhex(raw)
    except ValueError as exc:
        raise ByokCryptoError("BYOK_ENCRYPTION_KEY must be 64 hex chars") from exc
    if len(key) != _KEY_LEN:
        raise ByokCryptoError(f"BYOK_ENCRYPTION_KEY must decode to {_KEY_LEN} bytes (got {len(key)})")
    return key


def encrypt(plaintext: str) -> str:
    """Encrypt a UTF-8 string. Returns base64url(nonce || ciphertext || tag)."""
    aesgcm = AESGCM(_load_key())
    nonce = os.urandom(_NONCE_LEN)
    ct = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), associated_data=None)
    return base64.urlsafe_b64encode(nonce + ct).decode("ascii")


def decrypt(blob: str) -> str:
    """Decrypt the output of `encrypt`. Raises on tamper / wrong key."""
    aesgcm = AESGCM(_load_key())
    raw = base64.urlsafe_b64decode(blob.encode("ascii"))
    if len(raw) < _NONCE_LEN + 16:  # 16 = GCM tag
        raise ByokCryptoError("ciphertext too short")
    nonce, ct = raw[:_NONCE_LEN], raw[_NONCE_LEN:]
    return aesgcm.decrypt(nonce, ct, associated_data=None).decode("utf-8")


def key_hint(plaintext: str) -> str:
    """4-char tail with bullet prefix, safe to display. e.g. '••••••••3a9b'."""
    tail = plaintext.strip()[-4:] if len(plaintext.strip()) >= 4 else "????"
    return f"••••••••{tail}"
