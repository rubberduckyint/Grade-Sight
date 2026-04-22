"""FastAPI application entry point."""

from fastapi import FastAPI

from .config import settings

app = FastAPI(title="Grade-Sight API", version="0.0.0")


@app.get("/api/health")
def health() -> dict[str, str]:
    """Health check — returns OK unconditionally in Spec 1."""
    return {"status": "ok", "environment": settings.environment}
