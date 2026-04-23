"""AsyncEngine, async session factory, and FastAPI dependency.

One process-wide engine, bound sessionmaker. get_session() yields an
AsyncSession that commits on success, rolls back on exception, and closes
on exit — the canonical FastAPI DB dep pattern.
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from ..config import settings


def asyncpg_url(url: str) -> str:
    """Normalize a Postgres URL to use the asyncpg driver.

    Railway's ${{Postgres.DATABASE_URL}} variable reference resolves to a
    plain `postgresql://...` URL; SQLAlchemy's create_async_engine requires
    the `+asyncpg` driver suffix. Idempotent — leaves already-prefixed URLs
    (and non-postgres URLs, which shouldn't happen) untouched.
    """
    if "+asyncpg" in url:
        return url
    return url.replace("postgresql://", "postgresql+asyncpg://", 1)


engine: AsyncEngine = create_async_engine(
    asyncpg_url(str(settings.database_url)),
    pool_pre_ping=True,
    future=True,
)

async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield an AsyncSession for a FastAPI request.

    Commits on successful exit; rolls back on exception; always closes.
    """
    session = async_session_factory()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()
