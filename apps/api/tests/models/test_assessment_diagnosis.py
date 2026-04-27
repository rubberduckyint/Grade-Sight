"""Tests for AssessmentDiagnosis + ProblemObservation models."""

from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.assessment import Assessment, AssessmentStatus
from grade_sight_api.models.assessment_diagnosis import AssessmentDiagnosis
from grade_sight_api.models.error_category import ErrorCategory
from grade_sight_api.models.error_pattern import ErrorPattern
from grade_sight_api.models.error_subcategory import ErrorSubcategory
from grade_sight_api.models.organization import Organization
from grade_sight_api.models.problem_observation import ProblemObservation
from grade_sight_api.models.student import Student
from grade_sight_api.models.user import User, UserRole


async def _seed_assessment_and_pattern(
    session: AsyncSession,
) -> tuple[Organization, Assessment, ErrorPattern]:
    org = Organization(name="Test Org")
    session.add(org)
    await session.flush()
    user = User(
        clerk_id=f"user_{uuid4().hex[:12]}",
        email=f"{uuid4().hex[:8]}@example.com",
        role=UserRole.teacher,
        first_name="Test",
        last_name="Teacher",
        organization_id=org.id,
    )
    session.add(user)
    await session.flush()
    student = Student(
        created_by_user_id=user.id,
        organization_id=org.id,
        full_name="Ada",
    )
    session.add(student)
    await session.flush()
    asmt = Assessment(
        student_id=student.id,
        organization_id=org.id,
        uploaded_by_user_id=user.id,
        status=AssessmentStatus.pending,
    )
    session.add(asmt)
    cat = ErrorCategory(
        slug="execution",
        name="Execution",
        definition="execution errors",
        distinguishing_marker="visible math step error",
        severity_rank=2,
    )
    session.add(cat)
    await session.flush()
    sub = ErrorSubcategory(
        slug="execution-arithmetic",
        category_id=cat.id,
        name="Arithmetic",
        definition="arithmetic mistakes",
    )
    session.add(sub)
    await session.flush()
    pat = ErrorPattern(
        slug="sign-error-distribution",
        subcategory_id=sub.id,
        name="Sign error in distribution",
        description="Lost a sign while distributing",
        canonical_example="-2(x-4)=6 -> -2x-8=6",
        severity_hint="medium",
    )
    session.add(pat)
    await session.flush()
    return org, asmt, pat


async def test_diagnosis_round_trip(async_session: AsyncSession) -> None:
    org, asmt, _ = await _seed_assessment_and_pattern(async_session)
    diag = AssessmentDiagnosis(
        assessment_id=asmt.id,
        organization_id=org.id,
        model="claude-sonnet-4-6",
        prompt_version="v1",
        tokens_input=12345,
        tokens_output=678,
        tokens_cache_read=10000,
        tokens_cache_creation=2345,
        cost_usd=Decimal("0.045123"),
        latency_ms=23456,
        overall_summary="3 of 5 correct.",
    )
    async_session.add(diag)
    await async_session.flush()

    rows = (
        await async_session.execute(
            select(AssessmentDiagnosis).where(
                AssessmentDiagnosis.assessment_id == asmt.id
            )
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].model == "claude-sonnet-4-6"
    assert rows[0].cost_usd == Decimal("0.045123")
    assert rows[0].overall_summary == "3 of 5 correct."


async def test_diagnosis_unique_per_assessment(
    async_session: AsyncSession,
) -> None:
    org, asmt, _ = await _seed_assessment_and_pattern(async_session)
    diag_a = AssessmentDiagnosis(
        assessment_id=asmt.id,
        organization_id=org.id,
        model="claude-sonnet-4-6",
        prompt_version="v1",
        tokens_input=1,
        tokens_output=1,
        cost_usd=Decimal("0.01"),
        latency_ms=100,
    )
    diag_b = AssessmentDiagnosis(
        assessment_id=asmt.id,
        organization_id=org.id,
        model="claude-sonnet-4-6",
        prompt_version="v1",
        tokens_input=2,
        tokens_output=2,
        cost_usd=Decimal("0.02"),
        latency_ms=200,
    )
    async_session.add(diag_a)
    async_session.add(diag_b)

    with pytest.raises(IntegrityError):
        await async_session.flush()


async def test_problem_observation_round_trip(
    async_session: AsyncSession,
) -> None:
    org, asmt, pat = await _seed_assessment_and_pattern(async_session)
    diag = AssessmentDiagnosis(
        assessment_id=asmt.id,
        organization_id=org.id,
        model="claude-sonnet-4-6",
        prompt_version="v1",
        tokens_input=1,
        tokens_output=1,
        cost_usd=Decimal("0.01"),
        latency_ms=100,
    )
    async_session.add(diag)
    await async_session.flush()

    obs_correct = ProblemObservation(
        diagnosis_id=diag.id,
        organization_id=org.id,
        problem_number=1,
        page_number=1,
        student_answer="x = 7",
        correct_answer="x = 7",
        is_correct=True,
    )
    obs_wrong = ProblemObservation(
        diagnosis_id=diag.id,
        organization_id=org.id,
        problem_number=2,
        page_number=1,
        student_answer="x = 5",
        correct_answer="x = 7",
        is_correct=False,
        error_pattern_id=pat.id,
        error_description="Lost a negative sign during distribution.",
        solution_steps="1. -2(x-4)=6\n2. -2x+8=6\n3. x=1",
    )
    async_session.add(obs_correct)
    async_session.add(obs_wrong)
    await async_session.flush()

    rows = (
        await async_session.execute(
            select(ProblemObservation)
            .where(ProblemObservation.diagnosis_id == diag.id)
            .order_by(ProblemObservation.problem_number)
        )
    ).scalars().all()
    assert len(rows) == 2
    assert rows[0].is_correct is True
    assert rows[0].error_pattern_id is None
    assert rows[1].is_correct is False
    assert rows[1].error_pattern_id == pat.id
    assert rows[1].solution_steps is not None
