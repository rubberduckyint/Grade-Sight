"""Tests for GET /api/error-patterns."""
from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.auth.dependencies import get_current_user
from grade_sight_api.db import get_session
from grade_sight_api.main import app
from grade_sight_api.models.error_category import ErrorCategory
from grade_sight_api.models.error_pattern import ErrorPattern
from grade_sight_api.models.error_subcategory import ErrorSubcategory
from grade_sight_api.models.organization import Organization
from grade_sight_api.models.user import User, UserRole


async def _seed_user(session: AsyncSession) -> User:
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
    session.add(user)
    await session.flush()
    return user


@pytest.mark.db
async def test_returns_active_patterns_ordered(async_session: AsyncSession) -> None:
    user = await _seed_user(async_session)

    cat = ErrorCategory(
        slug="conceptual",
        name="Conceptual",
        definition="Errors in understanding.",
        distinguishing_marker="Student shows faulty concept.",
        severity_rank=1,
    )
    async_session.add(cat)
    await async_session.flush()

    sub = ErrorSubcategory(
        slug="conceptual-general",
        category_id=cat.id,
        name="General",
        definition="General conceptual errors.",
    )
    async_session.add(sub)
    await async_session.flush()

    pat_b = ErrorPattern(
        slug="b-pat",
        name="B Pattern",
        subcategory_id=sub.id,
        description="B description.",
        canonical_example="B example.",
        severity_hint="low",
    )
    pat_a = ErrorPattern(
        slug="a-pat",
        name="A Pattern",
        subcategory_id=sub.id,
        description="A description.",
        canonical_example="A example.",
        severity_hint="low",
    )
    async_session.add_all([pat_b, pat_a])
    await async_session.flush()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = lambda: async_session
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/error-patterns")
            assert response.status_code == 200
            body = response.json()
            assert isinstance(body, list)
            # Filter to only the two rows seeded by this test; other patterns
            # from concurrent seed_minimal_taxonomy fixtures are irrelevant.
            slugs = [row["slug"] for row in body if row["slug"] in {"a-pat", "b-pat"}]
            assert slugs == ["a-pat", "b-pat"]
            sample = next(row for row in body if row["slug"] == "a-pat")
            assert sample["name"] == "A Pattern"
            assert sample["category_slug"] == "conceptual"
            assert sample["category_name"] == "Conceptual"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_unauthenticated_returns_401(async_session: AsyncSession) -> None:
    """No auth dependency override → real auth runs → no token → 401 (or 403)."""
    app.dependency_overrides[get_session] = lambda: async_session
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/error-patterns")
            assert response.status_code in {401, 403}
    finally:
        app.dependency_overrides.clear()
