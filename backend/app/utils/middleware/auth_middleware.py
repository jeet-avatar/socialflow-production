"""
Authentication Middleware for User Data Isolation (FastAPI)
Ensures all data operations are user-specific
"""

import os
import logging
from typing import Optional, Dict, Any
from contextvars import ContextVar

import jwt as pyjwt
from jwt import PyJWKClient

logger = logging.getLogger(__name__)

# Context variable to hold current user id per request context
current_user_id: ContextVar[Optional[str]] = ContextVar("current_user_id", default=None)

_CLERK_FRONTEND_API = os.getenv("CLERK_FRONTEND_API", "holy-lemur-67.clerk.accounts.dev")
_JWKS_URL = f"https://{_CLERK_FRONTEND_API}/.well-known/jwks.json"

# PyJWKClient caches the JWKS keys and refreshes when a new kid is encountered
_jwks_client = PyJWKClient(_JWKS_URL, cache_keys=True)


class AuthMiddleware:
    def verify_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Verify Auth0 JWT token using the JWKS endpoint and extract user information.

        Args:
            token: JWT token from Authorization header (with or without 'Bearer ' prefix)

        Returns:
            Dictionary containing user information or None if verification fails
        """
        try:
            if token.startswith("Bearer "):
                token = token[7:]

            if token == "dev-bypass" and os.getenv("DEV_BYPASS_AUTH", "false").lower() == "true":
                current_user_id.set("dev_user")
                return {"user_id": "dev_user", "email": "dev@local", "role": "authenticated"}

            signing_key = _jwks_client.get_signing_key_from_jwt(token)
            decoded: Dict[str, Any] = pyjwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                options={"verify_exp": True, "verify_aud": False},
            )

            current_user_id.set(decoded.get("sub"))

            return {
                "user_id": decoded.get("sub"),
                "email": decoded.get("email"),
                "role": decoded.get("role") or "authenticated",
            }

        except pyjwt.ExpiredSignatureError:
            logger.warning("Token has expired")
            return None
        except pyjwt.InvalidTokenError as e:
            logger.error(f"Invalid token: {e}")
            return None
        except Exception as e:
            logger.error(f"Token verification failed: {e}")
            return None

    def get_current_user_id(self) -> Optional[str]:
        """Get current authenticated user ID from contextvar."""
        return current_user_id.get()


# Global middleware instance
auth_middleware = AuthMiddleware()


def add_user_filter(query_filter: dict = None) -> dict:
    """
    Add user_id filter to MongoDB queries to ensure data isolation

    Args:
        query_filter: Existing query filter dictionary

    Returns:
        Query filter with user_id added
    """
    user_id = auth_middleware.get_current_user_id()

    if not user_id:
        raise ValueError("No authenticated user found")

    if query_filter is None:
        query_filter = {}

    query_filter["user_id"] = user_id
    return query_filter


def add_user_data(document: dict) -> dict:
    """
    Add user_id to document before inserting to ensure data ownership

    Args:
        document: Document to insert

    Returns:
        Document with user_id added
    """
    user_id = auth_middleware.get_current_user_id()

    if not user_id:
        raise ValueError("No authenticated user found")

    document["user_id"] = user_id
    return document
