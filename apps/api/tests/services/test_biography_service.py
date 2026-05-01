"""Tests for biography_service helpers."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest

from grade_sight_api.services.biography_service import (
    BucketedProblem,
    bucket_problems_by_week,
    classify_trend,
)


# ─── classify_trend ──────────────────────────────────────────────────

def test_classify_trend_one_off() -> None:
    assert classify_trend([0, 0, 0, 0, 0, 1]) == "one_off"
    assert classify_trend([1, 0, 0, 0, 0, 0]) == "one_off"


def test_classify_trend_new_first_appearance_in_recent_two_weeks() -> None:
    assert classify_trend([0, 0, 0, 0, 1, 2]) == "new"


def test_classify_trend_recurring_when_three_or_more_weeks_and_last_nonzero() -> None:
    assert classify_trend([0, 1, 1, 1, 0, 1]) == "recurring"
    assert classify_trend([1, 0, 1, 0, 1, 1]) == "recurring"


def test_classify_trend_fading_when_early_only_and_recent_window_empty() -> None:
    assert classify_trend([2, 1, 1, 0, 0, 0]) == "fading"
    assert classify_trend([3, 0, 0, 0, 0, 0]) == "fading"


def test_classify_trend_new_wins_over_recurring_for_recent_first_appearance() -> None:
    counts = [0, 0, 0, 0, 2, 2]
    assert classify_trend(counts) == "new"


def test_classify_trend_short_window_one_off() -> None:
    assert classify_trend([0, 1]) == "one_off"


def test_classify_trend_short_window_new() -> None:
    assert classify_trend([1, 1]) == "new"


# ─── bucket_problems_by_week ─────────────────────────────────────────

def _bp(slug: str, when: datetime) -> BucketedProblem:
    return BucketedProblem(slug=slug, uploaded_at=when, is_correct=False)


def test_bucket_empty_input_returns_empty_dict() -> None:
    monday = date(2026, 4, 27)
    out = bucket_problems_by_week([], anchor_monday=monday, window_weeks=6)
    assert out == {}


def test_bucket_single_pattern_in_one_week() -> None:
    monday = date(2026, 4, 27)
    when = datetime(2026, 4, 28, 10, 0, tzinfo=timezone.utc)
    out = bucket_problems_by_week(
        [_bp("foo", when), _bp("foo", when)],
        anchor_monday=monday,
        window_weeks=6,
    )
    assert out["foo"] == [0, 0, 0, 0, 0, 2]


def test_bucket_problems_across_multiple_weeks() -> None:
    monday = date(2026, 4, 27)
    out = bucket_problems_by_week(
        [
            _bp("foo", datetime(2026, 4, 28, 10, 0, tzinfo=timezone.utc)),
            _bp("foo", datetime(2026, 4, 21, 10, 0, tzinfo=timezone.utc)),
            _bp("foo", datetime(2026, 3, 31, 10, 0, tzinfo=timezone.utc)),
        ],
        anchor_monday=monday,
        window_weeks=6,
    )
    # Anchor=Apr 27 (idx 5). Apr 21 is week of Apr 20 (idx 4). Mar 31 is week of Mar 30 (idx 1).
    assert out["foo"] == [0, 1, 0, 0, 1, 1]


def test_bucket_excludes_problems_before_window() -> None:
    monday = date(2026, 4, 27)
    out = bucket_problems_by_week(
        [_bp("foo", datetime(2026, 3, 16, 10, 0, tzinfo=timezone.utc))],
        anchor_monday=monday,
        window_weeks=6,
    )
    assert out == {}


def test_bucket_excludes_correct_problems() -> None:
    monday = date(2026, 4, 27)
    out = bucket_problems_by_week(
        [BucketedProblem(slug="foo", uploaded_at=datetime(2026, 4, 28, 10, 0, tzinfo=timezone.utc), is_correct=True)],
        anchor_monday=monday,
        window_weeks=6,
    )
    assert out == {}


def test_bucket_excludes_null_slugs() -> None:
    monday = date(2026, 4, 27)
    out = bucket_problems_by_week(
        [BucketedProblem(slug=None, uploaded_at=datetime(2026, 4, 28, 10, 0, tzinfo=timezone.utc), is_correct=False)],
        anchor_monday=monday,
        window_weeks=6,
    )
    assert out == {}
