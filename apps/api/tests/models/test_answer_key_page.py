"""Tests for AnswerKeyPage model + Assessment/AssessmentDiagnosis column additions."""

from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.answer_key import AnswerKey
from grade_sight_api.models.answer_key_page import AnswerKeyPage
from grade_sight_api.models.assessment import Assessment, AssessmentStatus
from grade_sight_api.models.assessment_diagnosis import AssessmentDiagnosis
from grade_sight_api.models.organization import Organization
from grade_sight_api.models.student import Student
from grade_sight_api.models.user import User, UserRole


async def _seed_org_and_user(
    session: AsyncSession,
) -> tuple[Organization, User]:
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
    return org, user


async def test_answer_key_page_round_trip(async_session: AsyncSession) -> None:
    org, user = await _seed_org_and_user(async_session)
    key = AnswerKey(
        uploaded_by_user_id=user.id,
        organization_id=org.id,
        name="Algebra Quiz 1 Key",
    )
    async_session.add(key)
    await async_session.flush()

    page = AnswerKeyPage(
        answer_key_id=key.id,
        organization_id=org.id,
        page_number=1,
        s3_url=f"answer-keys/{org.id}/{key.id}/page-001.png",
        original_filename="page-1.png",
        content_type="image/png",
    )
    async_session.add(page)
    await async_session.flush()

    rows = (
        await async_session.execute(
            select(AnswerKeyPage).where(AnswerKeyPage.answer_key_id == key.id)
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].page_number == 1
    assert rows[0].original_filename == "page-1.png"


async def test_answer_key_page_unique_constraint(
    async_session: AsyncSession,
) -> None:
    org, user = await _seed_org_and_user(async_session)
    key = AnswerKey(
        uploaded_by_user_id=user.id,
        organization_id=org.id,
        name="Test Key",
    )
    async_session.add(key)
    await async_session.flush()

    page_a = AnswerKeyPage(
        answer_key_id=key.id,
        organization_id=org.id,
        page_number=1,
        s3_url="key-a.png",
        original_filename="a.png",
        content_type="image/png",
    )
    page_b = AnswerKeyPage(
        answer_key_id=key.id,
        organization_id=org.id,
        page_number=1,
        s3_url="key-b.png",
        original_filename="b.png",
        content_type="image/png",
    )
    async_session.add(page_a)
    async_session.add(page_b)

    with pytest.raises(IntegrityError):
        await async_session.flush()


async def test_assessment_new_columns_default_false(
    async_session: AsyncSession,
) -> None:
    org, user = await _seed_org_and_user(async_session)
    student = Student(
        created_by_user_id=user.id,
        organization_id=org.id,
        full_name="Ada",
    )
    async_session.add(student)
    await async_session.flush()

    asmt = Assessment(
        student_id=student.id,
        organization_id=org.id,
        uploaded_by_user_id=user.id,
        status=AssessmentStatus.pending,
    )
    async_session.add(asmt)
    await async_session.flush()
    await async_session.refresh(asmt)

    assert asmt.already_graded is False
    assert asmt.review_all is False
    assert asmt.answer_key_id is None


async def test_diagnosis_analysis_mode_default(
    async_session: AsyncSession,
) -> None:
    org, user = await _seed_org_and_user(async_session)
    student = Student(
        created_by_user_id=user.id,
        organization_id=org.id,
        full_name="Ada",
    )
    async_session.add(student)
    await async_session.flush()
    asmt = Assessment(
        student_id=student.id,
        organization_id=org.id,
        uploaded_by_user_id=user.id,
        status=AssessmentStatus.pending,
    )
    async_session.add(asmt)
    await async_session.flush()

    diag = AssessmentDiagnosis(
        assessment_id=asmt.id,
        organization_id=org.id,
        model="claude-sonnet-4-6",
        prompt_version="v1",
        tokens_input=100,
        tokens_output=20,
        cost_usd=Decimal("0.01"),
        latency_ms=100,
        analysis_mode="auto_grade",
    )
    async_session.add(diag)
    await async_session.flush()
    await async_session.refresh(diag)

    assert diag.analysis_mode == "auto_grade"
    assert diag.total_problems_seen is None
