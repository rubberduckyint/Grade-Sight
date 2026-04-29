"""Live Stripe price resolution with an in-process TTL cache.

Resolves the price IDs configured in `.env` (STRIPE_PRICE_PARENT_MONTHLY,
STRIPE_PRICE_TEACHER_MONTHLY) to their Stripe-canonical unit amounts so
the frontend never hardcodes dollar figures.

In-process TTL cache. Acceptable for single-instance deploys. Swap to
shared cache (Redis) when scaling horizontally.
"""

from __future__ import annotations

import time
from typing import TypedDict

import stripe

from ..config import settings


class PriceInfo(TypedDict):
    plan: str
    unit_amount: int
    currency: str
    interval: str


_TTL_SECONDS = 60 * 60  # 1h
_cache: dict[str, tuple[PriceInfo, float]] = {}


def _now() -> float:
    return time.monotonic()


def _clear_cache() -> None:
    """Test-only hook to reset the cache between cases."""
    _cache.clear()


async def _resolve(plan_label: str, price_id: str) -> PriceInfo:
    cached = _cache.get(price_id)
    if cached is not None and cached[1] > _now():
        return cached[0]

    price = await stripe.Price.retrieve_async(price_id, expand=["recurring"])
    interval = "month"
    recurring = getattr(price, "recurring", None)
    if recurring is not None:
        interval = getattr(recurring, "interval", "month") or "month"

    info: PriceInfo = {
        "plan": plan_label,
        "unit_amount": int(getattr(price, "unit_amount", 0) or 0),
        "currency": getattr(price, "currency", "usd"),
        "interval": interval,
    }
    _cache[price_id] = (info, _now() + _TTL_SECONDS)
    return info


async def get_all_prices() -> dict[str, PriceInfo]:
    """Return both plans, keyed by Plan enum string."""
    return {
        "parent_monthly": await _resolve(
            "parent_monthly", settings.stripe_price_parent_monthly
        ),
        "teacher_monthly": await _resolve(
            "teacher_monthly", settings.stripe_price_teacher_monthly
        ),
    }
