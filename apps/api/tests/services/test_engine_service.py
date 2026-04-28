"""Tests for engine_service.diagnose_assessment.

All 8 tests mock claude_service.call_vision_multi to return a
ClaudeVisionResponse with a known JSON string. This bypasses the entire
claude_service / Anthropic path; claude_service has its own tests.
"""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.assessment import Assessment, AssessmentStatus
from grade_sight_api.models.assessment_diagnosis import AssessmentDiagnosis
from grade_sight_api.models.assessment_page import AssessmentPage
from grade_sight_api.models.organization import Organization
from grade_sight_api.models.problem_observation import ProblemObservation
from grade_sight_api.models.student import Student
from grade_sight_api.models.user import User, UserRole
from grade_sight_api.services import claude_service, engine_service
from grade_sight_api.services.claude_service import (
    ClaudeServiceError,
    ClaudeVisionResponse,
)


async def _seed_assessment_with_pages(
    session: AsyncSession,
    *,
    page_count: int = 2,
    status: AssessmentStatus = AssessmentStatus.pending,
) -> tuple[Organization, User, Assessment]:
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
        status=status,
    )
    session.add(asmt)
    await session.flush()
    for n in range(1, page_count + 1):
        session.add(
            AssessmentPage(
                assessment_id=asmt.id,
                page_number=n,
                s3_url=f"assessments/{org.id}/{student.id}/{asmt.id}/page-{n:03d}.png",
                original_filename=f"page-{n}.png",
                content_type="image/png",
                organization_id=org.id,
            )
        )
    await session.flush()
    return org, user, asmt


def _engine_response_three_problems(pattern_slug: str) -> str:
    return json.dumps(
        {
            "overall_summary": "2 of 3 correct.",
            "problems": [
                {
                    "problem_number": 1,
                    "page_number": 1,
                    "student_answer": "x = 7",
                    "correct_answer": "x = 7",
                    "is_correct": True,
                    "error_pattern_slug": None,
                    "error_description": None,
                    "solution_steps": None,
                },
                {
                    "problem_number": 2,
                    "page_number": 1,
                    "student_answer": "x = 5",
                    "correct_answer": "x = 7",
                    "is_correct": False,
                    "error_pattern_slug": pattern_slug,
                    "error_description": "Sign error during distribution.",
                    "solution_steps": "1. -2(x-4)=6\n2. -2x+8=6\n3. -2x=-2\n4. x=1",
                },
                {
                    "problem_number": 3,
                    "page_number": 2,
                    "student_answer": "y = 3",
                    "correct_answer": "y = 3",
                    "is_correct": True,
                    "error_pattern_slug": None,
                    "error_description": None,
                    "solution_steps": None,
                },
            ],
        }
    )


async def test_diagnose_persists_diagnosis_and_observations(
    async_session: AsyncSession, seed_minimal_taxonomy: dict[str, Any]
) -> None:
    org, user, asmt = await _seed_assessment_with_pages(async_session)
    pattern = seed_minimal_taxonomy["pattern"]

    fake_response = ClaudeVisionResponse(
        text=_engine_response_three_problems(pattern.slug),
        tokens_input=1234,
        tokens_output=567,
        model="claude-sonnet-4-6",
    )

    with patch.object(
        claude_service,
        "call_vision_multi",
        new=AsyncMock(return_value=fake_response),
    ):
        await engine_service.diagnose_assessment(
            assessment_id=asmt.id,
            user=user,
            db=async_session,
        )

    # Diagnosis row exists.
    diag_rows = (
        await async_session.execute(
            select(AssessmentDiagnosis).where(
                AssessmentDiagnosis.assessment_id == asmt.id
            )
        )
    ).scalars().all()
    assert len(diag_rows) == 1
    diag = diag_rows[0]
    assert diag.model == "claude-sonnet-4-6"
    assert diag.tokens_input == 1234
    assert diag.tokens_output == 567
    assert diag.cost_usd > Decimal("0")
    assert diag.organization_id == org.id
    assert diag.overall_summary == "2 of 3 correct."

    # Observations: 3 rows in problem_number order.
    obs_rows = (
        await async_session.execute(
            select(ProblemObservation)
            .where(ProblemObservation.diagnosis_id == diag.id)
            .order_by(ProblemObservation.problem_number)
        )
    ).scalars().all()
    assert [o.problem_number for o in obs_rows] == [1, 2, 3]
    assert obs_rows[0].is_correct is True
    assert obs_rows[1].is_correct is False
    assert obs_rows[1].error_pattern_id == pattern.id
    assert obs_rows[1].solution_steps is not None
    assert obs_rows[2].is_correct is True

    # Assessment status moved to completed.
    await async_session.refresh(asmt)
    assert asmt.status == AssessmentStatus.completed


async def test_diagnose_resolves_pattern_slug(
    async_session: AsyncSession, seed_minimal_taxonomy: dict[str, Any]
) -> None:
    _, user, asmt = await _seed_assessment_with_pages(async_session)
    pattern = seed_minimal_taxonomy["pattern"]

    fake_response = ClaudeVisionResponse(
        text=_engine_response_three_problems(pattern.slug),
        tokens_input=1,
        tokens_output=1,
        model="claude-sonnet-4-6",
    )
    with patch.object(
        claude_service,
        "call_vision_multi",
        new=AsyncMock(return_value=fake_response),
    ):
        await engine_service.diagnose_assessment(
            assessment_id=asmt.id, user=user, db=async_session,
        )

    wrong_obs = (
        await async_session.execute(
            select(ProblemObservation).where(
                ProblemObservation.is_correct.is_(False)
            )
        )
    ).scalars().all()
    assert len(wrong_obs) == 1
    assert wrong_obs[0].error_pattern_id == pattern.id


async def test_diagnose_handles_unknown_slug(
    async_session: AsyncSession, seed_minimal_taxonomy: dict[str, Any]
) -> None:
    _, user, asmt = await _seed_assessment_with_pages(async_session)

    fake_response = ClaudeVisionResponse(
        text=_engine_response_three_problems("made-up-slug-not-in-taxonomy"),
        tokens_input=1,
        tokens_output=1,
        model="claude-sonnet-4-6",
    )
    with patch.object(
        claude_service,
        "call_vision_multi",
        new=AsyncMock(return_value=fake_response),
    ):
        await engine_service.diagnose_assessment(
            assessment_id=asmt.id, user=user, db=async_session,
        )

    wrong_obs = (
        await async_session.execute(
            select(ProblemObservation).where(
                ProblemObservation.is_correct.is_(False)
            )
        )
    ).scalars().all()
    assert len(wrong_obs) == 1
    assert wrong_obs[0].error_pattern_id is None
    assert wrong_obs[0].error_description == "Sign error during distribution."
    assert wrong_obs[0].solution_steps is not None


async def test_diagnose_marks_failed_on_claude_error(
    async_session: AsyncSession, seed_minimal_taxonomy: dict[str, Any]
) -> None:
    _, user, asmt = await _seed_assessment_with_pages(async_session)

    with (
        patch.object(
            claude_service,
            "call_vision_multi",
            new=AsyncMock(side_effect=ClaudeServiceError("simulated 503")),
        ),
        pytest.raises(ClaudeServiceError),
    ):
        await engine_service.diagnose_assessment(
            assessment_id=asmt.id, user=user, db=async_session,
        )

    await async_session.refresh(asmt)
    assert asmt.status == AssessmentStatus.failed
    diag_rows = (
        await async_session.execute(
            select(AssessmentDiagnosis).where(
                AssessmentDiagnosis.assessment_id == asmt.id
            )
        )
    ).scalars().all()
    assert len(diag_rows) == 0


async def test_diagnose_marks_failed_on_malformed_json(
    async_session: AsyncSession, seed_minimal_taxonomy: dict[str, Any]
) -> None:
    _, user, asmt = await _seed_assessment_with_pages(async_session)

    fake_response = ClaudeVisionResponse(
        text="this is not json",
        tokens_input=1,
        tokens_output=1,
        model="claude-sonnet-4-6",
    )
    with (
        patch.object(
            claude_service,
            "call_vision_multi",
            new=AsyncMock(return_value=fake_response),
        ),
        pytest.raises(engine_service.EngineParseError),
    ):
        await engine_service.diagnose_assessment(
            assessment_id=asmt.id, user=user, db=async_session,
        )

    await async_session.refresh(asmt)
    assert asmt.status == AssessmentStatus.failed


async def test_diagnose_404_when_missing(
    async_session: AsyncSession, seed_minimal_taxonomy: dict[str, Any]
) -> None:
    org = Organization(name="Test Org")
    async_session.add(org)
    await async_session.flush()
    user = User(
        clerk_id=f"user_{uuid4().hex[:12]}",
        email=f"{uuid4().hex[:8]}@example.com",
        role=UserRole.teacher,
        first_name="Test",
        last_name="Teacher",
        organization_id=org.id,
    )
    async_session.add(user)
    await async_session.flush()

    with pytest.raises(HTTPException) as exc_info:
        await engine_service.diagnose_assessment(
            assessment_id=uuid4(),  # nonexistent
            user=user,
            db=async_session,
        )
    assert exc_info.value.status_code == 404


async def test_diagnose_403_cross_org(
    async_session: AsyncSession, seed_minimal_taxonomy: dict[str, Any]
) -> None:
    _, _, asmt = await _seed_assessment_with_pages(async_session)
    other_org = Organization(name="Other Org")
    async_session.add(other_org)
    await async_session.flush()
    other_user = User(
        clerk_id=f"user_{uuid4().hex[:12]}",
        email=f"{uuid4().hex[:8]}@example.com",
        role=UserRole.teacher,
        first_name="Other",
        last_name="User",
        organization_id=other_org.id,
    )
    async_session.add(other_user)
    await async_session.flush()

    with pytest.raises(HTTPException) as exc_info:
        await engine_service.diagnose_assessment(
            assessment_id=asmt.id,
            user=other_user,
            db=async_session,
        )
    assert exc_info.value.status_code == 403


async def test_diagnose_409_when_already_diagnosed(
    async_session: AsyncSession, seed_minimal_taxonomy: dict[str, Any]
) -> None:
    _, user, asmt = await _seed_assessment_with_pages(
        async_session, status=AssessmentStatus.completed
    )

    with pytest.raises(HTTPException) as exc_info:
        await engine_service.diagnose_assessment(
            assessment_id=asmt.id, user=user, db=async_session,
        )
    assert exc_info.value.status_code == 409


# ---- Mode tests ----


async def test_diagnose_with_key_mode_includes_key_images_in_call(
    async_session: AsyncSession, seed_minimal_taxonomy: dict[str, Any]
) -> None:
    """Engine appends answer key pages to the image list and the prompt
    describes the layout. analysis_mode='with_key' on the diagnosis row."""
    from grade_sight_api.models.answer_key import AnswerKey
    from grade_sight_api.models.answer_key_page import AnswerKeyPage

    org, user, asmt = await _seed_assessment_with_pages(
        async_session, page_count=2
    )
    pattern = seed_minimal_taxonomy["pattern"]

    # Seed answer key + 1 page; attach to assessment
    key = AnswerKey(
        uploaded_by_user_id=user.id,
        organization_id=org.id,
        name="Test Key",
    )
    async_session.add(key)
    await async_session.flush()
    async_session.add(
        AnswerKeyPage(
            answer_key_id=key.id,
            organization_id=org.id,
            page_number=1,
            s3_url=f"answer-keys/{org.id}/{key.id}/page-001.png",
            original_filename="key-1.png",
            content_type="image/png",
        )
    )
    asmt.answer_key_id = key.id
    await async_session.flush()

    fake_response = ClaudeVisionResponse(
        text=json.dumps({
            "overall_summary": "1 wrong of 5 seen.",
            "total_problems_seen": 5,
            "problems": [
                {
                    "problem_number": 1,
                    "page_number": 1,
                    "student_answer": "x = 5",
                    "correct_answer": "x = 7",
                    "is_correct": False,
                    "error_pattern_slug": pattern.slug,
                    "error_description": "wrong",
                    "solution_steps": "step",
                }
            ],
        }),
        tokens_input=1, tokens_output=1, model="claude-sonnet-4-6",
    )

    captured_kwargs: dict[str, Any] = {}

    async def _capture(**kwargs):
        captured_kwargs.update(kwargs)
        return fake_response

    with patch.object(claude_service, "call_vision_multi", new=_capture):
        await engine_service.diagnose_assessment(
            assessment_id=asmt.id, user=user, db=async_session,
        )

    # 2 student pages + 1 key page = 3 images
    assert len(captured_kwargs["images"]) == 3
    # System prompt mentions answer key layout
    assert "ANSWER KEY" in captured_kwargs["system"]
    assert "STUDENT WORK" in captured_kwargs["system"]

    # Diagnosis stamped with mode
    diag = (
        await async_session.execute(
            select(AssessmentDiagnosis).where(
                AssessmentDiagnosis.assessment_id == asmt.id
            )
        )
    ).scalar_one()
    assert diag.analysis_mode == "with_key"
    assert diag.total_problems_seen == 5


async def test_diagnose_already_graded_mode_uses_markings_prompt(
    async_session: AsyncSession, seed_minimal_taxonomy: dict[str, Any]
) -> None:
    """already_graded=true with no answer_key_id selects the markings prompt."""
    _, user, asmt = await _seed_assessment_with_pages(async_session)
    asmt.already_graded = True
    await async_session.flush()
    pattern = seed_minimal_taxonomy["pattern"]

    fake_response = ClaudeVisionResponse(
        text=json.dumps({
            "overall_summary": "graded",
            "total_problems_seen": 4,
            "problems": [
                {
                    "problem_number": 2,
                    "page_number": 1,
                    "student_answer": "5",
                    "correct_answer": "7",
                    "is_correct": False,
                    "error_pattern_slug": pattern.slug,
                    "error_description": "wrong",
                    "solution_steps": "step",
                }
            ],
        }),
        tokens_input=1, tokens_output=1, model="claude-sonnet-4-6",
    )

    captured_kwargs: dict[str, Any] = {}

    async def _capture(**kwargs):
        captured_kwargs.update(kwargs)
        return fake_response

    with patch.object(claude_service, "call_vision_multi", new=_capture):
        await engine_service.diagnose_assessment(
            assessment_id=asmt.id, user=user, db=async_session,
        )

    # Prompt mentions teacher markings
    system = captured_kwargs["system"]
    assert "GRADED BY THE TEACHER" in system
    assert "red X" in system or "score deductions" in system

    diag = (
        await async_session.execute(
            select(AssessmentDiagnosis).where(
                AssessmentDiagnosis.assessment_id == asmt.id
            )
        )
    ).scalar_one()
    assert diag.analysis_mode == "already_graded"


async def test_diagnose_wrong_only_stores_only_wrong_observations_with_total(
    async_session: AsyncSession, seed_minimal_taxonomy: dict[str, Any]
) -> None:
    """When wrong_only is active, engine response of 4 wrong out of 18 stores
    4 ProblemObservation rows + total_problems_seen=18 on the diagnosis."""
    _, user, asmt = await _seed_assessment_with_pages(async_session)
    asmt.already_graded = True
    asmt.review_all = False
    await async_session.flush()
    pattern = seed_minimal_taxonomy["pattern"]

    fake_response = ClaudeVisionResponse(
        text=json.dumps({
            "overall_summary": "4 wrong of 18.",
            "total_problems_seen": 18,
            "problems": [
                {
                    "problem_number": n,
                    "page_number": 1,
                    "student_answer": f"wrong-{n}",
                    "correct_answer": f"right-{n}",
                    "is_correct": False,
                    "error_pattern_slug": pattern.slug,
                    "error_description": "wrong",
                    "solution_steps": "step",
                }
                for n in (3, 7, 12, 15)
            ],
        }),
        tokens_input=1, tokens_output=1, model="claude-sonnet-4-6",
    )

    with patch.object(
        claude_service, "call_vision_multi",
        new=AsyncMock(return_value=fake_response),
    ):
        await engine_service.diagnose_assessment(
            assessment_id=asmt.id, user=user, db=async_session,
        )

    obs_rows = (
        await async_session.execute(
            select(ProblemObservation).order_by(
                ProblemObservation.problem_number
            )
        )
    ).scalars().all()
    assert len(obs_rows) == 4
    assert all(o.is_correct is False for o in obs_rows)

    diag = (
        await async_session.execute(
            select(AssessmentDiagnosis).where(
                AssessmentDiagnosis.assessment_id == asmt.id
            )
        )
    ).scalar_one()
    assert diag.total_problems_seen == 18
