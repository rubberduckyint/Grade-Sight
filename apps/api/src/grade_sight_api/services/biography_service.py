"""Biography aggregation + trend classification helpers."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from grade_sight_api.models.answer_key import AnswerKey
from grade_sight_api.models.assessment import Assessment, AssessmentStatus
from grade_sight_api.models.assessment_diagnosis import AssessmentDiagnosis
from grade_sight_api.models.diagnostic_review import DiagnosticReview
from grade_sight_api.models.error_category import ErrorCategory
from grade_sight_api.models.error_pattern import ErrorPattern
from grade_sight_api.models.error_subcategory import ErrorSubcategory
from grade_sight_api.models.problem_observation import ProblemObservation
from grade_sight_api.models.student import Student
from grade_sight_api.models.student_profile import StudentProfile
from grade_sight_api.schemas.assessments import ProblemObservationResponse
from grade_sight_api.schemas.biography import (
    BiographySentence,
    BiographyStats,
    PatternTimelineRow,
    RecentAssessmentRow,
    StudentBiographyResponse,
    StudentSummary,
    WeekBucket,
)
from grade_sight_api.services.diagnostic_review_service import (
    OverlayInputs,
    apply_reviews_to_problems,
)


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
    if first_nonzero != -1 and first_nonzero <= early_threshold and all(c == 0 for c in recent_window):
        return "fading"

    return "recurring"


@dataclass
class PatternMeta:
    """Meta about an error_pattern (slug + display info)."""

    slug: str
    name: str
    category_slug: str
    category_name: str


def _label_for_monday(d: date) -> str:
    """Format a Monday date as a short month-day label, e.g. 'Mar 17'."""
    # %-d is non-portable on Windows but project is macOS/Linux only.
    return d.strftime("%b %-d")


def build_pattern_timeline(
    bucketed: dict[str, list[int]],
    pattern_meta: dict[str, PatternMeta],
    weeks: list[date],
) -> list[PatternTimelineRow]:
    """Convert per-slug week counts into PatternTimelineRow objects.

    Sorted by total_count descending, ties broken by slug alphabetical.
    Slugs not present in `pattern_meta` are silently dropped (defensive).
    """
    rows: list[PatternTimelineRow] = []
    for slug, counts in bucketed.items():
        meta = pattern_meta.get(slug)
        if meta is None:
            continue
        total = sum(counts)
        if total == 0:
            continue
        week_buckets = [
            WeekBucket(
                week_start=monday,
                label=_label_for_monday(monday),
                count=counts[i] if i < len(counts) else 0,
            )
            for i, monday in enumerate(weeks)
        ]
        rows.append(
            PatternTimelineRow(
                slug=slug,
                name=meta.name,
                category_slug=meta.category_slug,
                category_name=meta.category_name,
                weeks=week_buckets,
                total_count=total,
                trend=classify_trend(counts),
            )
        )

    rows.sort(key=lambda r: (-r.total_count, r.slug))
    return rows


def build_biography_sentence(
    timeline: list[PatternTimelineRow],
    role: Literal["parent", "teacher"],
    first_name: str,
    *,
    n_assessments: int,
) -> BiographySentence:
    """Build the editorial sentence per spec §3a."""

    eyebrow = (
        f"WHY {first_name.upper()} IS ON YOUR LIST"
        if role == "teacher"
        else f"WHAT WE'RE SEEING IN {first_name.upper()} THIS MONTH"
    )

    if not timeline:
        text = (
            f"No assessments yet for {first_name}."
            if n_assessments == 0
            else f"{first_name} has been clean across the last {n_assessments} assessments."
        )
        return BiographySentence(kind="fallback", eyebrow=eyebrow, text=text)

    dominant = timeline[0]  # already sorted by total descending

    if dominant.trend == "recurring":
        return BiographySentence(
            kind="structured",
            eyebrow=eyebrow,
            lead=f"One pattern keeps coming back: {dominant.name.lower()}.",
            accent=f"{dominant.total_count} occurrences in the last {n_assessments} assessments.",
            coda=("That's a five-minute conversation, not a tutor." if role == "parent" else None),
        )

    if dominant.trend == "new":
        return BiographySentence(
            kind="structured",
            eyebrow=eyebrow,
            lead=f"{dominant.name} just started showing up.",
            accent=f"{dominant.total_count} times in the last 2 weeks.",
        )

    if dominant.trend == "fading":
        return BiographySentence(
            kind="structured",
            eyebrow=eyebrow,
            lead=f"{first_name} is mostly clean. The misses don't repeat.",
        )

    # one_off
    return BiographySentence(
        kind="structured",
        eyebrow=eyebrow,
        lead=f"Only one miss worth flagging: {dominant.name.lower()}.",
    )


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


def _first_name(full_name: str) -> str:
    trimmed = full_name.strip()
    if not trimmed:
        return full_name
    return trimmed.split()[0]


def _most_recent_monday(now: datetime | None = None) -> date:
    n = (now or datetime.now(tz=timezone.utc)).date()
    return n - timedelta(days=n.weekday())


def _grade_str_to_int(raw: str | None) -> int | None:
    """Coerce student_profiles.grade_level (string column) to int."""
    if raw is None:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


async def build_biography(
    *,
    student_id: UUID,
    role: Literal["parent", "teacher"],
    db: AsyncSession,
    window_weeks: int = 6,
) -> StudentBiographyResponse | None:
    """Aggregate student biography. Returns None if student doesn't exist.

    Caller is responsible for org/owner auth before invoking.
    """
    # Load student + grade_level from profile in one query
    student_row = await db.execute(
        select(Student, StudentProfile.grade_level)
        .outerjoin(StudentProfile, StudentProfile.student_id == Student.id)
        .where(Student.id == student_id, Student.deleted_at.is_(None))
    )
    row = student_row.one_or_none()
    if row is None:
        return None
    student, grade_level_raw = row

    anchor_monday = _most_recent_monday()
    weeks = [
        anchor_monday - timedelta(days=7 * (window_weeks - 1 - i))
        for i in range(window_weeks)
    ]

    # Load completed assessments for this student (with diagnosis + answer_key)
    asmts_result = await db.execute(
        select(Assessment)
        .where(
            Assessment.student_id == student_id,
            Assessment.deleted_at.is_(None),
            Assessment.status == AssessmentStatus.completed,
        )
        .order_by(Assessment.uploaded_at.desc())
        .options(
            selectinload(Assessment.diagnosis),
            selectinload(Assessment.answer_key),
        )
    )
    assessments = list(asmts_result.scalars())

    if not assessments:
        # No data — return empty biography
        stats = BiographyStats(
            assessments_count=0,
            average_score_percent=None,
            problems_reviewed=0,
            problems_missed=0,
            patterns_detected=0,
            recurring_count=0,
        )
        first = _first_name(student.full_name)
        sentence = build_biography_sentence(
            [], role=role, first_name=first, n_assessments=0
        )
        return StudentBiographyResponse(
            student=StudentSummary(
                id=student.id,
                full_name=student.full_name,
                first_name=first,
                grade_level=_grade_str_to_int(grade_level_raw),
                added_at=student.created_at,
            ),
            stats=stats,
            weeks=weeks,
            pattern_timeline=[],
            recent_assessments=[],
            sentence=sentence,
        )

    diagnosis_ids = [
        asmt.diagnosis.id
        for asmt in assessments
        if asmt.diagnosis is not None
    ]

    # Load all ProblemObservations with JOINed pattern/category info in one query.
    # Keyed by diagnosis_id so we can look them up per assessment.
    problems_by_diagnosis: dict[UUID, list[ProblemObservationResponse]] = {}
    if diagnosis_ids:
        obs_result = await db.execute(
            select(
                ProblemObservation,
                ErrorPattern.slug.label("pattern_slug"),
                ErrorPattern.name.label("pattern_name"),
                ErrorCategory.slug.label("category_slug"),
            )
            .join(
                ErrorPattern,
                ProblemObservation.error_pattern_id == ErrorPattern.id,
                isouter=True,
            )
            .join(
                ErrorSubcategory,
                ErrorPattern.subcategory_id == ErrorSubcategory.id,
                isouter=True,
            )
            .join(
                ErrorCategory,
                ErrorSubcategory.category_id == ErrorCategory.id,
                isouter=True,
            )
            .where(
                ProblemObservation.diagnosis_id.in_(diagnosis_ids),
                ProblemObservation.deleted_at.is_(None),
            )
            .order_by(ProblemObservation.problem_number)
        )
        for obs, pattern_slug, pattern_name, category_slug in obs_result.all():
            row_resp = ProblemObservationResponse(
                id=obs.id,
                problem_number=obs.problem_number,
                page_number=obs.page_number,
                student_answer=obs.student_answer,
                correct_answer=obs.correct_answer,
                is_correct=obs.is_correct,
                error_pattern_slug=pattern_slug,
                error_pattern_name=pattern_name,
                error_category_slug=category_slug,
                error_description=obs.error_description,
                solution_steps=obs.solution_steps,
                review=None,
            )
            problems_by_diagnosis.setdefault(obs.diagnosis_id, []).append(row_resp)

    # Load diagnostic reviews
    reviews_result = await db.execute(
        select(DiagnosticReview).where(
            DiagnosticReview.assessment_id.in_([a.id for a in assessments]),
            DiagnosticReview.deleted_at.is_(None),
        )
    )
    reviews_list = list(reviews_result.scalars())

    reviews_by_assessment: dict[UUID, list[DiagnosticReview]] = {}
    for r in reviews_list:
        reviews_by_assessment.setdefault(r.assessment_id, []).append(r)

    # Resolve override pattern names for reviews that reference one
    override_pattern_ids = {
        r.override_pattern_id
        for r in reviews_list
        if r.override_pattern_id is not None
    }
    override_pattern_index: dict[UUID, object] = {}
    if override_pattern_ids:
        op_result = await db.execute(
            select(
                ErrorPattern,
                ErrorCategory.slug.label("cat_slug"),
                ErrorCategory.name.label("cat_name"),
            )
            .join(
                ErrorSubcategory,
                ErrorPattern.subcategory_id == ErrorSubcategory.id,
                isouter=True,
            )
            .join(
                ErrorCategory,
                ErrorSubcategory.category_id == ErrorCategory.id,
                isouter=True,
            )
            .where(ErrorPattern.id.in_(override_pattern_ids))
        )

        class _PatternAdapter:
            def __init__(
                self,
                pattern: ErrorPattern,
                cat_slug: str | None,
                cat_name: str | None,
            ) -> None:
                self.id = pattern.id
                self.slug = pattern.slug
                self.name = pattern.name
                self.category_slug = cat_slug or ""
                self.category_name = cat_name or ""

        for pat, cat_slug, cat_name in op_result.all():
            override_pattern_index[pat.id] = _PatternAdapter(pat, cat_slug, cat_name)

    # Bucket loop — apply overlay and bucket wrong problems by week
    bucketed_input: list[BucketedProblem] = []
    score_pairs: list[tuple[int, int]] = []
    problems_reviewed = 0
    problems_missed = 0

    class _ReviewAdapter:
        def __init__(self, row: DiagnosticReview) -> None:
            self.id = row.id
            self.problem_number = row.problem_number
            self.marked_correct = row.marked_correct
            self.override_pattern_id = row.override_pattern_id
            self.note = row.note
            self.reviewed_at = row.reviewed_at
            self.reviewer_name = ""

    for asmt in assessments:
        if asmt.diagnosis is None:
            continue
        diag_id = asmt.diagnosis.id
        raw = problems_by_diagnosis.get(diag_id, [])
        rows_for_asmt = reviews_by_assessment.get(asmt.id, [])
        adapters = [_ReviewAdapter(r) for r in rows_for_asmt]

        effective = apply_reviews_to_problems(
            OverlayInputs(
                problems=raw,
                reviews=adapters,  # type: ignore[arg-type]
                pattern_index=override_pattern_index,  # type: ignore[arg-type]
            )
        )

        right = sum(1 for p in effective if p.is_correct)
        total = len(effective)
        score_pairs.append((right, total))
        problems_reviewed += total
        problems_missed += sum(1 for p in effective if not p.is_correct)

        for p in effective:
            bucketed_input.append(
                BucketedProblem(
                    slug=p.error_pattern_slug,
                    uploaded_at=asmt.uploaded_at,
                    is_correct=p.is_correct,
                )
            )

    bucketed = bucket_problems_by_week(
        bucketed_input, anchor_monday=anchor_monday, window_weeks=window_weeks
    )

    # Fetch pattern meta for all slugs that appear in the bucketed output
    seen_slugs = set(bucketed.keys())
    pattern_meta_index: dict[str, PatternMeta] = {}
    if seen_slugs:
        meta_result = await db.execute(
            select(
                ErrorPattern,
                ErrorCategory.slug.label("cat_slug"),
                ErrorCategory.name.label("cat_name"),
            )
            .join(
                ErrorSubcategory,
                ErrorPattern.subcategory_id == ErrorSubcategory.id,
                isouter=True,
            )
            .join(
                ErrorCategory,
                ErrorSubcategory.category_id == ErrorCategory.id,
                isouter=True,
            )
            .where(ErrorPattern.slug.in_(seen_slugs))
        )
        for p, cat_slug, cat_name in meta_result.all():
            pattern_meta_index[p.slug] = PatternMeta(
                slug=p.slug,
                name=p.name,
                category_slug=cat_slug or "",
                category_name=cat_name or "",
            )

    timeline = build_pattern_timeline(bucketed, pattern_meta_index, weeks)

    avg_score = (
        sum(r / t for r, t in score_pairs if t > 0)
        / sum(1 for _, t in score_pairs if t > 0)
        * 100
        if score_pairs and any(t > 0 for _, t in score_pairs)
        else None
    )
    stats = BiographyStats(
        assessments_count=len(assessments),
        average_score_percent=round(avg_score, 1) if avg_score is not None else None,
        problems_reviewed=problems_reviewed,
        problems_missed=problems_missed,
        patterns_detected=len(timeline),
        recurring_count=sum(1 for r in timeline if r.trend == "recurring"),
    )

    # Recent assessments (top 10) — use effective problems from the overlay
    recent: list[RecentAssessmentRow] = []
    for asmt in assessments[:10]:
        if asmt.diagnosis is not None:
            diag_id = asmt.diagnosis.id
            raw = problems_by_diagnosis.get(diag_id, [])
            rows_for_asmt = reviews_by_assessment.get(asmt.id, [])
            adapters = [_ReviewAdapter(r) for r in rows_for_asmt]
            effective_recent = apply_reviews_to_problems(
                OverlayInputs(
                    problems=raw,
                    reviews=adapters,  # type: ignore[arg-type]
                    pattern_index=override_pattern_index,  # type: ignore[arg-type]
                )
            )
            right = sum(1 for p in effective_recent if p.is_correct)
            total = len(effective_recent)

            slug_counts: dict[str, int] = {}
            for p in effective_recent:
                if not p.is_correct and p.error_pattern_slug:
                    slug_counts[p.error_pattern_slug] = (
                        slug_counts.get(p.error_pattern_slug, 0) + 1
                    )
        else:
            right, total = 0, 0
            slug_counts = {}

        primary_slug = max(slug_counts, key=lambda s: slug_counts[s]) if slug_counts else None
        primary_name = (
            pattern_meta_index[primary_slug].name
            if primary_slug and primary_slug in pattern_meta_index
            else None
        )
        primary_count = slug_counts.get(primary_slug, 0) if primary_slug else 0

        if asmt.answer_key_id is not None:
            mode: Literal["auto_grade", "with_key", "already_graded"] = "with_key"
            ak_name = asmt.answer_key.name if asmt.answer_key else None
        elif asmt.already_graded:
            mode = "already_graded"
            ak_name = None
        else:
            mode = "auto_grade"
            ak_name = None

        if mode == "with_key" and ak_name:
            row_name = ak_name
        else:
            row_name = f"Assessment from {asmt.uploaded_at.strftime('%b %-d')}"

        recent.append(
            RecentAssessmentRow(
                id=asmt.id,
                name=row_name,
                uploaded_at=asmt.uploaded_at,
                mode=mode,
                answer_key_name=ak_name,
                score_right=right,
                score_total=total,
                primary_error_pattern_name=primary_name,
                primary_error_pattern_count=primary_count,
            )
        )

    first = _first_name(student.full_name)
    sentence = build_biography_sentence(
        timeline, role=role, first_name=first, n_assessments=len(assessments)
    )

    return StudentBiographyResponse(
        student=StudentSummary(
            id=student.id,
            full_name=student.full_name,
            first_name=first,
            grade_level=_grade_str_to_int(grade_level_raw),
            added_at=student.created_at,
        ),
        stats=stats,
        weeks=weeks,
        pattern_timeline=timeline,
        recent_assessments=recent,
        sentence=sentence,
    )
