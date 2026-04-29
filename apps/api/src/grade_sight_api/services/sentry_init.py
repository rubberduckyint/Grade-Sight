"""Sentry initialization, gated on ENVIRONMENT=production AND SENTRY_DSN set.

setup_sentry() is called once from main.py before the FastAPI app is built.
When the gate fails, sentry_sdk.init() is never called — no transport, no
breadcrumbs, no events.

Uses sentry_sdk's auto-enabling integrations (FastAPI, AsyncPG, SQLAlchemy
auto-detect when their packages are present), with our before_send scrubber
applied to every event.
"""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING, cast

import sentry_sdk

from .sentry_scrubber import scrub_event

if TYPE_CHECKING:
    from sentry_sdk._types import EventProcessor

__all__ = ["scrub_event", "sentry_sdk", "setup_sentry"]

logger = logging.getLogger(__name__)


def setup_sentry(*, environment: str, dsn: str | None) -> None:
    """Initialize Sentry only when running in production with a DSN set."""
    if environment != "production":
        logger.info("Sentry init skipped: environment=%s (not production)", environment)
        return
    if not dsn:
        logger.info("Sentry init skipped: SENTRY_DSN not set")
        return

    release = os.environ.get("RAILWAY_GIT_COMMIT_SHA")
    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        release=release,
        traces_sample_rate=0.1,
        send_default_pii=False,
        before_send=cast("EventProcessor", scrub_event),
    )
    sentry_sdk.set_tag("service", "api")
    logger.info("Sentry initialized: environment=%s release=%s", environment, release)
