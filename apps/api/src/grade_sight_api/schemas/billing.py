"""Response schemas for /api/me/entitlement and /api/billing/* endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from ..models.subscription import Plan, SubscriptionStatus


class EntitlementResponse(BaseModel):
    """Returned by GET /api/me/entitlement for frontend UI state."""

    status: SubscriptionStatus | None
    trial_ends_at: datetime | None
    current_period_end: datetime | None
    plan: Plan | None
    is_entitled: bool
    model_config = ConfigDict(from_attributes=True)


class CheckoutSessionResponse(BaseModel):
    """Returned by POST /api/billing/checkout."""

    url: str


class PortalSessionResponse(BaseModel):
    """Returned by POST /api/billing/portal."""

    url: str


class PriceInfo(BaseModel):
    """A single plan's live Stripe pricing."""

    plan: str
    unit_amount: int
    currency: str
    interval: str


class PricesResponse(BaseModel):
    """Returned by GET /api/billing/prices. Public, no-auth."""

    prices: dict[str, PriceInfo]
