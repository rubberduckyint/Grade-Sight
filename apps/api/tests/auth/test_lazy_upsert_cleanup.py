"""Failure-path tests for the lazy-upsert cleanup in get_current_user.

These tests cover what happens when one of the external/DB steps in the
"new user" branch fails partway through. The helper _cleanup_partial_lazy_upsert
must run with the right ids and surface the original exception unmasked.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import stripe as stripe_sdk
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.auth import dependencies
from grade_sight_api.auth.clerk import clerk_client
from grade_sight_api.auth.dependencies import get_current_user
from grade_sight_api.services import stripe_service


def _fake_clerk_user(
    *,
    user_id: str = "user_test123",
    email: str = "test@example.com",
    role: str = "teacher",
) -> MagicMock:
    user = MagicMock()
    user.id = user_id
    user.first_name = "Test"
    user.last_name = "User"
    user.email_addresses = [MagicMock(email_address=email)]
    user.unsafe_metadata = {"role": role}
    return user


def _fake_request_with_token(token: str = "valid-jwt") -> MagicMock:
    req = MagicMock()
    req.headers = {"authorization": f"Bearer {token}"}
    return req


def _fake_clerk_org(org_id: str = "org_TEST123") -> MagicMock:
    org = MagicMock()
    org.id = org_id
    return org


@pytest.fixture
def patch_clerk_auth() -> Any:
    """verify_request_auth returns a stable clerk_user_id; no real JWT decode."""
    with patch.object(dependencies, "verify_request_auth", return_value="user_test123"):
        yield


@pytest.fixture
def patch_clerk_user_get() -> Any:
    """clerk_client.users.get returns a fake user."""
    with patch.object(clerk_client.users, "get", return_value=_fake_clerk_user()):
        yield


async def test_cleanup_runs_when_stripe_create_fails(
    async_session: AsyncSession,
    patch_clerk_auth: None,
    patch_clerk_user_get: None,
) -> None:
    """If stripe_service.create_customer raises, cleanup deletes the Clerk org only."""
    fake_org = _fake_clerk_org("org_CLEANUP_ME")

    with (
        patch.object(
            clerk_client.organizations,
            "create",
            return_value=fake_org,
        ),
        patch.object(
            clerk_client.organizations,
            "delete",
            return_value=None,
        ) as clerk_delete,
        patch.object(
            stripe_service,
            "create_customer",
            new=AsyncMock(side_effect=RuntimeError("stripe blew up")),
        ),
        patch.object(
            stripe_sdk.Customer,
            "delete_async",
            new=AsyncMock(return_value=None),
        ) as stripe_delete,
        pytest.raises(RuntimeError, match="stripe blew up"),
    ):
        await get_current_user(
            request=_fake_request_with_token(), db=async_session
        )

    clerk_delete.assert_called_once_with(organization_id="org_CLEANUP_ME")
    stripe_delete.assert_not_called()


async def test_cleanup_runs_when_user_insert_fails(
    async_session: AsyncSession,
    patch_clerk_auth: None,
    patch_clerk_user_get: None,
) -> None:
    """If the final users INSERT fails, both Clerk org and Stripe customer are cleaned up."""
    fake_org = _fake_clerk_org("org_CLEANUP_BOTH")
    fake_customer = MagicMock()
    fake_customer.id = "cus_CLEANUP_BOTH"

    async def fake_create_customer(*args: Any, **kwargs: Any) -> Any:
        return fake_customer

    # Pre-insert a soft-deleted user with the SAME clerk_id so the existing-user
    # query (filtered by deleted_at IS NULL) does not find it, but the final
    # users INSERT in the create branch hits a unique-constraint violation on
    # uq_users_clerk_id (the constraint is over all rows, not partial).
    from grade_sight_api.models.organization import Organization
    from grade_sight_api.models.user import User, UserRole

    pre_org = Organization(name="Pre-existing")
    async_session.add(pre_org)
    await async_session.flush()
    pre_user = User(
        clerk_id="user_test123",
        email="other@example.com",
        role=UserRole.parent,
        first_name="Other",
        last_name="User",
        organization_id=pre_org.id,
    )
    async_session.add(pre_user)
    await async_session.flush()
    pre_user.deleted_at = datetime.utcnow()  # column is TIMESTAMP WITHOUT TIME ZONE
    await async_session.flush()

    with (
        patch.object(
            clerk_client.organizations,
            "create",
            return_value=fake_org,
        ),
        patch.object(
            clerk_client.organizations,
            "delete",
            return_value=None,
        ) as clerk_delete,
        patch.object(
            stripe_service,
            "create_customer",
            new=AsyncMock(side_effect=fake_create_customer),
        ),
        patch.object(
            stripe_sdk.Customer,
            "delete_async",
            new=AsyncMock(return_value=None),
        ) as stripe_delete,
        pytest.raises(Exception),  # noqa: B017 — IntegrityError or wrapped
    ):
        await get_current_user(
            request=_fake_request_with_token(), db=async_session
        )

    clerk_delete.assert_called_once_with(organization_id="org_CLEANUP_BOTH")
    stripe_delete.assert_awaited_once_with("cus_CLEANUP_BOTH")


async def test_cleanup_failure_does_not_mask_original_exception(
    async_session: AsyncSession,
    caplog: pytest.LogCaptureFixture,
    patch_clerk_auth: None,
    patch_clerk_user_get: None,
) -> None:
    """If the cleanup-of-cleanup also fails, log a WARNING but surface the original exception."""
    fake_org = _fake_clerk_org("org_CLEANUP_BROKEN")

    with (
        patch.object(
            clerk_client.organizations,
            "create",
            return_value=fake_org,
        ),
        patch.object(
            clerk_client.organizations,
            "delete",
            side_effect=RuntimeError("clerk delete blew up"),
        ),
        patch.object(
            stripe_service,
            "create_customer",
            new=AsyncMock(side_effect=RuntimeError("stripe blew up")),
        ),
        patch.object(
            stripe_sdk.Customer,
            "delete_async",
            new=AsyncMock(return_value=None),
        ) as stripe_delete,
        caplog.at_level(logging.WARNING, logger="grade_sight_api.auth.dependencies"),
        pytest.raises(RuntimeError, match="stripe blew up"),
    ):
        await get_current_user(
            request=_fake_request_with_token(), db=async_session
        )

    assert any(
        "Lazy upsert cleanup: failed to delete Clerk org" in rec.message
        for rec in caplog.records
    ), f"expected cleanup warning in logs, got: {[r.message for r in caplog.records]}"
    stripe_delete.assert_not_called()
