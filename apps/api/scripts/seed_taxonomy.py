"""Idempotent seeder for the cognitive error taxonomy.

Run via:
    pnpm db:seed
or:
    cd apps/api && uv run python -m grade_sight_api.scripts.seed_taxonomy

This file is the source of truth for what the database holds. The markdown
doc at docs/superpowers/specs/2026-04-25-error-taxonomy-v1.md is the
human-readable mirror; if the two diverge, this file wins.

Re-running after edits is safe: UPSERTs by slug. Removing a row from this
file does NOT delete it from the database — deprecation goes through the
row's deleted_at column directly. This prevents accidental data loss.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.db import async_session_factory
from grade_sight_api.models.error_category import ErrorCategory
from grade_sight_api.models.error_pattern import ErrorPattern
from grade_sight_api.models.error_subcategory import ErrorSubcategory

logger = logging.getLogger(__name__)


# ---------- Source-of-truth data ----------

CATEGORIES: list[dict[str, Any]] = [
    {
        "slug": "verification",
        "name": "Verification",
        "definition": (
            "The student arrived at an answer but failed in the post-answer check. "
            "They didn't validate, didn't sanity-check, didn't reason about whether "
            "their result was reasonable. The visible math may be correct; the failure "
            "is in the absent self-review."
        ),
        "distinguishing_marker": (
            "Walk the visible math steps. Are they all correct, but the final answer "
            "is wrong anyway? That's Verification. (If a step is wrong, route to "
            "Execution or Conceptual instead.)"
        ),
        "severity_rank": 1,
    },
    {
        "slug": "execution",
        "name": "Execution",
        "definition": (
            "The student knows what to do — they reach for the right tool — but slips "
            "up while using it. The gap is in the doing, not the knowing. With more "
            "care, slower work, or a calculator check, they'd often catch it themselves."
        ),
        "distinguishing_marker": (
            "vs Conceptual: the student reached for the right tool. The work shows "
            "the right approach was attempted. vs Verification: the slip is upstream "
            "of the answer; verification errors happen after a candidate answer exists."
        ),
        "severity_rank": 2,
    },
    {
        "slug": "strategy",
        "name": "Strategy",
        "definition": (
            "The student got it wrong because of how they approached the problem — "
            "not because they didn't know the math (Conceptual), didn't compute "
            "carefully (Execution), or didn't sanity-check (Verification). The error "
            "is in strategy: which path they chose to attack the problem."
        ),
        "distinguishing_marker": (
            "vs Conceptual: the student isn't missing knowledge — they have the tools "
            "but chose poorly which to apply. vs Execution: Execution is a slip during "
            "a chosen approach. Strategy is about the choice of approach itself."
        ),
        "severity_rank": 3,
    },
    {
        "slug": "conceptual",
        "name": "Conceptual",
        "definition": (
            "The student got it wrong because they don't understand the underlying "
            "mathematical concept, rule, or relationship. They wouldn't get it right "
            "even with infinite time and care — the gap is in what they know, not "
            "what they did."
        ),
        "distinguishing_marker": (
            "Did the student reach for the right tool, or the wrong tool? If they "
            "used a known-correct rule and slipped while applying it, that's Execution. "
            "If they applied a non-existent rule, used the wrong concept entirely, or "
            "didn't know the relevant concept exists, that's Conceptual."
        ),
        "severity_rank": 4,
    },
]


SUBCATEGORIES: list[dict[str, Any]] = [
    # Conceptual sub-categories
    {
        "slug": "definition-errors",
        "category": "conceptual",
        "name": "Definition errors",
        "definition": "Misunderstands what a term, symbol, or notation means.",
    },
    {
        "slug": "property-rule-errors",
        "category": "conceptual",
        "name": "Property / rule errors",
        "definition": "Applies a rule that doesn't exist, or misapplies a foundational property.",
    },
    {
        "slug": "relational-errors",
        "category": "conceptual",
        "name": "Relational errors",
        "definition": (
            "Doesn't connect related concepts. Treats two representations of the same"
            " idea as unrelated."
        ),
    },
    {
        "slug": "domain-applicability-errors",
        "category": "conceptual",
        "name": "Domain / applicability errors",
        "definition": "Doesn't recognize when a concept applies (or doesn't).",
    },
    # Execution sub-categories
    {
        "slug": "arithmetic",
        "category": "execution",
        "name": "Arithmetic",
        "definition": (
            "Slips in basic computation: addition, subtraction, multiplication,"
            " division, sign tracking."
        ),
    },
    {
        "slug": "algebraic-manipulation",
        "category": "execution",
        "name": "Algebraic manipulation",
        "definition": (
            "Slips in symbolic rule application: distribution, combining like terms,"
            " moving terms across =, factoring."
        ),
    },
    {
        "slug": "procedural-multi-step",
        "category": "execution",
        "name": "Procedural / multi-step",
        "definition": (
            "Skips a step in a known procedure, applies steps out of order, or gives"
            " up midway."
        ),
    },
    {
        "slug": "notation-transcription",
        "category": "execution",
        "name": "Notation / transcription",
        "definition": (
            "Knows the math, mis-writes it. The error is in the recording, not the"
            " reasoning."
        ),
    },
    # Verification sub-categories
    {
        "slug": "no-check",
        "category": "verification",
        "name": "No-check errors",
        "definition": (
            "Student didn't verify at all when they should have. The work looks"
            " finished but skips an obvious validation step."
        ),
    },
    {
        "slug": "reasonableness",
        "category": "verification",
        "name": "Reasonableness / sanity errors",
        "definition": "Student didn't ask whether the answer makes sense in context.",
    },
    {
        "slug": "domain-check",
        "category": "verification",
        "name": "Domain-checking errors",
        "definition": (
            "Student didn't check that their answer lies in the valid domain. Distinct"
            " from Conceptual domain errors: here the student knew domains existed but"
            " forgot to check."
        ),
    },
    {
        "slug": "units-dimensional",
        "category": "verification",
        "name": "Unit / dimensional errors",
        "definition": "Student didn't check that units match across the problem.",
    },
    # Strategy sub-categories
    {
        "slug": "wrong-strategy",
        "category": "strategy",
        "name": "Wrong strategy / inefficient attack",
        "definition": (
            "Student picks a path that can work but is needlessly complex, or that's"
            " wrong for this problem class."
        ),
    },
    {
        "slug": "incomplete",
        "category": "strategy",
        "name": "Incomplete attempt",
        "definition": (
            "Student gives up partway through. Visible as work that started reasonable"
            " but stops mid-problem."
        ),
    },
    {
        "slug": "no-attempt",
        "category": "strategy",
        "name": "No attempt",
        "definition": (
            "Student leaves the problem completely blank. No work shown at all."
            " Special handling — bypasses the full taxonomy walk."
        ),
    },
    {
        "slug": "over-procedure",
        "category": "strategy",
        "name": "Over-reliance on memorized procedure",
        "definition": "Student applies a procedure from rote memory that doesn't fit the problem.",
    },
]


PATTERNS: list[dict[str, Any]] = [
    # Conceptual leaves
    {
        "slug": "exponent-over-addition",
        "subcategory": "property-rule-errors",
        "name": "Exponent over addition",
        "description": "Distributes an exponent over an addition as if it were a multiplication.",
        "canonical_example": "(a+b)^2 = a^2 + b^2",
        "topics": ["Algebra I", "Algebra II"],
        "severity_hint": "medium",
    },
    {
        "slug": "radical-over-addition",
        "subcategory": "property-rule-errors",
        "name": "Radical over addition",
        "description": "Distributes a square root over an addition.",
        "canonical_example": "sqrt(a^2 + b^2) = a + b",
        "topics": ["Algebra I", "Algebra II"],
        "severity_hint": "medium",
    },
    {
        "slug": "log-of-sum",
        "subcategory": "property-rule-errors",
        "name": "Log of a sum",
        "description": (
            "Applies log distribution over addition (the rule applies to"
            " multiplication, not addition)."
        ),
        "canonical_example": "log(a + b) = log a + log b",
        "topics": ["Algebra II", "Pre-Calc"],
        "severity_hint": "medium",
    },
    {
        "slug": "slope-vs-y-intercept",
        "subcategory": "definition-errors",
        "name": "Slope vs. y-intercept",
        "description": "Confuses m and b in y = mx + b.",
        "canonical_example": "y = 3x + 2 -> reports slope = 2, y-intercept = 3",
        "topics": ["Algebra I"],
        "severity_hint": "medium",
    },
    {
        "slug": "function-notation-as-multiplication",
        "subcategory": "definition-errors",
        "name": "Function notation read as multiplication",
        "description": "Interprets f(x) as the product f times x.",
        "canonical_example": "f(x) = x + 3 -> evaluates f(2) as f * 2 instead of 2 + 3",
        "topics": ["Algebra I", "Algebra II"],
        "severity_hint": "medium",
    },
    {
        "slug": "pythagorean-on-non-right",
        "subcategory": "domain-applicability-errors",
        "name": "Pythagorean on non-right triangle",
        "description": (
            "Applies a^2 + b^2 = c^2 to a triangle without confirming it has a right"
            " angle."
        ),
        "canonical_example": (
            "Triangle with sides 5, 7, 9 (no right angle) — student writes"
            " 5^2 + 7^2 = 9^2"
        ),
        "topics": ["Geometry"],
        "severity_hint": "medium",
    },
    {
        "slug": "sqrt-without-plus-minus",
        "subcategory": "domain-applicability-errors",
        "name": "Square root without plus-or-minus",
        "description": "Takes the square root of both sides without considering the negative root.",
        "canonical_example": "x^2 = 9 -> x = 3 (misses x = -3)",
        "topics": ["Algebra I"],
        "severity_hint": "medium",
    },
    {
        "slug": "graph-equation-disconnect",
        "subcategory": "relational-errors",
        "name": "Graph-equation disconnect",
        "description": "Can't recognize the same line / curve in algebraic and graphical form.",
        "canonical_example": (
            "Given y = 2x + 1 and a graph of the same line, treats them as unrelated"
            " problems"
        ),
        "topics": ["Algebra I"],
        "severity_hint": "medium",
    },
    # Execution leaves
    {
        "slug": "sign-flip-on-distribution",
        "subcategory": "arithmetic",
        "name": "Sign flip on distribution",
        "description": (
            "Distributes a negative coefficient and forgets to flip the sign on a"
            " non-leading term."
        ),
        "canonical_example": "-3(x - 2) = -3x - 6  (should be -3x + 6)",
        "topics": ["Algebra I", "Algebra II", "Pre-Calc"],
        "severity_hint": "light",
    },
    {
        "slug": "times-tables-slip",
        "subcategory": "arithmetic",
        "name": "Multiplication-table slip",
        "description": "Single-digit multiplication slip.",
        "canonical_example": "7 * 8 = 54",
        "topics": ["Algebra I", "Algebra II", "Geometry", "Pre-Calc"],
        "severity_hint": "light",
    },
    {
        "slug": "sign-drop",
        "subcategory": "arithmetic",
        "name": "Sign drop",
        "description": "Drops a negative sign somewhere mid-equation.",
        "canonical_example": "-2x + 5 = 11  ->  2x + 5 = 11 (negative dropped)",
        "topics": ["Algebra I", "Algebra II", "Pre-Calc"],
        "severity_hint": "light",
    },
    {
        "slug": "combine-unlike-terms",
        "subcategory": "algebraic-manipulation",
        "name": "Combine unlike terms",
        "description": (
            "Adds or combines terms with different variables as if they were like"
            " terms."
        ),
        "canonical_example": "2x + 3y = 5xy",
        "topics": ["Algebra I"],
        "severity_hint": "medium",
    },
    {
        "slug": "sqrt-without-absolute-value",
        "subcategory": "algebraic-manipulation",
        "name": "Square root without absolute value",
        "description": "Simplifies sqrt(x^2) to x without preserving absolute value.",
        "canonical_example": "sqrt(x^2) = x  (should be |x|)",
        "topics": ["Algebra II", "Pre-Calc"],
        "severity_hint": "medium",
    },
    {
        "slug": "quadratic-formula-step-skip",
        "subcategory": "procedural-multi-step",
        "name": "Quadratic formula step skip",
        "description": (
            "Quadratic formula but forgets to divide by 2a, or omits the"
            " plus-or-minus on the discriminant."
        ),
        "canonical_example": (
            "Solves x^2 - 5x + 6 = 0 and writes x = (5 + sqrt(1)) (forgot /2)"
        ),
        "topics": ["Algebra I", "Algebra II"],
        "severity_hint": "light",
    },
    {
        "slug": "foil-incomplete",
        "subcategory": "procedural-multi-step",
        "name": "FOIL incomplete",
        "description": "Distributes only first*first and last*last, misses cross terms.",
        "canonical_example": "(x + 2)(x + 3) = x^2 + 6  (missed 5x cross term)",
        "topics": ["Algebra I"],
        "severity_hint": "medium",
    },
    {
        "slug": "digit-transcription",
        "subcategory": "notation-transcription",
        "name": "Digit transcription error",
        "description": "Copies a digit incorrectly from one line to the next.",
        "canonical_example": "Line 1: 7x = 28; Line 2: 1x = 28 (wrote 1 instead of 7)",
        "topics": ["Algebra I", "Algebra II", "Geometry", "Pre-Calc"],
        "severity_hint": "light",
    },
    # Verification leaves
    {
        "slug": "extraneous-root-not-rejected",
        "subcategory": "no-check",
        "name": "Extraneous root not rejected",
        "description": (
            "Keeps both roots after a squaring step without checking which (if any)"
            " actually satisfy the original equation."
        ),
        "canonical_example": (
            "sqrt(x + 3) = -2  ->  squares both sides, gets x = 1, doesn't check"
            " that sqrt(4) = 2, not -2"
        ),
        "topics": ["Algebra II"],
        "severity_hint": "medium",
    },
    {
        "slug": "root-not-substituted-back",
        "subcategory": "no-check",
        "name": "Root not substituted back",
        "description": "Solves an equation, never plugs the answer back in to verify.",
        "canonical_example": (
            "Solves a quadratic for x = 2, x = -3; doesn't substitute either back"
            " into the original equation"
        ),
        "topics": ["Algebra I", "Algebra II"],
        "severity_hint": "light",
    },
    {
        "slug": "non-integer-count",
        "subcategory": "reasonableness",
        "name": "Non-integer count",
        "description": (
            "Word problem about a discrete count yields a fractional answer that"
            " should have been flagged."
        ),
        "canonical_example": "How many students went on the trip? Answer: 7.4 students.",
        "topics": ["Algebra I", "Algebra II"],
        "severity_hint": "light",
    },
    {
        "slug": "negative-magnitude",
        "subcategory": "reasonableness",
        "name": "Negative magnitude",
        "description": (
            "Computes a negative value for a quantity that must be non-negative"
            " (length, area, time)."
        ),
        "canonical_example": (
            "Geometry problem: length of a side comes out -7. Student writes the"
            " answer down."
        ),
        "topics": ["Geometry", "Algebra I"],
        "severity_hint": "light",
    },
    {
        "slug": "magnitude-impossible",
        "subcategory": "reasonableness",
        "name": "Impossible magnitude",
        "description": "Answer wildly larger or smaller than what the problem context allows.",
        "canonical_example": "Word problem says 'less than 100 students.' Answer: 350 students.",
        "topics": ["Algebra I", "Algebra II"],
        "severity_hint": "light",
    },
    {
        "slug": "division-by-zero-uncaught",
        "subcategory": "domain-check",
        "name": "Division by zero uncaught",
        "description": "Solution makes a denominator vanish; student doesn't notice.",
        "canonical_example": (
            "Equation has (x - 2) in denominator. Solution comes out x = 2. Student"
            " reports x = 2."
        ),
        "topics": ["Algebra II"],
        "severity_hint": "medium",
    },
    {
        "slug": "degrees-radians-mismatch",
        "subcategory": "units-dimensional",
        "name": "Degrees / radians mismatch",
        "description": (
            "Calculator in wrong mode, or computes in one unit and reports in the"
            " other."
        ),
        "canonical_example": (
            "sin(30) computed in radians mode, returned as 0.5 (only true in degrees)"
        ),
        "topics": ["Pre-Calc", "Trigonometry"],
        "severity_hint": "medium",
    },
    {
        "slug": "linear-vs-square-units",
        "subcategory": "units-dimensional",
        "name": "Linear vs. square units",
        "description": "Reports area in linear units instead of square units (or vice versa).",
        "canonical_example": "Computes area of a rectangle as 24 cm (should be 24 cm^2)",
        "topics": ["Geometry"],
        "severity_hint": "light",
    },
    # Strategy leaves
    {
        "slug": "brute-force-unsystematic",
        "subcategory": "wrong-strategy",
        "name": "Brute-force unsystematic search",
        "description": "Guess-and-check on a problem that has a direct algebraic solution.",
        "canonical_example": (
            "Solve 3x + 7 = 22. Student tries x=1, x=2, x=3, ... until they hit it"
            " (or run out of time)."
        ),
        "topics": ["Algebra I"],
        "severity_hint": "medium",
    },
    {
        "slug": "substitution-when-elimination-wins",
        "subcategory": "wrong-strategy",
        "name": "Substitution when elimination wins",
        "description": "Picks the harder approach for a system of equations.",
        "canonical_example": (
            "Symmetric system like x + y = 7, x - y = 1 — student substitutes instead"
            " of adding the equations."
        ),
        "topics": ["Algebra I", "Algebra II"],
        "severity_hint": "light",
    },
    {
        "slug": "stopped-midway",
        "subcategory": "incomplete",
        "name": "Stopped midway",
        "description": "Sets up correctly, abandoned before solving.",
        "canonical_example": (
            "Word problem: student writes the right equation, then stops without"
            " solving"
        ),
        "topics": ["Algebra I", "Algebra II", "Geometry", "Pre-Calc"],
        "severity_hint": "medium",
    },
    {
        "slug": "skip",
        "subcategory": "no-attempt",
        "name": "Skipped problem",
        "description": (
            "Left blank. No work shown at all. Special handling: bypasses the full"
            " taxonomy walk."
        ),
        "canonical_example": "Problem 4: blank.",
        "topics": ["Algebra I", "Algebra II", "Geometry", "Pre-Calc"],
        "severity_hint": "medium",
    },
    {
        "slug": "misapplied-formula",
        "subcategory": "over-procedure",
        "name": "Misapplied formula",
        "description": "Rote formula on the wrong problem class.",
        "canonical_example": "Linear equation 3x = 9; student applies the quadratic formula.",
        "topics": ["Algebra I", "Algebra II"],
        "severity_hint": "medium",
    },
]


# ---------- Validation + seeding ----------

_VALID_SEVERITY_HINTS = {"light", "medium", "heavy"}
_REQUIRED_SEVERITY_RANKS = {1, 2, 3, 4}


@dataclass(frozen=True)
class SeedReport:
    categories_inserted: int
    categories_updated: int
    subcategories_inserted: int
    subcategories_updated: int
    patterns_inserted: int
    patterns_updated: int


def validate(
    categories: list[dict[str, Any]],
    subcategories: list[dict[str, Any]],
    patterns: list[dict[str, Any]],
) -> None:
    """Validate the in-file taxonomy data. Raises ValueError on any problem."""
    # 1. Category slugs unique
    cat_slugs = [c["slug"] for c in categories]
    if len(cat_slugs) != len(set(cat_slugs)):
        raise ValueError(f"Duplicate category slug in CATEGORIES: {cat_slugs}")
    cat_slug_set = set(cat_slugs)

    # 2. Severity ranks form complete {1,2,3,4} set
    ranks = {c["severity_rank"] for c in categories}
    if ranks != _REQUIRED_SEVERITY_RANKS:
        raise ValueError(
            f"Category severity_rank values must be exactly {{1,2,3,4}}, got {sorted(ranks)}"
        )

    # 3. Subcategory slugs unique
    sub_slugs = [s["slug"] for s in subcategories]
    if len(sub_slugs) != len(set(sub_slugs)):
        raise ValueError(f"Duplicate subcategory slug in SUBCATEGORIES: {sub_slugs}")
    sub_slug_set = set(sub_slugs)

    # 4. Each subcategory's parent category must exist
    for s in subcategories:
        if s["category"] not in cat_slug_set:
            raise ValueError(
                f"Subcategory '{s['slug']}' references unknown category '{s['category']}'"
            )

    # 5. Pattern slugs unique
    pat_slugs = [p["slug"] for p in patterns]
    if len(pat_slugs) != len(set(pat_slugs)):
        raise ValueError(f"Duplicate pattern slug in PATTERNS: {pat_slugs}")

    # 6. Each pattern's parent subcategory must exist
    for p in patterns:
        if p["subcategory"] not in sub_slug_set:
            raise ValueError(
                f"Pattern '{p['slug']}' references unknown subcategory '{p['subcategory']}'"
            )

    # 7. severity_hint allowed values
    for p in patterns:
        if p["severity_hint"] not in _VALID_SEVERITY_HINTS:
            raise ValueError(
                f"Pattern '{p['slug']}' has invalid severity_hint "
                f"'{p['severity_hint']}'; must be one of {_VALID_SEVERITY_HINTS}"
            )

    # 8. topics non-empty
    for p in patterns:
        if not p["topics"]:
            raise ValueError(f"Pattern '{p['slug']}' has empty topics list")


async def seed(
    db: AsyncSession,
    categories: list[dict[str, Any]] | None = None,
    subcategories: list[dict[str, Any]] | None = None,
    patterns: list[dict[str, Any]] | None = None,
) -> SeedReport:
    """Seed the taxonomy tables idempotently. Validates first, then UPSERTs by slug."""
    cats = categories if categories is not None else CATEGORIES
    subs = subcategories if subcategories is not None else SUBCATEGORIES
    pats = patterns if patterns is not None else PATTERNS

    validate(cats, subs, pats)

    # --- Categories ---
    cats_existing_before = {
        row.slug
        for row in (await db.execute(select(ErrorCategory))).scalars().all()
    }
    for c in cats:
        stmt = pg_insert(ErrorCategory).values(
            slug=c["slug"],
            name=c["name"],
            definition=c["definition"],
            distinguishing_marker=c["distinguishing_marker"],
            severity_rank=c["severity_rank"],
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["slug"],
            set_={
                "name": stmt.excluded.name,
                "definition": stmt.excluded.definition,
                "distinguishing_marker": stmt.excluded.distinguishing_marker,
                "severity_rank": stmt.excluded.severity_rank,
            },
        )
        await db.execute(stmt)
    await db.flush()

    cats_after = {
        row.slug: row.id
        for row in (await db.execute(select(ErrorCategory))).scalars().all()
    }
    cats_inserted = sum(1 for slug in cats_after if slug not in cats_existing_before)
    cats_updated = len(cats) - cats_inserted

    # --- Subcategories ---
    subs_existing_before = {
        row.slug
        for row in (await db.execute(select(ErrorSubcategory))).scalars().all()
    }
    for s in subs:
        category_id = cats_after[s["category"]]
        stmt = pg_insert(ErrorSubcategory).values(
            slug=s["slug"],
            category_id=category_id,
            name=s["name"],
            definition=s["definition"],
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["slug"],
            set_={
                "category_id": stmt.excluded.category_id,
                "name": stmt.excluded.name,
                "definition": stmt.excluded.definition,
            },
        )
        await db.execute(stmt)
    await db.flush()

    subs_after = {
        row.slug: row.id
        for row in (await db.execute(select(ErrorSubcategory))).scalars().all()
    }
    subs_inserted = sum(1 for slug in subs_after if slug not in subs_existing_before)
    subs_updated = len(subs) - subs_inserted

    # --- Patterns ---
    pats_existing_before = {
        row.slug
        for row in (await db.execute(select(ErrorPattern))).scalars().all()
    }
    for p in pats:
        subcategory_id = subs_after[p["subcategory"]]
        stmt = pg_insert(ErrorPattern).values(
            slug=p["slug"],
            subcategory_id=subcategory_id,
            name=p["name"],
            description=p["description"],
            canonical_example=p["canonical_example"],
            topics=p["topics"],
            severity_hint=p["severity_hint"],
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["slug"],
            set_={
                "subcategory_id": stmt.excluded.subcategory_id,
                "name": stmt.excluded.name,
                "description": stmt.excluded.description,
                "canonical_example": stmt.excluded.canonical_example,
                "topics": stmt.excluded.topics,
                "severity_hint": stmt.excluded.severity_hint,
            },
        )
        await db.execute(stmt)
    await db.flush()

    pats_after = {
        row.slug
        for row in (await db.execute(select(ErrorPattern))).scalars().all()
    }
    pats_inserted = sum(1 for slug in pats_after if slug not in pats_existing_before)
    pats_updated = len(pats) - pats_inserted

    return SeedReport(
        categories_inserted=cats_inserted,
        categories_updated=cats_updated,
        subcategories_inserted=subs_inserted,
        subcategories_updated=subs_updated,
        patterns_inserted=pats_inserted,
        patterns_updated=pats_updated,
    )


async def _main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    async with async_session_factory() as db, db.begin():
        report = await seed(db)
    logger.info(
        "Taxonomy seed complete: "
        "categories +%d/~%d, subcategories +%d/~%d, patterns +%d/~%d",
        report.categories_inserted,
        report.categories_updated,
        report.subcategories_inserted,
        report.subcategories_updated,
        report.patterns_inserted,
        report.patterns_updated,
    )


if __name__ == "__main__":
    asyncio.run(_main())
