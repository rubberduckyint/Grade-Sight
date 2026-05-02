"""Tests for get_current_user edge-cases in auth/dependencies.py."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.auth import dependencies
from grade_sight_api.auth.clerk import clerk_client
from grade_sight_api.auth.dependencies import get_current_user
from grade_sight_api.models.organization import Organization
from grade_sight_api.models.user import User, UserRole


def _fake_clerk_user(
    *,
    user_id: str = "clerk_deleted_user",
    email: str = "deleted@test.local",
    role: str = "parent",
) -> MagicMock:
    user = MagicMock()
    user.id = user_id
    user.first_name = "Deleted"
    user.last_name = "User"
    user.email_addresses = [MagicMock(email_address=email)]
    user.unsafe_metadata = {"role": role}
    return user


def _fake_request_with_token(token: str = "valid-jwt") -> MagicMock:
    req = MagicMock()
    req.headers = {"authorization": f"Bearer {token}"}
    return req


@pytest.fixture
def patch_clerk_auth_deleted() -> Any:
    """verify_request_auth returns the clerk_id of the pre-seeded soft-deleted user."""
    with patch.object(
        dependencies, "verify_request_auth", return_value="clerk_deleted_user"
    ):
        yield


@pytest.fixture
def patch_clerk_user_get_deleted() -> Any:
    """clerk_client.users.get returns a fake user for the deleted clerk_id."""
    with patch.object(
        clerk_client.users, "get", return_value=_fake_clerk_user()
    ):
        yield


@pytest.mark.asyncio
async def test_get_current_user_rejects_soft_deleted_user(
    async_session: AsyncSession,
    patch_clerk_auth_deleted: None,
    patch_clerk_user_get_deleted: None,
) -> None:
    """A user whose deleted_at is set must not be able to authenticate via
    a still-live Clerk session — must receive 401, not 500 or new-user creation."""
    org = Organization(name="org")
    async_session.add(org)
    await async_session.flush()
    user = User(
        clerk_id="clerk_deleted_user",
        email="deleted@test.local",
        role=UserRole.parent,
        organization_id=org.id,
        deleted_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    async_session.add(user)
    await async_session.flush()

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(
            request=_fake_request_with_token(), db=async_session
        )

    assert exc_info.value.status_code == 401
    assert "deleted" in exc_info.value.detail.lower()
