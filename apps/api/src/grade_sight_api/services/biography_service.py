"""Biography aggregation + trend classification helpers."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Literal


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
