"""Verify get_current_user attaches pseudonymous user context to Sentry.

Sentry receives the internal User.id UUID and an organization_id tag — never
email, username, or other PII. Test patches sentry_sdk.set_user / set_tag and
asserts call args.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch
from uuid import UUID

from grade_sight_api.auth import dependencies


def test_attach_sentry_user_context_sets_id_only() -> None:
    user = MagicMock()
    user.id = UUID("11111111-1111-1111-1111-111111111111")
    user.organization_id = UUID("22222222-2222-2222-2222-222222222222")

    with (
        patch.object(dependencies.sentry_sdk, "set_user") as mock_set_user,
        patch.object(dependencies.sentry_sdk, "set_tag") as mock_set_tag,
    ):
        dependencies._attach_sentry_user_context(user)

    mock_set_user.assert_called_once_with({"id": "11111111-1111-1111-1111-111111111111"})
    mock_set_tag.assert_called_once_with(
        "organization_id", "22222222-2222-2222-2222-222222222222"
    )


def test_attach_sentry_user_context_handles_null_organization() -> None:
    user = MagicMock()
    user.id = UUID("11111111-1111-1111-1111-111111111111")
    user.organization_id = None

    with (
        patch.object(dependencies.sentry_sdk, "set_user") as mock_set_user,
        patch.object(dependencies.sentry_sdk, "set_tag") as mock_set_tag,
    ):
        dependencies._attach_sentry_user_context(user)

    mock_set_user.assert_called_once_with({"id": "11111111-1111-1111-1111-111111111111"})
    mock_set_tag.assert_not_called()


def test_attach_sentry_user_context_swallows_sdk_exceptions() -> None:
    """If sentry_sdk.set_user raises, the helper must not propagate.

    Privacy/observability infra must never break the auth hot path. A
    misconfigured Sentry should produce missing Sentry events, not 500s.
    """
    user = MagicMock()
    user.id = UUID("11111111-1111-1111-1111-111111111111")
    user.organization_id = UUID("22222222-2222-2222-2222-222222222222")

    with patch.object(
        dependencies.sentry_sdk, "set_user", side_effect=RuntimeError("boom")
    ):
        # Must not raise.
        dependencies._attach_sentry_user_context(user)
