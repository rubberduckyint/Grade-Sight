"""Tests for the diagnostic-review overlay service."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest

from grade_sight_api.schemas.assessments import ProblemObservation
from grade_sight_api.services.diagnostic_review_service import (
    OverlayInputs,
    apply_reviews_to_problems,
)


def _make_problem(
    *, problem_number: int, is_correct: bool, error_pattern_slug: str | None = None
) -> ProblemObservation:
    return ProblemObservation(
        id=uuid4(),
        problem_number=problem_number,
        page_number=1,
        student_answer="2x",
        correct_answer="x + 2",
        is_correct=is_correct,
        error_pattern_slug=error_pattern_slug,
        error_pattern_name=("name-" + error_pattern_slug) if error_pattern_slug else None,
        error_category_slug="execution",
        error_description=None,
        solution_steps=None,
        review=None,
    )


def _review_row(
    *,
    review_id: UUID,
    assessment_id: UUID,
    problem_number: int,
    marked_correct: bool = False,
    override_pattern_id: UUID | None = None,
    note: str | None = None,
    reviewer_name: str = "Jane Teacher",
) -> object:
    """Lightweight row stub — must match the fields the service reads."""

    class Row:
        def __init__(self) -> None:
            self.id = review_id
            self.assessment_id = assessment_id
            self.problem_number = problem_number
            self.marked_correct = marked_correct
            self.override_pattern_id = override_pattern_id
            self.note = note
            self.reviewed_at = datetime(2026, 4, 30, 12, 0, tzinfo=timezone.utc)
            self.reviewer_name = reviewer_name

    return Row()


def _pattern_index_with(
    pattern_id: UUID,
    *,
    slug: str,
    name: str,
    category_slug: str,
    category_name: str,
) -> dict[UUID, object]:
    class Pat:
        def __init__(self) -> None:
            self.id = pattern_id
            self.slug = slug
            self.name = name
            self.category_slug = category_slug
            self.category_name = category_name

    return {pattern_id: Pat()}


def test_no_review_passes_through_unchanged() -> None:
    p = _make_problem(problem_number=1, is_correct=False, error_pattern_slug="foo")
    out = apply_reviews_to_problems(
        OverlayInputs(problems=[p], reviews=[], pattern_index={})
    )
    assert len(out) == 1
    assert out[0].review is None
    assert out[0].is_correct is False
    assert out[0].error_pattern_slug == "foo"


def test_mark_correct_flips_is_correct() -> None:
    aid = uuid4()
    p = _make_problem(problem_number=4, is_correct=False, error_pattern_slug="neg-distrib")
    review = _review_row(
        review_id=uuid4(),
        assessment_id=aid,
        problem_number=4,
        marked_correct=True,
    )
    out = apply_reviews_to_problems(
        OverlayInputs(problems=[p], reviews=[review], pattern_index={})
    )
    assert out[0].is_correct is True
    assert out[0].error_pattern_slug == "neg-distrib"  # pattern unchanged
    assert out[0].review is not None
    assert out[0].review.marked_correct is True


def test_override_pattern_rewrites_slug_name_category() -> None:
    aid = uuid4()
    pat_id = uuid4()
    p = _make_problem(problem_number=2, is_correct=False, error_pattern_slug="auto-slug")
    pattern_index = _pattern_index_with(
        pat_id, slug="override-slug", name="Override Name", category_slug="conceptual", category_name="Conceptual"
    )
    review = _review_row(
        review_id=uuid4(),
        assessment_id=aid,
        problem_number=2,
        override_pattern_id=pat_id,
    )
    out = apply_reviews_to_problems(
        OverlayInputs(problems=[p], reviews=[review], pattern_index=pattern_index)
    )
    assert out[0].is_correct is False
    assert out[0].error_pattern_slug == "override-slug"
    assert out[0].error_pattern_name == "Override Name"
    assert out[0].error_category_slug == "conceptual"
    assert out[0].review is not None
    assert out[0].review.override_pattern_id == pat_id


def test_mismatched_problem_numbers_pass_through() -> None:
    aid = uuid4()
    p = _make_problem(problem_number=1, is_correct=False)
    review = _review_row(review_id=uuid4(), assessment_id=aid, problem_number=99, marked_correct=True)
    out = apply_reviews_to_problems(
        OverlayInputs(problems=[p], reviews=[review], pattern_index={})
    )
    assert out[0].review is None
    assert out[0].is_correct is False


def test_multiple_reviews_compose_independently() -> None:
    aid = uuid4()
    pat_id = uuid4()
    p1 = _make_problem(problem_number=1, is_correct=False, error_pattern_slug="auto-1")
    p2 = _make_problem(problem_number=2, is_correct=False, error_pattern_slug="auto-2")
    p3 = _make_problem(problem_number=3, is_correct=True)
    pattern_index = _pattern_index_with(
        pat_id, slug="x", name="X", category_slug="execution", category_name="Execution"
    )
    review1 = _review_row(review_id=uuid4(), assessment_id=aid, problem_number=1, marked_correct=True)
    review2 = _review_row(review_id=uuid4(), assessment_id=aid, problem_number=2, override_pattern_id=pat_id)
    out = apply_reviews_to_problems(
        OverlayInputs(problems=[p1, p2, p3], reviews=[review1, review2], pattern_index=pattern_index)
    )
    assert out[0].is_correct is True
    assert out[0].review is not None
    assert out[1].is_correct is False
    assert out[1].error_pattern_slug == "x"
    assert out[1].review is not None
    assert out[2].review is None  # untouched
