"""Model tests for DiagnosticReview."""
from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.assessment import Assessment, AssessmentStatus
from grade_sight_api.models.diagnostic_review import DiagnosticReview
from grade_sight_api.models.organization import Organization
from grade_sight_api.models.student import Student
from grade_sight_api.models.user import User, UserRole


async def _seed_minimal(session: AsyncSession) -> tuple[User, Assessment]:
    org = Organization(name="t")
    session.add(org)
    await session.flush()
    user = User(
        clerk_id=f"u_{uuid4().hex[:8]}",
        email=f"{uuid4().hex[:6]}@x.test",
        role=UserRole.teacher,
        first_name="T",
        last_name="T",
        organization_id=org.id,
    )
    student = Student(
        created_by_user_id=None,  # set after user flush
        full_name="S",
        organization_id=org.id,
    )
    session.add(user)
    await session.flush()
    student.created_by_user_id = user.id
    session.add(student)
    await session.flush()
    assessment = Assessment(
        student_id=student.id,
        organization_id=org.id,
        uploaded_by_user_id=user.id,
        status=AssessmentStatus.completed,
    )
    session.add(assessment)
    await session.flush()
    return user, assessment


@pytest.mark.db
async def test_default_values(async_session: AsyncSession) -> None:
    user, assessment = await _seed_minimal(async_session)
    review = DiagnosticReview(
        assessment_id=assessment.id,
        problem_number=3,
        marked_correct=True,
        reviewed_by=user.id,
    )
    async_session.add(review)
    await async_session.flush()

    fetched = await async_session.scalar(
        select(DiagnosticReview).where(DiagnosticReview.id == review.id)
    )
    assert fetched is not None
    assert fetched.marked_correct is True
    assert fetched.override_pattern_id is None
    assert fetched.note is None
    assert fetched.deleted_at is None
    assert fetched.created_at is not None
    assert fetched.reviewed_at is not None


@pytest.mark.db
async def test_unique_active_review_per_problem(async_session: AsyncSession) -> None:
    """Two active reviews for the same (assessment, problem) violate the partial index."""
    user, assessment = await _seed_minimal(async_session)

    first = DiagnosticReview(
        assessment_id=assessment.id,
        problem_number=5,
        marked_correct=True,
        reviewed_by=user.id,
    )
    async_session.add(first)
    await async_session.flush()

    duplicate = DiagnosticReview(
        assessment_id=assessment.id,
        problem_number=5,
        marked_correct=True,
        reviewed_by=user.id,
    )
    async_session.add(duplicate)
    with pytest.raises(IntegrityError):
        await async_session.flush()


@pytest.mark.db
async def test_soft_deleted_does_not_block_new_review(async_session: AsyncSession) -> None:
    """After soft-deleting a review, a new active one for the same (assessment, problem) is allowed."""
    from datetime import datetime, timezone

    user, assessment = await _seed_minimal(async_session)

    first = DiagnosticReview(
        assessment_id=assessment.id,
        problem_number=7,
        marked_correct=True,
        reviewed_by=user.id,
        deleted_at=datetime.now(tz=timezone.utc),
    )
    async_session.add(first)
    await async_session.flush()

    second = DiagnosticReview(
        assessment_id=assessment.id,
        problem_number=7,
        marked_correct=True,
        reviewed_by=user.id,
    )
    async_session.add(second)
    await async_session.flush()  # should NOT raise

    rows = (
        await async_session.scalars(
            select(DiagnosticReview).where(DiagnosticReview.assessment_id == assessment.id)
        )
    ).all()
    assert len(rows) == 2
