"""FastAPI application entry point."""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .db import engine, get_session
from .routers import answer_keys as answer_keys_router
from .routers import assessments as assessments_router
from .routers import billing as billing_router
from .routers import me as me_router
from .routers import students as students_router
from .routers.webhooks import stripe as stripe_webhook_router
from .services.sentry_init import setup_sentry


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Dispose of the async engine cleanly on shutdown."""
    try:
        yield
    finally:
        await engine.dispose()


setup_sentry(environment=settings.environment, dsn=settings.sentry_dsn)

app = FastAPI(title="Grade-Sight API", version="0.0.0", lifespan=lifespan)

app.include_router(me_router.router)
app.include_router(billing_router.router)
app.include_router(students_router.router)
app.include_router(answer_keys_router.router)
app.include_router(assessments_router.router)
app.include_router(stripe_webhook_router.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    """Baseline health check — returns OK without touching the DB."""
    return {"status": "ok", "environment": settings.environment}


@app.get("/api/db-health")
async def db_health(db: AsyncSession = Depends(get_session)) -> dict[str, object]:
    """Verify DB connectivity with a round-trip SELECT 1."""
    started = time.perf_counter()
    try:
        result = await db.execute(text("SELECT 1"))
        _ = result.scalar()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"db unreachable: {exc.__class__.__name__}",
        ) from exc
    latency_ms = int((time.perf_counter() - started) * 1000)
    return {"status": "ok", "latency_ms": latency_ms}


@app.get("/api/_smoke/raise")
def smoke_raise() -> None:
    """TEMPORARY: Spec 13 Sentry smoke test. Remove after verification."""
    raise RuntimeError("sentry smoke test")
