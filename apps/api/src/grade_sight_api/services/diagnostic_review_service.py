"""Overlay teacher diagnostic reviews onto auto-graded problem observations."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Mapping, Protocol
from uuid import UUID

from grade_sight_api.schemas.assessments import ProblemObservationResponse
from grade_sight_api.schemas.diagnostic_reviews import DiagnosticReviewOut


class _ReviewRow(Protocol):
    """Structural type — any object exposing the fields below works as a review row."""

    id: UUID
    problem_number: int
    marked_correct: bool
    override_pattern_id: UUID | None
    note: str | None
    reviewed_at: datetime
    reviewer_name: str


class _PatternRow(Protocol):
    id: UUID
    slug: str
    name: str
    category_slug: str
    category_name: str


@dataclass
class OverlayInputs:
    problems: list[ProblemObservationResponse]
    reviews: list[_ReviewRow]
    pattern_index: Mapping[UUID, _PatternRow]


def apply_reviews_to_problems(inputs: OverlayInputs) -> list[ProblemObservationResponse]:
    """Return the problems with effective state applied and review sub-objects populated."""

    by_number: dict[int, _ReviewRow] = {r.problem_number: r for r in inputs.reviews}
    out: list[ProblemObservationResponse] = []

    for problem in inputs.problems:
        review = by_number.get(problem.problem_number)
        if review is None:
            out.append(problem.model_copy(update={"review": None}))
            continue

        review_out = _build_review_out(review, inputs.pattern_index)
        updates: dict[str, object] = {"review": review_out}

        if review.marked_correct:
            updates["is_correct"] = True
        elif review.override_pattern_id is not None:
            override = inputs.pattern_index.get(review.override_pattern_id)
            if override is not None:
                updates["error_pattern_slug"] = override.slug
                updates["error_pattern_name"] = override.name
                updates["error_category_slug"] = override.category_slug

        out.append(problem.model_copy(update=updates))

    return out


def _build_review_out(
    review: _ReviewRow, pattern_index: Mapping[UUID, _PatternRow]
) -> DiagnosticReviewOut:
    override_pattern = (
        pattern_index.get(review.override_pattern_id)
        if review.override_pattern_id is not None
        else None
    )
    return DiagnosticReviewOut(
        id=review.id,
        marked_correct=review.marked_correct,
        override_pattern_id=review.override_pattern_id,
        override_pattern_slug=override_pattern.slug if override_pattern else None,
        override_pattern_name=override_pattern.name if override_pattern else None,
        note=review.note,
        reviewed_at=review.reviewed_at,
        reviewed_by_name=review.reviewer_name,
    )
