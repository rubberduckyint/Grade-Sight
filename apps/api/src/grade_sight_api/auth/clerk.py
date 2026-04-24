"""Clerk SDK client and authentication helpers.

Owns:
- the process-wide Clerk client (admin-API calls: fetch user, create org)
- JWT verification via Clerk's verify_token helper (server-to-server friendly)

Used by dependencies.get_current_user.
"""

from __future__ import annotations

import logging

from clerk_backend_api import Clerk
from clerk_backend_api.security import VerifyTokenOptions, verify_token

from ..config import settings

logger = logging.getLogger(__name__)

# Process-wide Clerk client for admin API calls.
clerk_client: Clerk = Clerk(bearer_auth=settings.clerk_secret_key)


def verify_request_auth(request_headers: dict[str, str]) -> str | None:
    """Verify a Clerk-issued JWT from the Authorization header.

    Returns the Clerk user id (the ``sub`` claim) on success; ``None`` if the
    header is missing, malformed, or the token fails verification.

    Uses verify_token rather than authenticate_request: server-to-server calls
    (Next.js server fetching our api with just a Bearer token) don't carry the
    cookie/origin context that authenticate_request's heuristics expect.
    """
    auth_header = request_headers.get("authorization") or request_headers.get(
        "Authorization"
    )
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    token = auth_header.removeprefix("Bearer ").strip()
    try:
        claims = verify_token(
            token,
            VerifyTokenOptions(secret_key=settings.clerk_secret_key),
        )
    except Exception as exc:
        logger.warning("Clerk token verification failed: %s", exc.__class__.__name__)
        return None
    if not isinstance(claims, dict):
        return None
    sub = claims.get("sub")
    return str(sub) if sub else None
