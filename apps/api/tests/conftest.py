"""Pytest fixtures for Grade-Sight API tests.

No tests are defined yet; this file exists so DB-backed tests can be
added later without another scaffolding pass.

Fixtures:
- async_engine: module-scope AsyncEngine bound to TEST_DATABASE_URL
  (falls back to DATABASE_URL with _test suffix).
- async_session: function-scope AsyncSession inside a SAVEPOINT; rolled
  back at the end of each test for isolation.

Tests that need DB access should be marked @pytest.mark.db.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

import pytest
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from grade_sight_api.config import settings


def _test_database_url() -> str:
    """Use TEST_DATABASE_URL if set, otherwise DATABASE_URL with _test suffix."""
    if settings.test_database_url is not None:
        return str(settings.test_database_url)
    base = str(settings.database_url)
    # Naive suffix strategy: append _test to the DB name.
    # Safe enough for Phase 1; revisit if multiple engineers share a dev DB.
    if base.endswith("/grade_sight"):
        return base.replace("/grade_sight", "/grade_sight_test")
    return base + "_test"


@pytest.fixture
async def async_engine() -> AsyncGenerator[AsyncEngine, None]:
    """Function-scoped AsyncEngine bound to the test DB.

    Function-scoped (not module-scoped) so that each test gets an engine
    whose connection pool is tied to the current event loop. asyncpg pools
    are loop-bound; reusing a module-scoped engine across function-scoped
    test loops raises 'Future attached to a different loop'.
    """
    test_engine = create_async_engine(_test_database_url(), pool_pre_ping=True)
    try:
        yield test_engine
    finally:
        await test_engine.dispose()


@pytest.fixture
async def async_session(async_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """Function-scoped AsyncSession wrapped in a SAVEPOINT for rollback isolation."""
    async with async_engine.connect() as connection:
        transaction = await connection.begin()
        session_factory = async_sessionmaker(bind=connection, expire_on_commit=False)
        async with session_factory() as session:
            try:
                yield session
            finally:
                await transaction.rollback()


@pytest.fixture
async def seed_organization(async_session: AsyncSession) -> None:
    """Stub factory — no-op until a test needs it."""
    _ = async_session
    return None


@pytest.fixture
async def seed_user(async_session: AsyncSession) -> None:
    """Stub factory — no-op until a test needs it."""
    _ = async_session
    return None
