"""FastAPI authentication dependencies.

get_current_user:
  - Verifies the Clerk session token from request headers.
  - Lazily upserts the user row in our DB on first authenticated request.
  - For teacher role on first request: auto-creates a Clerk org + our row.
  - Returns the live User ORM instance.

Role security: unsafeMetadata.role is user-controllable. We accept only
{parent, teacher}; any other value (including admin) coerces to parent.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models.organization import Organization
from ..models.user import User, UserRole
from .clerk import clerk_client, verify_request_auth

logger = logging.getLogger(__name__)


def _normalize_role(raw: object) -> UserRole:
    """Coerce a Clerk metadata role value into a safe UserRole.

    Anything that isn't exactly 'teacher' or 'parent' becomes 'parent'.
    Admin role is NOT self-service assignable — must be set by a direct
    DB edit.
    """
    if isinstance(raw, str) and raw == "teacher":
        return UserRole.teacher
    if isinstance(raw, str) and raw == "parent":
        return UserRole.parent
    logger.warning(
        "Clerk user metadata role was missing or invalid (%r); coercing to parent",
        raw,
    )
    return UserRole.parent


def _default_org_name(
    first_name: str | None, last_name: str | None, email: str
) -> str:
    """Build the default auto-created org name for a teacher signup."""
    parts = [p for p in (first_name, last_name) if p]
    if parts:
        return f"{' '.join(parts)}'s Classroom"
    local = email.split("@")[0] if "@" in email else email
    return f"{local}'s Classroom"


def _extract_primary_email(clerk_user: Any) -> str:
    """Return the primary email address string from a Clerk user object.

    Clerk user objects carry email addresses as a list with one entry
    marked as primary via primary_email_address_id. SDK v5 uses snake_case.
    """
    primary_id = getattr(clerk_user, "primary_email_address_id", None) or getattr(
        clerk_user, "primaryEmailAddressId", None
    )
    addresses = (
        getattr(clerk_user, "email_addresses", None)
        or getattr(clerk_user, "emailAddresses", None)
        or []
    )
    for addr in addresses:
        addr_id = getattr(addr, "id", None)
        if addr_id == primary_id:
            value = getattr(addr, "email_address", None) or getattr(
                addr, "emailAddress", None
            )
            if value:
                return str(value)
    # Fallback: use the first email address if no primary match
    if addresses:
        first = addresses[0]
        value = getattr(first, "email_address", None) or getattr(
            first, "emailAddress", None
        )
        if value:
            return str(value)
    return ""


def _extract_unsafe_metadata(clerk_user: Any) -> dict[str, Any]:
    """Return unsafe_metadata as a dict, handling snake_case / camelCase."""
    meta = getattr(clerk_user, "unsafe_metadata", None)
    if meta is None:
        meta = getattr(clerk_user, "unsafeMetadata", None)
    if isinstance(meta, dict):
        return meta
    return {}


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> User:
    """Verify Clerk session and return (or lazily create) the matching User row.

    Raises 401 on unauthenticated or invalid tokens.
    """
    headers = dict(request.headers)
    clerk_user_id = verify_request_auth(headers)
    if clerk_user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="unauthenticated",
        )

    result = await db.execute(
        select(User).where(
            User.clerk_id == clerk_user_id,
            User.deleted_at.is_(None),
        )
    )
    existing = result.scalar_one_or_none()

    # Fetch Clerk user data for create OR for drift-update.
    # SDK v5: users.get(user_id=...) — keyword-only param confirmed via inspect.
    clerk_user = clerk_client.users.get(user_id=clerk_user_id)

    email = _extract_primary_email(clerk_user)
    # SDK v5 User model uses snake_case fields confirmed via model_fields inspection.
    first_name: str | None = getattr(clerk_user, "first_name", None) or getattr(
        clerk_user, "firstName", None
    )
    last_name: str | None = getattr(clerk_user, "last_name", None) or getattr(
        clerk_user, "lastName", None
    )

    if existing is not None:
        changed = False
        if email and existing.email != email:
            existing.email = email
            changed = True
        if first_name != existing.first_name:
            existing.first_name = first_name
            changed = True
        if last_name != existing.last_name:
            existing.last_name = last_name
            changed = True
        if changed:
            await db.flush()
        return existing

    unsafe_meta = _extract_unsafe_metadata(clerk_user)
    role = _normalize_role(unsafe_meta.get("role"))

    organization_id = None
    if role == UserRole.teacher:
        org_name = _default_org_name(first_name, last_name, email)
        # SDK v5: organizations.create takes a `request` param wrapping
        # a CreateOrganizationRequestBody (confirmed via inspect.signature).
        from clerk_backend_api.models.createorganizationop import (
            CreateOrganizationRequestBody,
        )

        clerk_org = clerk_client.organizations.create(
            request=CreateOrganizationRequestBody(
                name=org_name,
                created_by=clerk_user_id,
            )
        )
        clerk_org_id = getattr(clerk_org, "id", None)
        new_org = Organization(
            name=org_name,
            clerk_org_id=str(clerk_org_id) if clerk_org_id else None,
        )
        db.add(new_org)
        await db.flush()  # populate new_org.id
        organization_id = new_org.id

    new_user = User(
        clerk_id=clerk_user_id,
        email=email,
        role=role,
        first_name=first_name,
        last_name=last_name,
        organization_id=organization_id,
    )
    db.add(new_user)
    await db.flush()
    return new_user
