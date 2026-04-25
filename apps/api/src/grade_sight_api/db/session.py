"""AsyncEngine, async session factory, and FastAPI dependency.

One process-wide engine, bound sessionmaker. get_session() yields an
AsyncSession that commits on success, rolls back on exception, and closes
on exit — the canonical FastAPI DB dep pattern.
"""

import json
from collections.abc import AsyncGenerator
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from ..config import settings


def _json_default(obj: Any) -> Any:
    """JSON fallback encoder for SQLAlchemy JSONB columns.

    Stripe event payloads include Decimal amounts; stdlib json can't serialize
    those. Convert to str to preserve monetary precision (float would lose it).
    """
    if isinstance(obj, Decimal):
        return str(obj)
    raise TypeError(f"Object of type {obj.__class__.__name__} is not JSON serializable")


def _json_serializer(value: Any) -> str:
    return json.dumps(value, default=_json_default)


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
    json_serializer=_json_serializer,
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
