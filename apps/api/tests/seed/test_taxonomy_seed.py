"""Unit tests for the taxonomy seed script."""

from __future__ import annotations

from typing import Any

import pytest
from scripts.seed_taxonomy import (
    CATEGORIES,
    PATTERNS,
    SUBCATEGORIES,
    seed,
    validate,
)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.error_category import ErrorCategory
from grade_sight_api.models.error_pattern import ErrorPattern
from grade_sight_api.models.error_subcategory import ErrorSubcategory


async def test_seed_runs_clean_on_empty_db(async_session: AsyncSession) -> None:
    report = await seed(async_session)
    await async_session.flush()

    cats = (await async_session.execute(select(ErrorCategory))).scalars().all()
    subs = (await async_session.execute(select(ErrorSubcategory))).scalars().all()
    pats = (await async_session.execute(select(ErrorPattern))).scalars().all()

    assert len(cats) == 4
    assert len(subs) == 16
    assert len(pats) == 29

    assert report.categories_inserted == 4
    assert report.categories_updated == 0
    assert report.subcategories_inserted == 16
    assert report.subcategories_updated == 0
    assert report.patterns_inserted == 29
    assert report.patterns_updated == 0

    # Spot checks
    cat_slugs = {c.slug for c in cats}
    assert cat_slugs == {"verification", "execution", "strategy", "conceptual"}

    sub_slugs = {s.slug for s in subs}
    assert "property-rule-errors" in sub_slugs

    pat_slugs = {p.slug for p in pats}
    assert "exponent-over-addition" in pat_slugs


async def test_seed_is_idempotent(async_session: AsyncSession) -> None:
    await seed(async_session)
    await async_session.flush()
    first_count = (
        await async_session.execute(select(func.count()).select_from(ErrorPattern))
    ).scalar_one()

    report2 = await seed(async_session)
    await async_session.flush()
    second_count = (
        await async_session.execute(select(func.count()).select_from(ErrorPattern))
    ).scalar_one()

    assert first_count == second_count == 29
    # Second run should be all updates, no inserts
    assert report2.categories_inserted == 0
    assert report2.categories_updated == 4
    assert report2.subcategories_inserted == 0
    assert report2.subcategories_updated == 16
    assert report2.patterns_inserted == 0
    assert report2.patterns_updated == 29


async def test_seed_updates_in_place_when_data_changes(
    async_session: AsyncSession,
) -> None:
    await seed(async_session)
    await async_session.flush()

    # Modify a category in a copy of the data and re-seed
    modified_categories: list[dict[str, Any]] = [dict(c) for c in CATEGORIES]
    for c in modified_categories:
        if c["slug"] == "conceptual":
            c["definition"] = "MUTATED-FOR-TEST"
            break

    await seed(
        async_session,
        categories=modified_categories,
        subcategories=SUBCATEGORIES,
        patterns=PATTERNS,
    )
    await async_session.flush()

    row = (
        await async_session.execute(
            select(ErrorCategory).where(ErrorCategory.slug == "conceptual")
        )
    ).scalar_one()
    assert row.definition == "MUTATED-FOR-TEST"
    # Confirm we didn't add a duplicate
    count = (
        await async_session.execute(select(func.count()).select_from(ErrorCategory))
    ).scalar_one()
    assert count == 4


def test_validate_rejects_orphan_subcategory() -> None:
    bogus_subs = [
        {
            "slug": "bogus",
            "category": "doesnt-exist",
            "name": "Bogus",
            "definition": "x",
        },
    ]
    with pytest.raises(ValueError, match="bogus"):
        validate(CATEGORIES, bogus_subs, PATTERNS)


def test_validate_rejects_incomplete_severity_ranks() -> None:
    # Three categories with ranks {1, 2, 4} — missing 3
    incomplete = [
        {
            "slug": "a",
            "name": "A",
            "definition": "x",
            "distinguishing_marker": "y",
            "severity_rank": 1,
        },
        {
            "slug": "b",
            "name": "B",
            "definition": "x",
            "distinguishing_marker": "y",
            "severity_rank": 2,
        },
        {
            "slug": "c",
            "name": "C",
            "definition": "x",
            "distinguishing_marker": "y",
            "severity_rank": 2,
        },
        {
            "slug": "d",
            "name": "D",
            "definition": "x",
            "distinguishing_marker": "y",
            "severity_rank": 4,
        },
    ]
    with pytest.raises(ValueError, match="severity_rank"):
        validate(incomplete, [], [])
