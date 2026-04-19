"""
Per-provider BYOK validation — cheap GET against each provider to confirm a key works.

Called from PUT /api/byok/{provider} (after store) and POST /api/byok/{provider}/validate
(re-test stored key). Always returns (valid: bool, error: Optional[str]).

Multi-field providers (kling, vertex) take a dict; single-key providers take a str.
"""

import logging
from typing import Optional, Tuple, Union

import requests

logger = logging.getLogger(__name__)

KeyMaterial = Union[str, dict]
_TIMEOUT = 8.0


def _ok(resp: requests.Response, accept: tuple[int, ...] = (200, 401, 403)) -> Tuple[bool, Optional[str]]:
    """
    Provider-specific validation:
      - 200 = valid
      - 401/403 = explicitly invalid (return False with message)
      - other = treat as transient/unknown failure (False + body snippet)
    """
    if resp.status_code == 200:
        return True, None
    if resp.status_code in (401, 403):
        # 403 with "exhausted balance" still means the key auth'd correctly — treat as valid.
        body = (resp.text or "").lower()
        if "exhausted" in body or "balance" in body or "quota" in body:
            return True, None
        return False, f"HTTP {resp.status_code}: {(resp.text or '')[:120]}"
    return False, f"HTTP {resp.status_code}: {(resp.text or '')[:120]}"


def _validate_fal(key: str) -> Tuple[bool, Optional[str]]:
    # fal accepts `Authorization: Key {key}`; whoami isn't documented — hit the queue
    # status endpoint, which is cheap and rejects bad keys fast.
    resp = requests.get(
        "https://fal.run/auth/whoami",
        headers={"Authorization": f"Key {key}"},
        timeout=_TIMEOUT,
    )
    return _ok(resp)


def _validate_runway(key: str) -> Tuple[bool, Optional[str]]:
    resp = requests.get(
        "https://api.dev.runwayml.com/v1/organization",
        headers={"Authorization": f"Bearer {key}", "X-Runway-Version": "2024-11-06"},
        timeout=_TIMEOUT,
    )
    return _ok(resp)


def _validate_luma(key: str) -> Tuple[bool, Optional[str]]:
    resp = requests.get(
        "https://api.lumalabs.ai/dream-machine/v1/generations?limit=1",
        headers={"Authorization": f"Bearer {key}"},
        timeout=_TIMEOUT,
    )
    return _ok(resp)


def _validate_higgsfield(key: str) -> Tuple[bool, Optional[str]]:
    resp = requests.get(
        "https://platform.higgsfield.ai/v1/account",
        headers={"Authorization": f"Bearer {key}"},
        timeout=_TIMEOUT,
    )
    return _ok(resp)


def _validate_openai(key: str) -> Tuple[bool, Optional[str]]:
    resp = requests.get(
        "https://api.openai.com/v1/models",
        headers={"Authorization": f"Bearer {key}"},
        timeout=_TIMEOUT,
    )
    return _ok(resp)


def _validate_kling(material: dict) -> Tuple[bool, Optional[str]]:
    # Kling direct uses HMAC-signed JWT — full implementation lands with the kling
    # adapter. For now we only verify the shape of the credentials.
    if not isinstance(material, dict):
        return False, "expected {access, secret}"
    access = (material.get("access") or "").strip()
    secret = (material.get("secret") or "").strip()
    if not access or not secret:
        return False, "both access and secret required"
    if len(secret) < 16:
        return False, "secret looks too short to be valid"
    return True, None  # presumptive — real check at first generation call


def _validate_vertex(material: dict) -> Tuple[bool, Optional[str]]:
    # Vertex needs a service-account JSON + project_id. Real validation = mint OAuth
    # token via google.auth — deferred to vertex adapter. Shape-check only here.
    if not isinstance(material, dict):
        return False, "expected {key, project_id}"
    key = (material.get("key") or "").strip()
    project_id = (material.get("project_id") or "").strip()
    if not key or not project_id:
        return False, "both key (service-account JSON) and project_id required"
    if not (key.startswith("{") or key.startswith("ey")):  # JSON or base64
        return False, "key should be service-account JSON or base64-encoded JSON"
    return True, None


VALIDATORS = {
    "fal": _validate_fal,
    "runway": _validate_runway,
    "luma": _validate_luma,
    "higgsfield": _validate_higgsfield,
    "openai": _validate_openai,
    "kling": _validate_kling,
    "vertex": _validate_vertex,
}


def validate_key(provider: str, material: KeyMaterial) -> Tuple[bool, Optional[str]]:
    """Dispatch to the per-provider validator. Network errors -> (False, error)."""
    fn = VALIDATORS.get(provider)
    if not fn:
        return False, f"unknown provider: {provider}"
    try:
        return fn(material)
    except requests.RequestException as exc:
        logger.warning("BYOK validate %s network error: %s", provider, exc)
        return False, f"network error: {exc.__class__.__name__}"
    except Exception as exc:
        logger.exception("BYOK validate %s unexpected error", provider)
        return False, f"validator crashed: {exc.__class__.__name__}"
