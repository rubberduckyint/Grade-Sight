"""Clerk SDK client and authentication helpers.

Owns:
- the process-wide Clerk client (admin-API calls: fetch user, create org)
- JWT verification via Clerk's authenticate_request helper

Used by dependencies.get_current_user.
"""

from __future__ import annotations

from collections.abc import Mapping

from clerk_backend_api import Clerk
from clerk_backend_api.security import AuthenticateRequestOptions, authenticate_request

from ..config import settings

# Process-wide Clerk client for admin API calls.
clerk_client: Clerk = Clerk(bearer_auth=settings.clerk_secret_key)


class _HeaderRequest:
    """Minimal Requestish adapter that wraps a plain headers dict."""

    def __init__(self, headers: dict[str, str]) -> None:
        self._headers = headers

    @property
    def headers(self) -> Mapping[str, str]:
        return self._headers


def verify_request_auth(request_headers: dict[str, str]) -> str | None:
    """Verify a Clerk session from request headers; return clerk user id or None.

    Returns the Clerk user id (the ``sub`` claim) on success; ``None`` if the
    request is unauthenticated or the token is invalid.
    """
    state = authenticate_request(
        _HeaderRequest(request_headers),
        AuthenticateRequestOptions(
            secret_key=settings.clerk_secret_key,
        ),
    )
    if not state.is_signed_in:
        return None
    payload = state.payload
    if payload is None:
        return None
    sub = payload.get("sub")
    return str(sub) if sub else None
