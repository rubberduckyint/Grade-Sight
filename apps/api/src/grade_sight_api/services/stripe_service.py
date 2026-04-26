"""Stripe SDK wrapper — every Stripe API call goes through here.

Each function logs to Python's logging module (INFO) and writes an
audit_log entry for user-visible state changes. Raw API call tracking
(a stripe_api_calls table analog to llm_call_logs) is deferred.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

import stripe
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models.subscription import Plan, Subscription
from ._logging import write_audit_log
from .call_context import CallContext

logger = logging.getLogger(__name__)

# Initialize Stripe with our secret key at module import.
stripe.api_key = settings.stripe_secret_key


def _price_id_for_plan(plan: Plan) -> str:
    """Map our Plan enum to the env-configured Stripe price ID."""
    if plan == Plan.parent_monthly:
        return settings.stripe_price_parent_monthly
    if plan == Plan.teacher_monthly:
        return settings.stripe_price_teacher_monthly
    raise ValueError(f"No Stripe price configured for plan: {plan}")


async def create_customer(
    email: str,
    organization_id: UUID,
    db: AsyncSession,
) -> stripe.Customer:
    """Create a Stripe customer for an organization."""
    logger.info("stripe.customers.create org=%s email=%s", organization_id, email)
    customer = await stripe.Customer.create_async(
        email=email,
        metadata={"organization_id": str(organization_id)},
    )
    ctx = CallContext(
        organization_id=organization_id,
        user_id=None,
        request_type="stripe_customer_create",
        contains_pii=False,
    )
    await write_audit_log(
        db,
        ctx=ctx,
        resource_type="subscription",
        resource_id=None,
        action="stripe_customer_created",
        extra={"stripe_customer_id": customer.id, "email": email},
    )
    return customer


async def create_checkout_session(
    organization_id: UUID,
    plan: Plan,
    db: AsyncSession,
    success_url: str,
    cancel_url: str,
) -> stripe.checkout.Session:
    """Create a hosted Checkout session for adding a card during trial."""
    sub = await _get_subscription(db, organization_id)
    if sub is None:
        raise RuntimeError(
            f"Cannot create checkout session: no subscription for org {organization_id}"
        )

    logger.info(
        "stripe.checkout.Session.create org=%s customer=%s plan=%s",
        organization_id,
        sub.stripe_customer_id,
        plan,
    )
    subscription_data: dict[str, Any] = {}
    if sub.trial_ends_at is not None:
        subscription_data["trial_end"] = int(sub.trial_ends_at.timestamp())

    session = await stripe.checkout.Session.create_async(
        customer=sub.stripe_customer_id,
        mode="subscription",
        line_items=[{"price": _price_id_for_plan(plan), "quantity": 1}],
        subscription_data=subscription_data,  # type: ignore[arg-type]
        success_url=success_url,
        cancel_url=cancel_url,
    )
    ctx = CallContext(
        organization_id=organization_id,
        user_id=None,
        request_type="stripe_checkout_create",
        contains_pii=False,
    )
    await write_audit_log(
        db,
        ctx=ctx,
        resource_type="subscription",
        resource_id=None,
        action="stripe_checkout_session_started",
        extra={
            "session_id": session.id,
            "plan": plan.value,
        },
    )
    return session


async def create_customer_portal_session(
    organization_id: UUID,
    db: AsyncSession,
    return_url: str,
) -> stripe.billing_portal.Session:
    """Create a Customer Portal session for self-service billing."""
    sub = await _get_subscription(db, organization_id)
    if sub is None:
        raise RuntimeError(
            f"Cannot create portal session: no subscription for org {organization_id}"
        )

    logger.info(
        "stripe.billing_portal.Session.create org=%s customer=%s",
        organization_id,
        sub.stripe_customer_id,
    )
    session = await stripe.billing_portal.Session.create_async(
        customer=sub.stripe_customer_id,
        return_url=return_url,
    )
    ctx = CallContext(
        organization_id=organization_id,
        user_id=None,
        request_type="stripe_portal_session_create",
        contains_pii=False,
    )
    await write_audit_log(
        db,
        ctx=ctx,
        resource_type="subscription",
        resource_id=None,
        action="stripe_portal_session_started",
        extra={"session_id": session.id},
    )
    return session


def verify_webhook_signature(payload: bytes, signature: str) -> stripe.Event:
    """Verify a webhook signature and return the parsed event.

    Raises stripe.SignatureVerificationError on invalid signatures.
    """
    return stripe.Webhook.construct_event(  # type: ignore[no-untyped-call, no-any-return]
        payload=payload,
        sig_header=signature,
        secret=settings.stripe_webhook_secret,
    )


async def _get_subscription(
    db: AsyncSession,
    organization_id: UUID,
) -> Subscription | None:
    """Fetch the subscription row for an org (internal helper)."""
    result = await db.execute(
        select(Subscription).where(
            Subscription.organization_id == organization_id,
            Subscription.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()
