"""Biography aggregation + trend classification helpers."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Literal

from grade_sight_api.schemas.biography import (
    BiographySentence,
    PatternTimelineRow,
    WeekBucket,
)


Trend = Literal["recurring", "fading", "new", "one_off"]


@dataclass
class BucketedProblem:
    """Lightweight input shape for bucket_problems_by_week."""

    slug: str | None
    uploaded_at: datetime
    is_correct: bool


def bucket_problems_by_week(
    problems: list[BucketedProblem],
    *,
    anchor_monday: date,
    window_weeks: int,
) -> dict[str, list[int]]:
    """Bucket wrong, slug-bearing problems into N calendar-week buckets.

    Returns a dict mapping slug -> list-of-counts (oldest-first, length == window_weeks).
    Correct problems and null-slug problems are excluded. Problems before the
    window's first Monday are excluded.
    """
    if window_weeks <= 0:
        return {}

    mondays = [
        anchor_monday - timedelta(days=7 * (window_weeks - 1 - i))
        for i in range(window_weeks)
    ]
    first_monday = mondays[0]

    out: dict[str, list[int]] = {}
    for p in problems:
        if p.is_correct or not p.slug:
            continue
        ud = p.uploaded_at.date()
        days_since_monday = ud.weekday()
        problem_monday = ud - timedelta(days=days_since_monday)
        if problem_monday < first_monday:
            continue
        idx = (problem_monday - first_monday).days // 7
        if idx < 0 or idx >= window_weeks:
            continue
        bucket = out.setdefault(p.slug, [0] * window_weeks)
        bucket[idx] += 1

    return out


def classify_trend(week_counts: list[int]) -> Trend:
    """Classify a pattern's trend across N week buckets.

    Heuristics:
      - one_off: total == 1
      - new: first occurrence in last 2 weeks AND total >= 2
      - recurring: appears in >= 3 of N weeks AND last week non-zero
      - fading: appeared in early third AND absent from last 2 weeks
      - default: recurring
    """
    n = len(week_counts)
    total = sum(week_counts)

    if total == 0:
        return "one_off"
    if total == 1:
        return "one_off"

    first_nonzero = next((i for i, c in enumerate(week_counts) if c > 0), -1)
    nonzero_weeks = sum(1 for c in week_counts if c > 0)
    recent_window = week_counts[-2:] if n >= 2 else week_counts

    if first_nonzero >= max(0, n - 2) and total >= 2:
        return "new"

    if nonzero_weeks >= 3 and week_counts[-1] > 0:
        return "recurring"

    early_threshold = max(1, n // 3)
    if first_nonzero != -1 and first_nonzero < early_threshold and all(c == 0 for c in recent_window):
        return "fading"

    return "recurring"


@dataclass
class PatternMeta:
    """Meta about an error_pattern (slug + display info)."""

    slug: str
    name: str
    category_slug: str
    category_name: str


def _label_for_monday(d: date) -> str:
    """Format a Monday date as a short month-day label, e.g. 'Mar 17'."""
    # %-d is non-portable on Windows but project is macOS/Linux only.
    return d.strftime("%b %-d")


def build_pattern_timeline(
    bucketed: dict[str, list[int]],
    pattern_meta: dict[str, PatternMeta],
    weeks: list[date],
) -> list[PatternTimelineRow]:
    """Convert per-slug week counts into PatternTimelineRow objects.

    Sorted by total_count descending, ties broken by slug alphabetical.
    Slugs not present in `pattern_meta` are silently dropped (defensive).
    """
    rows: list[PatternTimelineRow] = []
    for slug, counts in bucketed.items():
        meta = pattern_meta.get(slug)
        if meta is None:
            continue
        total = sum(counts)
        if total == 0:
            continue
        week_buckets = [
            WeekBucket(
                week_start=monday,
                label=_label_for_monday(monday),
                count=counts[i] if i < len(counts) else 0,
            )
            for i, monday in enumerate(weeks)
        ]
        rows.append(
            PatternTimelineRow(
                slug=slug,
                name=meta.name,
                category_slug=meta.category_slug,
                category_name=meta.category_name,
                weeks=week_buckets,
                total_count=total,
                trend=classify_trend(counts),
            )
        )

    rows.sort(key=lambda r: (-r.total_count, r.slug))
    return rows


def build_biography_sentence(
    timeline: list[PatternTimelineRow],
    role: Literal["parent", "teacher"],
    first_name: str,
    *,
    n_assessments: int,
) -> BiographySentence:
    """Build the editorial sentence per spec §3a."""

    eyebrow = (
        f"WHY {first_name.upper()} IS ON YOUR LIST"
        if role == "teacher"
        else f"WHAT WE'RE SEEING IN {first_name.upper()} THIS MONTH"
    )

    if not timeline:
        text = (
            f"No assessments yet for {first_name}."
            if n_assessments == 0
            else f"{first_name} has been clean across the last {n_assessments} assessments."
        )
        return BiographySentence(kind="fallback", eyebrow=eyebrow, text=text)

    dominant = timeline[0]  # already sorted by total descending

    if dominant.trend == "recurring":
        return BiographySentence(
            kind="structured",
            eyebrow=eyebrow,
            lead=f"One pattern keeps coming back: {dominant.name.lower()}.",
            accent=f"{dominant.total_count} occurrences in the last {n_assessments} assessments.",
            coda=("That's a five-minute conversation, not a tutor." if role == "parent" else None),
        )

    if dominant.trend == "new":
        return BiographySentence(
            kind="structured",
            eyebrow=eyebrow,
            lead=f"{dominant.name} just started showing up.",
            accent=f"{dominant.total_count} times in the last 2 weeks.",
        )

    if dominant.trend == "fading":
        return BiographySentence(
            kind="structured",
            eyebrow=eyebrow,
            lead=f"{first_name} is mostly clean. The misses don't repeat.",
        )

    # one_off
    return BiographySentence(
        kind="structured",
        eyebrow=eyebrow,
        lead=f"Only one miss worth flagging: {dominant.name.lower()}.",
    )
