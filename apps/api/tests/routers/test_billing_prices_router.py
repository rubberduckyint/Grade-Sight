"""Tests for the public GET /api/billing/prices endpoint."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from httpx import ASGITransport, AsyncClient

from grade_sight_api.main import app
from grade_sight_api.services import stripe_pricing


def _fake_price(unit_amount: int, currency: str = "usd", interval: str = "month") -> MagicMock:
    price = MagicMock()
    price.unit_amount = unit_amount
    price.currency = currency
    recurring = MagicMock()
    recurring.interval = interval
    price.recurring = recurring
    return price


async def test_prices_endpoint_returns_both_plans() -> None:
    stripe_pricing._clear_cache()

    with patch.object(
        stripe_pricing.stripe.Price,
        "retrieve_async",
        new=AsyncMock(side_effect=[_fake_price(1500), _fake_price(2900)]),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/api/billing/prices")

    assert response.status_code == 200
    body = response.json()
    assert "prices" in body
    assert set(body["prices"].keys()) == {"parent_monthly", "teacher_monthly"}
    assert body["prices"]["parent_monthly"]["unit_amount"] == 1500
    assert body["prices"]["parent_monthly"]["currency"] == "usd"
    assert body["prices"]["parent_monthly"]["interval"] == "month"
    assert body["prices"]["teacher_monthly"]["unit_amount"] == 2900


async def test_prices_endpoint_does_not_require_auth() -> None:
    """The endpoint is public — no Authorization header on the request."""
    stripe_pricing._clear_cache()

    with patch.object(
        stripe_pricing.stripe.Price,
        "retrieve_async",
        new=AsyncMock(side_effect=[_fake_price(1500), _fake_price(2900)]),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/api/billing/prices")

    assert response.status_code == 200
