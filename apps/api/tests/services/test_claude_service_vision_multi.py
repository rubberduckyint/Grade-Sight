"""Tests for claude_service.call_vision_multi (extension to support N images
+ optional prompt caching on the system block)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.organization import Organization
from grade_sight_api.services import claude_service
from grade_sight_api.services.call_context import CallContext


async def _seed_org(session: AsyncSession) -> Organization:
    org = Organization(name="Test Org")
    session.add(org)
    await session.flush()
    return org


def _build_mock_anthropic_response() -> MagicMock:
    """Mimic the shape of anthropic's MessageResponse."""
    block = MagicMock()
    block.text = '{"problems": []}'
    response = MagicMock()
    response.content = [block]
    response.usage = MagicMock()
    response.usage.input_tokens = 100
    response.usage.output_tokens = 20
    return response


async def test_call_vision_multi_with_cache_system_marks_cache_control(
    async_session: AsyncSession,
) -> None:
    """When cache_system=True, the system block has cache_control: ephemeral."""
    org = await _seed_org(async_session)
    fake_response = _build_mock_anthropic_response()
    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(return_value=fake_response)

    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="diagnostic_engine",
        contains_pii=True,
        audit_reason="test multi vision call",
    )

    with patch.object(
        claude_service, "_get_client", return_value=mock_client
    ):
        await claude_service.call_vision_multi(
            ctx=ctx,
            model="claude-sonnet-4-6",
            system="taxonomy goes here",
            images=["https://example.com/page1.png", "https://example.com/page2.png"],
            prompt="Diagnose this assessment.",
            max_tokens=4096,
            cache_system=True,
            db=async_session,
        )

    assert mock_client.messages.create.await_count == 1
    kwargs = mock_client.messages.create.await_args.kwargs

    # System block must carry cache_control: ephemeral.
    system = kwargs["system"]
    assert isinstance(system, list)
    assert len(system) == 1
    assert system[0]["type"] == "text"
    assert system[0]["text"] == "taxonomy goes here"
    assert system[0]["cache_control"] == {"type": "ephemeral"}

    # User message must contain 2 image blocks + 1 text block.
    messages = kwargs["messages"]
    assert len(messages) == 1
    assert messages[0]["role"] == "user"
    content = messages[0]["content"]
    assert len([b for b in content if b["type"] == "image"]) == 2
    assert len([b for b in content if b["type"] == "text"]) == 1


async def test_call_vision_multi_without_cache_uses_string_system(
    async_session: AsyncSession,
) -> None:
    """When cache_system=False, the system parameter is a plain string."""
    org = await _seed_org(async_session)
    fake_response = _build_mock_anthropic_response()
    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(return_value=fake_response)

    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="diagnostic_engine",
        contains_pii=False,
        audit_reason="no-cache test",
    )

    with patch.object(
        claude_service, "_get_client", return_value=mock_client
    ):
        await claude_service.call_vision_multi(
            ctx=ctx,
            model="claude-sonnet-4-6",
            system="plain string system",
            images=["https://example.com/p.png"],
            prompt="Diagnose.",
            max_tokens=4096,
            cache_system=False,
            db=async_session,
        )

    kwargs = mock_client.messages.create.await_args.kwargs
    assert kwargs["system"] == "plain string system"
