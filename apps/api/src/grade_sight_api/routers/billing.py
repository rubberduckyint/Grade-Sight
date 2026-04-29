"""Authenticated billing endpoints: entitlement, checkout, customer portal."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import get_current_user
from ..config import settings
from ..db import get_session
from ..models.subscription import Subscription, SubscriptionStatus
from ..models.user import User
from ..schemas.billing import (
    CheckoutSessionResponse,
    EntitlementResponse,
    PortalSessionResponse,
    PriceInfo,
    PricesResponse,
)
from ..services import stripe_pricing, stripe_service

router = APIRouter()

_ENTITLED_STATUSES: frozenset[SubscriptionStatus] = frozenset(
    {
        SubscriptionStatus.trialing,
        SubscriptionStatus.active,
        SubscriptionStatus.past_due,
    }
)


@router.get("/api/me/entitlement", response_model=EntitlementResponse)
async def entitlement(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> EntitlementResponse:
    """Return the current user's entitlement state."""
    if user.organization_id is None:
        return EntitlementResponse(
            status=None,
            trial_ends_at=None,
            current_period_end=None,
            plan=None,
            is_entitled=False,
        )

    result = await db.execute(
        select(Subscription).where(
            Subscription.organization_id == user.organization_id,
            Subscription.deleted_at.is_(None),
        )
    )
    sub = result.scalar_one_or_none()
    if sub is None:
        return EntitlementResponse(
            status=None,
            trial_ends_at=None,
            current_period_end=None,
            plan=None,
            is_entitled=False,
        )

    return EntitlementResponse(
        status=sub.status,
        trial_ends_at=sub.trial_ends_at,
        current_period_end=sub.current_period_end,
        plan=sub.plan,
        is_entitled=sub.status in _ENTITLED_STATUSES,
    )


@router.post("/api/billing/checkout", response_model=CheckoutSessionResponse)
async def checkout(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> CheckoutSessionResponse:
    """Create a Stripe Checkout session for adding a card to the trial."""
    if user.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User has no organization",
        )

    result = await db.execute(
        select(Subscription).where(
            Subscription.organization_id == user.organization_id,
            Subscription.deleted_at.is_(None),
        )
    )
    sub = result.scalar_one_or_none()
    if sub is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization has no subscription",
        )

    success_url = f"{settings.cors_origin}/settings/billing?checkout=success"
    cancel_url = f"{settings.cors_origin}/settings/billing?checkout=cancel"

    session = await stripe_service.create_checkout_session(
        organization_id=user.organization_id,
        plan=sub.plan,
        db=db,
        success_url=success_url,
        cancel_url=cancel_url,
    )
    if session.url is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Stripe did not return a checkout URL",
        )
    return CheckoutSessionResponse(url=session.url)


@router.post("/api/billing/portal", response_model=PortalSessionResponse)
async def portal(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> PortalSessionResponse:
    """Create a Stripe Customer Portal session for self-service billing."""
    if user.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User has no organization",
        )

    return_url = f"{settings.cors_origin}/settings/billing"
    session = await stripe_service.create_customer_portal_session(
        organization_id=user.organization_id,
        db=db,
        return_url=return_url,
    )
    return PortalSessionResponse(url=session.url)


@router.get("/api/billing/prices", response_model=PricesResponse)
async def prices() -> PricesResponse:
    """Return live Stripe pricing for all plans. Public, no auth required."""
    raw = await stripe_pricing.get_all_prices()
    return PricesResponse(prices={k: PriceInfo(**v) for k, v in raw.items()})
