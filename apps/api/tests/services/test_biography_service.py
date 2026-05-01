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


from datetime import date as _date

from grade_sight_api.schemas.biography import PatternTimelineRow
from grade_sight_api.services.biography_service import (
    PatternMeta,
    build_biography_sentence,
    build_pattern_timeline,
)


# ─── build_pattern_timeline ──────────────────────────────────────────

def test_build_pattern_timeline_orders_by_total_descending() -> None:
    monday = _date(2026, 4, 27)
    weeks = [monday - timedelta(days=7 * (5 - i)) for i in range(6)]
    bucketed = {
        "small": [0, 0, 0, 0, 0, 1],
        "big": [0, 1, 1, 1, 0, 1],
    }
    pattern_meta = {
        "small": PatternMeta(slug="small", name="Small", category_slug="execution", category_name="Execution"),
        "big": PatternMeta(slug="big", name="Big", category_slug="conceptual", category_name="Conceptual"),
    }
    rows = build_pattern_timeline(bucketed, pattern_meta, weeks)
    assert [r.slug for r in rows] == ["big", "small"]
    assert rows[0].total_count == 4
    assert rows[1].total_count == 1
    assert rows[0].trend == "recurring"
    assert rows[1].trend == "one_off"


def test_build_pattern_timeline_omits_unknown_pattern_meta() -> None:
    """If a slug appears in bucketed but not pattern_meta, skip it."""
    monday = _date(2026, 4, 27)
    weeks = [monday - timedelta(days=7 * (5 - i)) for i in range(6)]
    bucketed = {"unknown-slug": [0, 0, 0, 0, 0, 1]}
    rows = build_pattern_timeline(bucketed, {}, weeks)
    assert rows == []


# ─── build_biography_sentence ────────────────────────────────────────

def _row(slug: str, name: str, total: int, trend: str) -> PatternTimelineRow:
    return PatternTimelineRow(
        slug=slug,
        name=name,
        category_slug="execution",
        category_name="Execution",
        weeks=[],
        total_count=total,
        trend=trend,  # type: ignore[arg-type]
    )


def test_sentence_empty_timeline_no_assessments() -> None:
    s = build_biography_sentence([], "parent", "Marcus", n_assessments=0)
    assert s.kind == "fallback"
    assert "No assessments yet" in (s.text or "")


def test_sentence_empty_timeline_with_assessments() -> None:
    s = build_biography_sentence([], "parent", "Marcus", n_assessments=5)
    assert s.kind == "fallback"
    assert "clean" in (s.text or "").lower()
    assert "Marcus" in (s.text or "")


def test_sentence_recurring_parent_includes_coda() -> None:
    s = build_biography_sentence(
        [_row("neg-distrib", "Drops the negative when distributing", 7, "recurring")],
        "parent",
        "Marcus",
        n_assessments=4,
    )
    assert s.kind == "structured"
    assert "WHAT WE'RE SEEING IN MARCUS" in s.eyebrow
    assert s.lead and "keeps coming back" in s.lead.lower()
    assert s.accent and "7 occurrences" in s.accent
    assert s.coda and "five-minute" in s.coda


def test_sentence_recurring_teacher_no_coda() -> None:
    s = build_biography_sentence(
        [_row("neg-distrib", "Drops the negative", 8, "recurring")],
        "teacher",
        "David",
        n_assessments=3,
    )
    assert s.kind == "structured"
    assert "WHY DAVID IS ON YOUR LIST" in s.eyebrow
    assert s.coda is None


def test_sentence_new_pattern() -> None:
    s = build_biography_sentence(
        [_row("sign", "Sign tracking", 3, "new")],
        "parent",
        "Marcus",
        n_assessments=4,
    )
    assert s.kind == "structured"
    assert s.lead and "started showing up" in s.lead.lower()
    assert s.accent and "3 times" in s.accent


def test_sentence_fading() -> None:
    s = build_biography_sentence(
        [_row("frac", "Fraction conversion", 4, "fading")],
        "parent",
        "Marcus",
        n_assessments=4,
    )
    assert s.kind == "structured"
    assert s.lead and "mostly clean" in s.lead.lower()


def test_sentence_one_off() -> None:
    s = build_biography_sentence(
        [_row("ord", "Order of operations", 1, "one_off")],
        "parent",
        "Marcus",
        n_assessments=4,
    )
    assert s.kind == "structured"
    assert s.lead and "one miss" in s.lead.lower()
