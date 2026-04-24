"""Entitlement helpers.

has_active_subscription is the single entry point every future gated
feature calls. It reads from the denormalized organizations.subscription_status
column — no Stripe call, no join, no cache. Webhook handlers are
responsible for keeping that column in sync.

reconcile_subscription pulls fresh state from Stripe and overwrites our
rows. Used for explicit drift repair (admin endpoint and nightly cron,
both deferred to later specs).
"""

from __future__ import annotations

import logging
from uuid import UUID

import stripe
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.organization import Organization
from ..models.subscription import Subscription, SubscriptionStatus

logger = logging.getLogger(__name__)

_ENTITLED_STATUSES: frozenset[SubscriptionStatus] = frozenset(
    {
        SubscriptionStatus.trialing,
        SubscriptionStatus.active,
        SubscriptionStatus.past_due,
    }
)


async def has_active_subscription(
    organization_id: UUID,
    db: AsyncSession,
) -> bool:
    """Return True if the org has an entitled subscription status.

    Reads organizations.subscription_status. past_due is entitled — Stripe's
    smart retries handle the dunning window; a terminal canceled transition
    arrives via webhook and flips the answer to False.
    """
    result = await db.execute(
        select(Organization.subscription_status).where(
            Organization.id == organization_id,
        )
    )
    status = result.scalar_one_or_none()
    return status in _ENTITLED_STATUSES


async def reconcile_subscription(
    organization_id: UUID,
    db: AsyncSession,
) -> Subscription | None:
    """Pull fresh state from Stripe and overwrite our rows.

    Only acts if our subscription row has a stripe_subscription_id (i.e.,
    the user has already added a card — pre-card trial state is locally
    maintained).

    Returns the updated Subscription, or None if no subscription row exists.
    """
    result = await db.execute(
        select(Subscription).where(
            Subscription.organization_id == organization_id,
            Subscription.deleted_at.is_(None),
        )
    )
    sub = result.scalar_one_or_none()
    if sub is None:
        return None
    if sub.stripe_subscription_id is None:
        return sub

    stripe_sub = await stripe.Subscription.retrieve_async(sub.stripe_subscription_id)
    logger.info(
        "reconcile org=%s stripe_status=%s local_status=%s",
        organization_id,
        stripe_sub.status,
        sub.status.value,
    )
    new_status = SubscriptionStatus(stripe_sub.status)
    sub.status = new_status
    sub.current_period_end = stripe_sub.current_period_end  # type: ignore[attr-defined]
    sub.cancel_at_period_end = stripe_sub.cancel_at_period_end

    org_result = await db.execute(
        select(Organization).where(Organization.id == organization_id)
    )
    org = org_result.scalar_one_or_none()
    if org is not None:
        org.subscription_status = new_status

    await db.flush()
    return sub
