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
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from pydantic import BaseModel, ValidationError
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.answer_key_page import AnswerKeyPage
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


# Bump PROMPT_VERSION when _build_system_prompt or the output JSON schema
# changes substantively. The DB stamps this on every diagnosis row so future
# eval analyses can bucket results by prompt era. v1 = initial release.
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
    total_problems_seen: int | None = None
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


async def _build_system_prompt(
    db: AsyncSession,
    *,
    mode: str,
    wrong_only: bool,
    student_page_count: int,
    key_page_count: int,
) -> str:
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

    if mode == "with_key":
        lines.append(
            f"INPUT LAYOUT: The first {student_page_count} images are "
            f"STUDENT WORK pages (1-{student_page_count}). The next "
            f"{key_page_count} images are the ANSWER KEY pages "
            f"(1-{key_page_count})."
        )
        lines.append("")
        lines.append(
            "INSTRUCTIONS:"
            "\nFor each problem on the student pages:"
            "\n1. Find the matching problem on the answer key."
            "\n2. Compare the student's answer to the answer key's answer."
            "\n3. If wrong: pick the best-matching error_pattern_slug from"
            " the taxonomy, write a 1-sentence error description, and"
            " provide a clear step-by-step solution."
        )
    elif mode == "already_graded":
        lines.append(
            "INPUT LAYOUT: The pages show student work that has been GRADED"
            " BY THE TEACHER. Look for the teacher's markings: red X marks,"
            " crossed-out answers, score deductions, '-N points' notations,"
            " comments like 'wrong' or 'incorrect' near a problem."
        )
        lines.append("")
        lines.append(
            "INSTRUCTIONS:"
            "\nFor each problem the teacher marked WRONG:"
            "\n1. Identify the problem statement and the student's work."
            "\n2. Determine the correct answer."
            "\n3. Classify the error against the taxonomy and provide a"
            " step-by-step solution."
        )
    else:  # auto_grade
        lines.append(
            "INSTRUCTIONS:"
            "\nFor each problem you find on the pages:"
            "\n1. Identify the problem statement and the student's complete"
            " work and final answer."
            "\n2. Solve the problem yourself to determine the correct answer."
            "\n3. Compare. If the student is wrong: pick the best-matching"
            " error_pattern_slug from the taxonomy, write a 1-sentence error"
            " description, and provide a clear step-by-step solution."
        )

    lines.append("")
    if wrong_only:
        lines.append(
            "OUTPUT FORMAT (return JSON only, no surrounding text). Output"
            " ONLY problems where the student got it wrong. Also report"
            " total_problems_seen as the count of problems you saw across"
            " all pages, including the correct ones you skipped:"
        )
    else:
        lines.append(
            "OUTPUT FORMAT (return JSON only, no surrounding text). Output"
            " ALL problems with the is_correct flag set:"
        )

    lines.extend([
        "{",
        '  "overall_summary": "string | null (1-2 sentences highest-level takeaway)",',
        '  "total_problems_seen": int | null (only required when wrong_only output)',
        '  "problems": [',
        "    {",
        '      "problem_number": int (1-indexed across all pages),',
        '      "page_number": int,',
        '      "student_answer": "string (the student\'s final answer)",',
        '      "correct_answer": "string (the correct answer)",',
        '      "is_correct": bool,',
        '      "error_pattern_slug": "string | null (taxonomy slug if wrong;'
        ' null if correct or no pattern fits)",',
        '      "error_description": "string | null",',
        '      "solution_steps": "string | null"',
        "    }",
        "  ]",
        "}",
    ])
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
    # Engine v1 requires an org-scoped account. CallContext.organization_id is
    # non-nullable and the diagnostic flow stamps every audit_log + diagnosis
    # row with an org_id. Parent-mode (org_id=None) engine support is a
    # follow-up spec — see CLAUDE.md §3 on tenancy.
    if user.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="user is not in an organization",
        )

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
    # Re-run support: if a diagnostic was already run (status completed or
    # failed), soft-delete the prior AssessmentDiagnosis + ProblemObservation
    # rows and reset status to pending so the rest of this function can
    # proceed normally. Active teacher diagnostic_reviews persist across
    # re-runs (keyed by assessment_id + problem_number, not diagnosis_id).
    # `processing` still 409s — a diagnostic in flight should not be
    # double-fired.
    if assessment.status == AssessmentStatus.processing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="diagnostic is already in flight",
        )
    if assessment.status in (AssessmentStatus.completed, AssessmentStatus.failed):
        # Match the established project convention for soft-delete columns
        # (TIMESTAMP WITHOUT TIME ZONE in this schema).
        now = datetime.now(tz=timezone.utc).replace(tzinfo=None)
        await db.execute(
            update(AssessmentDiagnosis)
            .where(
                AssessmentDiagnosis.assessment_id == assessment.id,
                AssessmentDiagnosis.deleted_at.is_(None),
            )
            .values(deleted_at=now)
        )
        await db.execute(
            update(ProblemObservation)
            .where(
                ProblemObservation.diagnosis_id.in_(
                    select(AssessmentDiagnosis.id).where(
                        AssessmentDiagnosis.assessment_id == assessment.id,
                    )
                ),
                ProblemObservation.deleted_at.is_(None),
            )
            .values(deleted_at=now)
        )
        assessment.status = AssessmentStatus.pending
        await db.flush()

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

    # 3. Derive mode and load key pages if applicable.
    if assessment.answer_key_id is not None:
        mode = "with_key"
    elif assessment.already_graded:
        mode = "already_graded"
    else:
        mode = "auto_grade"

    wrong_only = (mode != "auto_grade") and (not assessment.review_all)

    key_pages: list[AnswerKeyPage] = []
    if mode == "with_key":
        key_result = await db.execute(
            select(AnswerKeyPage)
            .where(
                AnswerKeyPage.answer_key_id == assessment.answer_key_id,
                AnswerKeyPage.deleted_at.is_(None),
            )
            .order_by(AnswerKeyPage.page_number)
        )
        key_pages = list(key_result.scalars().all())
        if not key_pages:
            assessment.status = AssessmentStatus.failed
            await db.flush()
            raise EngineParseError("answer key has no pages")

    system_prompt = await _build_system_prompt(
        db,
        mode=mode,
        wrong_only=wrong_only,
        student_page_count=len(pages),
        key_page_count=len(key_pages),
    )

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
    for kp in key_pages:
        url = await storage_service.get_download_url(
            ctx=storage_ctx, key=kp.s3_url, db=db
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
    # Caller MUST wrap diagnose_assessment in one outer transaction so the
    # diagnosis + N observations + final status flush are atomic. Each flush
    # below stages SQL but does not commit; the endpoint's session boundary
    # is what makes the whole pipeline all-or-nothing.
    diagnosis = AssessmentDiagnosis(
        assessment_id=assessment.id,
        organization_id=user.organization_id,
        model=MODEL,
        prompt_version=PROMPT_VERSION,
        tokens_input=response.tokens_input,
        tokens_output=response.tokens_output,
        tokens_cache_read=response.tokens_cache_read,
        tokens_cache_creation=response.tokens_cache_creation,
        cost_usd=cost,
        latency_ms=latency_ms,
        overall_summary=engine_output.overall_summary,
        analysis_mode=mode,
        total_problems_seen=engine_output.total_problems_seen,
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
