"""Tests for the Claude cost calculator."""

from __future__ import annotations

from decimal import Decimal

import pytest

from grade_sight_api.services.claude_service import compute_cost


def test_compute_cost_haiku_small() -> None:
    # 1M input tokens x $0.80 = $0.80; 100K output x $4.00 / 1M = $0.40; total $1.20
    cost = compute_cost(
        model="claude-haiku-4-5-20251001",
        tokens_input=1_000_000,
        tokens_output=100_000,
    )
    assert cost == Decimal("1.20")


def test_compute_cost_sonnet_small() -> None:
    # 1000 input x $3 / 1M = $0.003; 500 output x $15 / 1M = $0.0075; total $0.0105
    cost = compute_cost(
        model="claude-sonnet-4-6",
        tokens_input=1_000,
        tokens_output=500,
    )
    assert cost == Decimal("0.010500")


def test_compute_cost_zero_tokens() -> None:
    cost = compute_cost(
        model="claude-haiku-4-5-20251001",
        tokens_input=0,
        tokens_output=0,
    )
    assert cost == Decimal("0")


def test_compute_cost_unknown_model_raises() -> None:
    with pytest.raises(ValueError, match="No price entry"):
        compute_cost(
            model="claude-bogus",
            tokens_input=1,
            tokens_output=1,
        )
