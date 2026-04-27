"""Tests for the AssessmentPage model and the Task 1 migration's backfill SQL."""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.assessment import Assessment, AssessmentStatus
from grade_sight_api.models.assessment_page import AssessmentPage
from grade_sight_api.models.organization import Organization
from grade_sight_api.models.student import Student
from grade_sight_api.models.user import User, UserRole


async def _seed_assessment(session: AsyncSession) -> tuple[Organization, Student, User, Assessment]:
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
        s3_url="legacy/key.png",
        original_filename="quiz.png",
        status=AssessmentStatus.pending,
    )
    session.add(asmt)
    await session.flush()
    return org, student, user, asmt


async def test_assessment_page_round_trip(async_session: AsyncSession) -> None:
    """Insert and read back an AssessmentPage row."""
    org, _, _, asmt = await _seed_assessment(async_session)

    page = AssessmentPage(
        assessment_id=asmt.id,
        page_number=1,
        s3_url=f"assessments/{org.id}/x/{asmt.id}/page-001.png",
        original_filename="page-001.png",
        content_type="image/png",
        organization_id=org.id,
    )
    async_session.add(page)
    await async_session.flush()

    rows = (
        await async_session.execute(
            select(AssessmentPage).where(AssessmentPage.assessment_id == asmt.id)
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].page_number == 1
    assert rows[0].original_filename == "page-001.png"
    assert rows[0].content_type == "image/png"


async def test_unique_page_number_per_assessment(async_session: AsyncSession) -> None:
    """Inserting two pages with the same (assessment_id, page_number) raises."""
    org, _, _, asmt = await _seed_assessment(async_session)

    page_a = AssessmentPage(
        assessment_id=asmt.id,
        page_number=1,
        s3_url="key-a.png",
        original_filename="a.png",
        content_type="image/png",
        organization_id=org.id,
    )
    page_b = AssessmentPage(
        assessment_id=asmt.id,
        page_number=1,
        s3_url="key-b.png",
        original_filename="b.png",
        content_type="image/png",
        organization_id=org.id,
    )
    async_session.add(page_a)
    async_session.add(page_b)

    with pytest.raises(IntegrityError):
        await async_session.flush()


async def test_backfill_sql_creates_page_from_legacy_assessment(
    async_session: AsyncSession,
) -> None:
    """The Task 1 migration's BACKFILL_SQL inserts an AssessmentPage row for each
    Assessment with non-null s3_url. We test the SQL logic directly so we don't
    have to wire alembic into pytest.
    """
    org, _, _, asmt = await _seed_assessment(async_session)

    # Match the migration's BACKFILL_SQL exactly.
    backfill_sql = text("""
        INSERT INTO assessment_pages (
            id, assessment_id, page_number, s3_url, original_filename,
            content_type, organization_id, created_at, updated_at
        )
        SELECT
            gen_random_uuid(),
            id,
            1,
            s3_url,
            original_filename,
            'image/png',
            organization_id,
            now(),
            now()
        FROM assessments
        WHERE s3_url IS NOT NULL AND deleted_at IS NULL;
    """)
    await async_session.execute(backfill_sql)
    await async_session.flush()

    rows = (
        await async_session.execute(
            select(AssessmentPage).where(AssessmentPage.assessment_id == asmt.id)
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].page_number == 1
    assert rows[0].s3_url == "legacy/key.png"
    assert rows[0].original_filename == "quiz.png"
    assert rows[0].content_type == "image/png"
    assert rows[0].organization_id == org.id
