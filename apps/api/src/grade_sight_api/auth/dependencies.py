"""FastAPI authentication dependencies.

get_current_user:
  - Verifies the Clerk session token from request headers.
  - Lazily upserts the user row in our DB on first authenticated request.
  - For BOTH parent and teacher roles on first request: auto-creates a Clerk
    org + our organizations row + Stripe customer + trialing subscriptions
    row + denormalizes organizations.subscription_status.
  - Returns the live User ORM instance.

Role security: unsafeMetadata.role is user-controllable. We accept only
{parent, teacher}; any other value (including admin) coerces to parent.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from clerk_backend_api.models.createorganizationop import CreateOrganizationRequestBody
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models.organization import Organization
from ..models.subscription import Plan, Subscription, SubscriptionStatus
from ..models.user import User, UserRole
from ..services import stripe_service
from .clerk import clerk_client, verify_request_auth

logger = logging.getLogger(__name__)


def _normalize_role(raw: object) -> UserRole:
    """Coerce a Clerk metadata role value into a safe UserRole.

    Anything that isn't 'teacher' or 'parent' becomes 'parent'. Admin role is
    NOT self-service assignable — must be set by a direct DB edit.
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
    role: UserRole,
    first_name: str | None,
    last_name: str | None,
    email: str,
) -> str:
    """Build the default auto-created org name.

    Parent: '{First Last}'s Family'
    Teacher: '{First Last}'s Classroom'
    Fallback: '{email-local}'s {Family|Classroom}' when names missing.
    """
    suffix = "Classroom" if role == UserRole.teacher else "Family"
    parts = [p for p in (first_name, last_name) if p]
    if parts:
        return f"{' '.join(parts)}'s {suffix}"
    local = email.split("@")[0] if "@" in email else email
    return f"{local}'s {suffix}"


def _plan_for_role(role: UserRole) -> Plan:
    """Map a user role to their default subscription plan."""
    if role == UserRole.teacher:
        return Plan.teacher_monthly
    return Plan.parent_monthly


def _extract_primary_email(clerk_user: Any) -> str:
    """Return the primary email address string from a Clerk user object."""
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
    if addresses:
        first = addresses[0]
        value = getattr(first, "email_address", None) or getattr(
            first, "emailAddress", None
        )
        if value:
            return str(value)
    return ""


def _extract_unsafe_metadata(clerk_user: Any) -> dict[str, Any]:
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
    """Verify Clerk session and return (or lazily create) the matching User row."""
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

    clerk_user = clerk_client.users.get(user_id=clerk_user_id)

    email = _extract_primary_email(clerk_user)
    first_name = getattr(clerk_user, "first_name", None) or getattr(
        clerk_user, "firstName", None
    )
    last_name = getattr(clerk_user, "last_name", None) or getattr(
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

    # ─── New user: create Clerk org + DB org + Stripe customer + trial sub + user row ───

    # Serialize concurrent first-request upserts for the same Clerk user. Without
    # this, parallel requests (e.g. Promise.all on the dashboard) each enter this
    # branch and leak duplicate Clerk orgs + Stripe customers before the users
    # INSERT fails on uq_users_clerk_id. The xact-scoped lock auto-releases on
    # commit/rollback; re-query after acquiring to detect the benign lost-race.
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
        {"key": f"lazy_upsert:{clerk_user_id}"},
    )
    result = await db.execute(
        select(User).where(
            User.clerk_id == clerk_user_id,
            User.deleted_at.is_(None),
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        return existing

    unsafe_meta = _extract_unsafe_metadata(clerk_user)
    role = _normalize_role(unsafe_meta.get("role"))
    org_name = _default_org_name(role, first_name, last_name, email)
    plan = _plan_for_role(role)

    # 1. Create Clerk org (for both parent and teacher now)
    clerk_org = clerk_client.organizations.create(
        request=CreateOrganizationRequestBody(name=org_name, created_by=clerk_user_id)
    )
    clerk_org_id = getattr(clerk_org, "id", None)

    # 2. Insert our organizations row
    new_org = Organization(
        name=org_name,
        clerk_org_id=str(clerk_org_id) if clerk_org_id else None,
    )
    db.add(new_org)
    await db.flush()

    # 3. Create Stripe customer via service layer (writes audit log)
    stripe_customer = await stripe_service.create_customer(
        email=email,
        organization_id=new_org.id,
        db=db,
    )

    # 4. Insert subscription row: trialing, 30-day trial, no stripe_subscription_id yet
    trial_ends_at = datetime.now(UTC) + timedelta(days=30)
    new_sub = Subscription(
        organization_id=new_org.id,
        stripe_customer_id=stripe_customer.id,
        stripe_subscription_id=None,
        plan=plan,
        status=SubscriptionStatus.trialing,
        trial_ends_at=trial_ends_at,
        current_period_end=None,
        cancel_at_period_end=False,
    )
    db.add(new_sub)

    # 5. Denormalize subscription status onto organization
    new_org.subscription_status = SubscriptionStatus.trialing

    # 6. Insert users row
    new_user = User(
        clerk_id=clerk_user_id,
        email=email,
        role=role,
        first_name=first_name,
        last_name=last_name,
        organization_id=new_org.id,
    )
    db.add(new_user)
    await db.flush()

    logger.info(
        "Lazy upsert created org=%s user=%s role=%s plan=%s",
        new_org.id,
        new_user.id,
        role.value,
        plan.value,
    )
    return new_user
