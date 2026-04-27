"""Diagnostic engine — runs Claude Sonnet 4.6 vision against an assessment.

Public entrypoint:
    diagnose_assessment(assessment_id, user, db) -> AssessmentDiagnosis

Pipeline:
1. Load Assessment + AssessmentPages, verify org + status.
2. Build the system prompt from the v1 taxonomy (cached on Anthropic side).
3. Generate presigned R2 GET URLs for each page.
4. Move Assessment.status to processing.
5. Call claude_service.call_vision_multi.
6. Parse the JSON response.
7. Resolve error_pattern slugs to UUIDs (NULL on unknown slug).
8. Persist diagnosis + observations in one tx.
9. Move Assessment.status to completed.

Failure paths set Assessment.status to failed before raising.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.assessment import Assessment, AssessmentStatus
from ..models.assessment_diagnosis import AssessmentDiagnosis
from ..models.assessment_page import AssessmentPage
from ..models.error_category import ErrorCategory
from ..models.error_pattern import ErrorPattern
from ..models.error_subcategory import ErrorSubcategory
from ..models.problem_observation import ProblemObservation
from ..models.user import User
from . import claude_service, storage_service
from .call_context import CallContext
from .claude_service import ClaudeServiceError

logger = logging.getLogger(__name__)


PROMPT_VERSION = "v1"
MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 4096


class EngineParseError(Exception):
    """Raised when Claude's response cannot be parsed as the expected JSON shape."""


class _EngineProblem(BaseModel):
    problem_number: int
    page_number: int
    student_answer: str
    correct_answer: str
    is_correct: bool
    error_pattern_slug: str | None = None
    error_description: str | None = None
    solution_steps: str | None = None


class _EngineOutput(BaseModel):
    overall_summary: str | None = None
    problems: list[_EngineProblem]


def _strip_markdown_fences(text: str) -> str:
    """Strip ```json ... ``` if Claude wrapped the response despite our instruction."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines)
    return text.strip()


async def _build_system_prompt(db: AsyncSession) -> str:
    cats_result = await db.execute(
        select(ErrorCategory)
        .options(
            selectinload(ErrorCategory.subcategories).selectinload(
                ErrorSubcategory.patterns
            ),
        )
        .order_by(ErrorCategory.severity_rank)
    )
    cats = cats_result.scalars().all()

    lines: list[str] = [
        "You are a math diagnostic assistant for Grade-Sight. You analyze "
        "handwritten student math work and identify mistakes.",
        "",
        "ERROR TAXONOMY:",
        "The following error patterns are organized into cognitive categories. "
        "When you classify an error, use the slug exactly as written.",
        "",
    ]
    for cat in cats:
        lines.append(f"## Category: {cat.name} (slug: {cat.slug})")
        lines.append(f"   Definition: {cat.definition}")
        lines.append(f"   Distinguishing marker: {cat.distinguishing_marker}")
        for sub in cat.subcategories:
            lines.append(f"   ### Subcategory: {sub.name} (slug: {sub.slug})")
            lines.append(f"       Definition: {sub.definition}")
            for pat in sub.patterns:
                if pat.deleted_at is not None:
                    continue
                lines.append(f"       - {pat.name} (slug: {pat.slug})")
                lines.append(f"         {pat.description}")
        lines.append("")

    lines.extend(
        [
            "INSTRUCTIONS:",
            "For each problem you find on the pages:",
            "1. Identify the problem statement and the student's complete work and final answer.",
            "2. Solve the problem yourself to determine the correct answer.",
            "3. Compare. If the student's answer is wrong:",
            "   a. Pick the best-matching error_pattern_slug from the taxonomy.",
            "   b. Write a one-sentence error description.",
            "   c. Provide a clear step-by-step solution.",
            "",
            "OUTPUT FORMAT (return JSON only, no surrounding text):",
            "{",
            '  "overall_summary": "string | null (1-2 sentences highest-level takeaway)",',
            '  "problems": [',
            "    {",
            '      "problem_number": int (1-indexed across all pages),',
            '      "page_number": int,',
            '      "student_answer": "string (the student\'s final answer)",',
            '      "correct_answer": "string (the correct answer)",',
            '      "is_correct": bool,',
            '      "error_pattern_slug": "string | null (taxonomy slug if wrong; '
            'null if correct or no pattern fits)",',
            '      "error_description": "string | null",',
            '      "solution_steps": "string | null"',
            "    }",
            "  ]",
            "}",
        ]
    )
    return "\n".join(lines)


async def _resolve_pattern_slug_to_id(
    db: AsyncSession, slug: str
) -> UUID | None:
    result = await db.execute(
        select(ErrorPattern.id).where(
            ErrorPattern.slug == slug,
            ErrorPattern.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def diagnose_assessment(
    *,
    assessment_id: UUID,
    user: User,
    db: AsyncSession,
) -> AssessmentDiagnosis:
    # 1. Load assessment + verify ownership + status.
    asmt_result = await db.execute(
        select(Assessment).where(
            Assessment.id == assessment_id,
            Assessment.deleted_at.is_(None),
        )
    )
    assessment = asmt_result.scalar_one_or_none()
    if assessment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="assessment not found",
        )
    if assessment.organization_id != user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="assessment does not belong to your organization",
        )
    if assessment.status != AssessmentStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"assessment status is {assessment.status.value}; cannot diagnose",
        )

    # 2. Load pages.
    pages_result = await db.execute(
        select(AssessmentPage)
        .where(
            AssessmentPage.assessment_id == assessment.id,
            AssessmentPage.deleted_at.is_(None),
        )
        .order_by(AssessmentPage.page_number)
    )
    pages = pages_result.scalars().all()
    if not pages:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="assessment has no pages",
        )

    if user.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="user is not in an organization",
        )

    # 3. Build prompt + presigned URLs.
    system_prompt = await _build_system_prompt(db)

    storage_ctx = CallContext(
        organization_id=user.organization_id,
        user_id=user.id,
        request_type="diagnostic_engine_page_url",
        contains_pii=True,
        audit_reason="diagnostic engine reads assessment pages",
    )
    image_urls: list[bytes | str] = []
    for p in pages:
        url = await storage_service.get_download_url(
            ctx=storage_ctx, key=p.s3_url, db=db
        )
        image_urls.append(url)

    # 4. Move to processing.
    assessment.status = AssessmentStatus.processing
    await db.flush()

    # 5. Call Claude.
    claude_ctx = CallContext(
        organization_id=user.organization_id,
        user_id=user.id,
        request_type="diagnostic_engine",
        contains_pii=True,
        audit_reason="diagnose student assessment",
    )
    start = time.monotonic()
    try:
        response = await claude_service.call_vision_multi(
            ctx=claude_ctx,
            model=MODEL,
            system=system_prompt,
            images=image_urls,
            prompt="Diagnose this assessment.",
            max_tokens=MAX_TOKENS,
            cache_system=True,
            db=db,
        )
    except ClaudeServiceError:
        assessment.status = AssessmentStatus.failed
        await db.flush()
        raise
    latency_ms = int((time.monotonic() - start) * 1000)

    # 6. Parse JSON.
    try:
        cleaned = _strip_markdown_fences(response.text)
        parsed_dict: Any = json.loads(cleaned)
        engine_output = _EngineOutput.model_validate(parsed_dict)
    except (json.JSONDecodeError, ValidationError) as exc:
        assessment.status = AssessmentStatus.failed
        await db.flush()
        logger.warning(
            "Engine response parse failure for assessment %s: %s",
            assessment.id,
            exc,
        )
        raise EngineParseError(f"Could not parse engine response: {exc}") from exc

    # 7. Compute cost from the call_vision_multi response.
    cost = claude_service.compute_cost(
        model=MODEL,
        tokens_input=response.tokens_input,
        tokens_output=response.tokens_output,
    )

    # 8. Persist diagnosis + observations.
    diagnosis = AssessmentDiagnosis(
        assessment_id=assessment.id,
        organization_id=user.organization_id,
        model=MODEL,
        prompt_version=PROMPT_VERSION,
        tokens_input=response.tokens_input,
        tokens_output=response.tokens_output,
        cost_usd=cost,
        latency_ms=latency_ms,
        overall_summary=engine_output.overall_summary,
    )
    db.add(diagnosis)
    await db.flush()

    for problem in engine_output.problems:
        error_pattern_id: UUID | None = None
        if not problem.is_correct and problem.error_pattern_slug:
            error_pattern_id = await _resolve_pattern_slug_to_id(
                db, problem.error_pattern_slug
            )
        observation = ProblemObservation(
            diagnosis_id=diagnosis.id,
            organization_id=user.organization_id,
            problem_number=problem.problem_number,
            page_number=problem.page_number,
            student_answer=problem.student_answer,
            correct_answer=problem.correct_answer,
            is_correct=problem.is_correct,
            error_pattern_id=error_pattern_id,
            error_description=problem.error_description,
            solution_steps=problem.solution_steps,
        )
        db.add(observation)

    await db.flush()

    # 9. Mark completed.
    assessment.status = AssessmentStatus.completed
    await db.flush()

    return diagnosis
