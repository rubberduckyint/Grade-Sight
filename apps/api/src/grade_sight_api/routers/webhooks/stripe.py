"""POST /api/webhooks/stripe — Stripe webhook receiver with idempotency."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db import get_session
from ...models.audit_log import AuditLog
from ...models.organization import Organization
from ...models.subscription import Subscription, SubscriptionStatus
from ...models.subscription_event import SubscriptionEvent
from ...services import stripe_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/api/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="Stripe-Signature"),
    db: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    """Receive and dispatch Stripe webhook events.

    Idempotent via subscription_events (unique stripe_event_id). Signature
    verification is non-negotiable — unsigned/forged requests return 400.
    """
    if stripe_signature is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing Stripe-Signature header",
        )

    payload = await request.body()
    try:
        event = stripe_service.verify_webhook_signature(payload, stripe_signature)
    except (stripe.SignatureVerificationError, ValueError) as exc:
        logger.warning("Stripe webhook signature verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid signature",
        ) from exc

    existing = await db.execute(
        select(SubscriptionEvent).where(
            SubscriptionEvent.stripe_event_id == event.id
        )
    )
    if existing.scalar_one_or_none() is not None:
        logger.info(
            "Duplicate Stripe webhook (id=%s type=%s), skipping",
            event.id,
            event.type,
        )
        return {"received": "duplicate"}

    event_row = SubscriptionEvent(
        stripe_event_id=event.id,
        event_type=event.type,
        subscription_id=None,
        payload=event.to_dict(),
        processed_at=None,
    )
    db.add(event_row)
    await db.flush()

    try:
        await _dispatch(event, db, event_row)
    except Exception as exc:
        logger.exception(
            "Stripe webhook handler failed: event_id=%s type=%s",
            event.id,
            event.type,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"handler failed: {exc.__class__.__name__}",
        ) from exc

    event_row.processed_at = datetime.now(UTC)
    await db.flush()
    return {"received": "ok"}


async def _dispatch(
    event: stripe.Event, db: AsyncSession, event_row: SubscriptionEvent
) -> None:
    """Route a Stripe event to its handler."""
    handler = _HANDLERS.get(event.type)
    if handler is None:
        logger.info("Unhandled Stripe event type: %s", event.type)
        return
    await handler(event, db, event_row)


async def _handle_subscription_created(
    event: stripe.Event, db: AsyncSession, event_row: SubscriptionEvent
) -> None:
    """customer.subscription.created — link stripe_subscription_id to our row."""
    stripe_sub = event.data["object"]
    sub = await _find_subscription_by_customer(db, stripe_sub["customer"])
    if sub is None:
        logger.warning(
            "customer.subscription.created: no local subscription for customer=%s",
            stripe_sub["customer"],
        )
        return
    sub.stripe_subscription_id = stripe_sub["id"]
    sub.current_period_end = datetime.fromtimestamp(
        stripe_sub["current_period_end"], tz=UTC
    )
    sub.cancel_at_period_end = getattr(stripe_sub, "cancel_at_period_end", False)
    event_row.subscription_id = sub.id
    await _write_state_audit(db, sub, "stripe_subscription_linked", event.id)


async def _handle_subscription_updated(
    event: stripe.Event, db: AsyncSession, event_row: SubscriptionEvent
) -> None:
    """customer.subscription.updated — status change, period rollover, cancel-at-period-end, etc."""
    stripe_sub = event.data["object"]
    sub = await _find_subscription_by_customer(db, stripe_sub["customer"])
    if sub is None:
        logger.warning(
            "customer.subscription.updated: no local subscription for customer=%s",
            stripe_sub["customer"],
        )
        return
    new_status = SubscriptionStatus(stripe_sub["status"])
    sub.status = new_status
    sub.current_period_end = datetime.fromtimestamp(
        stripe_sub["current_period_end"], tz=UTC
    )
    sub.cancel_at_period_end = getattr(stripe_sub, "cancel_at_period_end", False)
    event_row.subscription_id = sub.id
    await _denormalize_org_status(db, sub.organization_id, new_status)
    await _write_state_audit(db, sub, f"subscription_{new_status.value}", event.id)


async def _handle_subscription_deleted(
    event: stripe.Event, db: AsyncSession, event_row: SubscriptionEvent
) -> None:
    """customer.subscription.deleted — subscription fully removed on Stripe side."""
    stripe_sub = event.data["object"]
    sub = await _find_subscription_by_customer(db, stripe_sub["customer"])
    if sub is None:
        return
    sub.status = SubscriptionStatus.canceled
    event_row.subscription_id = sub.id
    await _denormalize_org_status(db, sub.organization_id, SubscriptionStatus.canceled)
    await _write_state_audit(db, sub, "subscription_canceled", event.id)


async def _handle_payment_succeeded(
    event: stripe.Event, db: AsyncSession, event_row: SubscriptionEvent
) -> None:
    """invoice.payment_succeeded — log and audit."""
    invoice = event.data["object"]
    customer_id = getattr(invoice, "customer", None)
    sub = (
        await _find_subscription_by_customer(db, customer_id)
        if customer_id
        else None
    )
    if sub is not None:
        event_row.subscription_id = sub.id
        await _write_state_audit(
            db,
            sub,
            "payment_succeeded",
            event.id,
            extra={
                "invoice_id": getattr(invoice, "id", None),
                "amount_paid": getattr(invoice, "amount_paid", None),
            },
        )


async def _handle_payment_failed(
    event: stripe.Event, db: AsyncSession, event_row: SubscriptionEvent
) -> None:
    """invoice.payment_failed — mark past_due + audit."""
    invoice = event.data["object"]
    customer_id = getattr(invoice, "customer", None)
    sub = (
        await _find_subscription_by_customer(db, customer_id)
        if customer_id
        else None
    )
    if sub is None:
        return
    sub.status = SubscriptionStatus.past_due
    event_row.subscription_id = sub.id
    await _denormalize_org_status(db, sub.organization_id, SubscriptionStatus.past_due)
    await _write_state_audit(
        db,
        sub,
        "payment_failed",
        event.id,
        extra={"invoice_id": getattr(invoice, "id", None)},
    )


async def _handle_trial_will_end(
    event: stripe.Event, db: AsyncSession, event_row: SubscriptionEvent
) -> None:
    """customer.subscription.trial_will_end — no-op now; audit for future email spec."""
    stripe_sub = event.data["object"]
    sub = await _find_subscription_by_customer(db, stripe_sub["customer"])
    if sub is None:
        return
    event_row.subscription_id = sub.id
    await _write_state_audit(db, sub, "trial_ending_soon_signal_received", event.id)


_HANDLERS: dict[str, Any] = {
    "customer.subscription.created": _handle_subscription_created,
    "customer.subscription.updated": _handle_subscription_updated,
    "customer.subscription.deleted": _handle_subscription_deleted,
    "invoice.payment_succeeded": _handle_payment_succeeded,
    "invoice.payment_failed": _handle_payment_failed,
    "customer.subscription.trial_will_end": _handle_trial_will_end,
}


async def _find_subscription_by_customer(
    db: AsyncSession, stripe_customer_id: str
) -> Subscription | None:
    result = await db.execute(
        select(Subscription).where(
            Subscription.stripe_customer_id == stripe_customer_id,
            Subscription.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def _denormalize_org_status(
    db: AsyncSession, organization_id: UUID, new_status: SubscriptionStatus
) -> None:
    """Mirror subscriptions.status into organizations.subscription_status."""
    result = await db.execute(
        select(Organization).where(Organization.id == organization_id)
    )
    org = result.scalar_one_or_none()
    if org is not None:
        org.subscription_status = new_status


async def _write_state_audit(
    db: AsyncSession,
    sub: Subscription,
    action: str,
    stripe_event_id: str,
    extra: dict[str, Any] | None = None,
) -> None:
    """Record a state change to audit_log."""
    metadata: dict[str, Any] = {
        "subscription_id": str(sub.id),
        "stripe_event_id": stripe_event_id,
        "status": sub.status.value,
    }
    if extra is not None:
        metadata.update(extra)
    entry = AuditLog(
        organization_id=sub.organization_id,
        user_id=None,
        resource_type="subscription",
        resource_id=sub.id,
        action=action,
        event_metadata=metadata,
    )
    db.add(entry)
    await db.flush()
