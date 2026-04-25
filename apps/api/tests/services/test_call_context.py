"""Tests for CallContext dataclass."""

from __future__ import annotations

from uuid import uuid4

import pytest

from grade_sight_api.services.call_context import CallContext


def test_call_context_constructs_without_pii() -> None:
    ctx = CallContext(
        organization_id=uuid4(),
        user_id=uuid4(),
        request_type="diagnostic_classify",
        contains_pii=False,
    )
    assert ctx.contains_pii is False
    assert ctx.audit_reason is None


def test_call_context_constructs_with_pii_and_reason() -> None:
    ctx = CallContext(
        organization_id=uuid4(),
        user_id=uuid4(),
        request_type="diagnostic_classify",
        contains_pii=True,
        audit_reason="grade student work",
    )
    assert ctx.contains_pii is True
    assert ctx.audit_reason == "grade student work"


def test_call_context_rejects_pii_without_reason() -> None:
    with pytest.raises(ValueError, match="audit_reason is required"):
        CallContext(
            organization_id=uuid4(),
            user_id=uuid4(),
            request_type="diagnostic_classify",
            contains_pii=True,
        )


def test_call_context_is_frozen() -> None:
    ctx = CallContext(
        organization_id=uuid4(),
        user_id=None,
        request_type="webhook_event",
        contains_pii=False,
    )
    with pytest.raises(Exception):  # noqa: B017  # FrozenInstanceError, but exact name is dataclass-internal
        ctx.contains_pii = True  # type: ignore[misc]


def test_call_context_accepts_none_user_id() -> None:
    """System-initiated calls (e.g., webhook handlers) have no user."""
    ctx = CallContext(
        organization_id=uuid4(),
        user_id=None,
        request_type="webhook_event",
        contains_pii=False,
    )
    assert ctx.user_id is None
