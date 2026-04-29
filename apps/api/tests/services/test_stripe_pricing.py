"""Tests for stripe_pricing service: cache hit/miss + response shape."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from grade_sight_api.services import stripe_pricing


def _fake_price(unit_amount: int, currency: str = "usd", interval: str = "month") -> MagicMock:
    """Build a stripe.Price-like mock with the fields stripe_pricing reads."""
    price = MagicMock()
    price.unit_amount = unit_amount
    price.currency = currency
    recurring = MagicMock()
    recurring.interval = interval
    price.recurring = recurring
    return price


@pytest.fixture(autouse=True)
def _reset_cache() -> None:
    """Each test starts with a clean cache."""
    stripe_pricing._clear_cache()


async def test_get_all_prices_returns_both_plans() -> None:
    parent_price = _fake_price(1500)
    teacher_price = _fake_price(2900)

    with patch.object(
        stripe_pricing.stripe.Price,
        "retrieve_async",
        new=AsyncMock(side_effect=[parent_price, teacher_price]),
    ):
        prices = await stripe_pricing.get_all_prices()

    assert set(prices.keys()) == {"parent_monthly", "teacher_monthly"}
    assert prices["parent_monthly"]["unit_amount"] == 1500
    assert prices["parent_monthly"]["currency"] == "usd"
    assert prices["parent_monthly"]["interval"] == "month"
    assert prices["parent_monthly"]["plan"] == "parent_monthly"
    assert prices["teacher_monthly"]["unit_amount"] == 2900


async def test_cache_hit_skips_second_stripe_call() -> None:
    mock_retrieve = AsyncMock(side_effect=[_fake_price(1500), _fake_price(2900)])

    with patch.object(stripe_pricing.stripe.Price, "retrieve_async", new=mock_retrieve):
        await stripe_pricing.get_all_prices()
        await stripe_pricing.get_all_prices()

    # Two unique price IDs, each fetched exactly once across both calls.
    assert mock_retrieve.await_count == 2


async def test_cache_expiry_triggers_refetch() -> None:
    # 4 prices: parent+teacher at t=0, parent+teacher at t=TTL+1.
    mock_retrieve = AsyncMock(
        side_effect=[
            _fake_price(1500),
            _fake_price(2900),
            _fake_price(1700),
            _fake_price(3100),
        ]
    )

    with (
        patch.object(stripe_pricing.stripe.Price, "retrieve_async", new=mock_retrieve),
        patch.object(stripe_pricing, "_now") as fake_now,
    ):
        # First call at t=0 — populates cache.
        fake_now.return_value = 0.0
        first = await stripe_pricing.get_all_prices()
        assert first["parent_monthly"]["unit_amount"] == 1500

        # Second call past the TTL boundary — both plans refetched.
        fake_now.return_value = stripe_pricing._TTL_SECONDS + 1
        second = await stripe_pricing.get_all_prices()
        assert second["parent_monthly"]["unit_amount"] == 1700
        assert second["teacher_monthly"]["unit_amount"] == 3100


async def test_missing_recurring_falls_back_to_month_interval() -> None:
    price = _fake_price(1500)
    price.recurring = None

    with patch.object(
        stripe_pricing.stripe.Price,
        "retrieve_async",
        new=AsyncMock(side_effect=[price, _fake_price(2900)]),
    ):
        prices = await stripe_pricing.get_all_prices()

    assert prices["parent_monthly"]["interval"] == "month"
