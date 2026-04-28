"""Tests for the Sentry init gate.

setup_sentry() must be a no-op unless ENVIRONMENT == "production" AND
SENTRY_DSN is set. We mock sentry_sdk.init and assert call/no-call.
"""

from __future__ import annotations

import os
from unittest.mock import patch

from grade_sight_api.services import sentry_init


def test_setup_sentry_noop_when_dsn_missing() -> None:
    with patch.object(sentry_init.sentry_sdk, "init") as mock_init:
        sentry_init.setup_sentry(environment="production", dsn=None)
        mock_init.assert_not_called()


def test_setup_sentry_noop_when_environment_not_production() -> None:
    with patch.object(sentry_init.sentry_sdk, "init") as mock_init:
        sentry_init.setup_sentry(environment="development", dsn="https://x@o0.ingest.us.sentry.io/1")
        mock_init.assert_not_called()


def test_setup_sentry_initializes_when_both_present() -> None:
    with patch.object(sentry_init.sentry_sdk, "init") as mock_init:
        sentry_init.setup_sentry(
            environment="production",
            dsn="https://x@o0.ingest.us.sentry.io/1",
        )
        mock_init.assert_called_once()
        kwargs = mock_init.call_args.kwargs
        assert kwargs["dsn"] == "https://x@o0.ingest.us.sentry.io/1"
        assert kwargs["environment"] == "production"
        assert kwargs["traces_sample_rate"] == 0.1
        assert kwargs["send_default_pii"] is False
        assert kwargs["before_send"] is sentry_init.scrub_event


def test_setup_sentry_release_from_railway_env() -> None:
    with (
        patch.object(sentry_init.sentry_sdk, "init") as mock_init,
        patch.dict(os.environ, {"RAILWAY_GIT_COMMIT_SHA": "abc123def"}, clear=False),
    ):
        sentry_init.setup_sentry(
            environment="production",
            dsn="https://x@o0.ingest.us.sentry.io/1",
        )
        kwargs = mock_init.call_args.kwargs
        assert kwargs["release"] == "abc123def"
