"""Tests for claude_service.call_vision."""

from __future__ import annotations

import base64
from unittest.mock import AsyncMock, MagicMock, patch

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grade_sight_api.models.audit_log import AuditLog
from grade_sight_api.models.llm_call_log import LLMCallLog
from grade_sight_api.models.organization import Organization
from grade_sight_api.services import claude_service
from grade_sight_api.services.call_context import CallContext


async def _seed_org(session: AsyncSession) -> Organization:
    org = Organization(name="Test Org")
    session.add(org)
    await session.flush()
    return org


def _fake_response(text: str, tokens_in: int, tokens_out: int) -> MagicMock:
    response = MagicMock()
    response.content = [MagicMock(text=text)]
    response.usage = MagicMock(input_tokens=tokens_in, output_tokens=tokens_out)
    return response


async def test_call_vision_with_bytes_writes_audit_when_pii(
    async_session: AsyncSession,
) -> None:
    org = await _seed_org(async_session)
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="diagnostic_classify",
        contains_pii=True,
        audit_reason="grade student work",
    )

    fake = _fake_response("rough work shown", tokens_in=20, tokens_out=8)
    with patch.object(
        claude_service, "_get_client",
        return_value=MagicMock(messages=MagicMock(create=AsyncMock(return_value=fake))),
    ):
        response = await claude_service.call_vision(
            ctx=ctx,
            model="claude-sonnet-4-6",
            system="describe",
            image=b"\x00\x01fake-png-bytes\x02\x03",
            prompt="What do you see?",
            max_tokens=100,
            db=async_session,
        )

    assert response.text == "rough work shown"
    assert response.tokens_input == 20

    llm_rows = (await async_session.execute(select(LLMCallLog))).scalars().all()
    assert len(llm_rows) == 1
    assert llm_rows[0].success is True

    audit_rows = (await async_session.execute(select(AuditLog))).scalars().all()
    assert len(audit_rows) == 1
    assert audit_rows[0].action == "claude_vision_call"
    assert audit_rows[0].event_metadata["audit_reason"] == "grade student work"


async def test_call_vision_with_url_string(async_session: AsyncSession) -> None:
    org = await _seed_org(async_session)
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="vision_test",
        contains_pii=False,
    )

    fake = _fake_response("ok", tokens_in=5, tokens_out=2)
    create_mock = AsyncMock(return_value=fake)
    with patch.object(
        claude_service, "_get_client",
        return_value=MagicMock(messages=MagicMock(create=create_mock)),
    ):
        await claude_service.call_vision(
            ctx=ctx,
            model="claude-sonnet-4-6",
            system="describe",
            image="https://example.com/image.png",
            prompt="What do you see?",
            max_tokens=100,
            db=async_session,
        )

    # Inspect the message Anthropic was called with
    call_kwargs = create_mock.call_args.kwargs
    user_message = call_kwargs["messages"][0]
    image_block = user_message["content"][0]
    assert image_block["type"] == "image"
    assert image_block["source"]["type"] == "url"
    assert image_block["source"]["url"] == "https://example.com/image.png"


async def test_call_vision_bytes_uses_base64_source(
    async_session: AsyncSession,
) -> None:
    org = await _seed_org(async_session)
    ctx = CallContext(
        organization_id=org.id,
        user_id=None,
        request_type="vision_test",
        contains_pii=False,
    )

    fake = _fake_response("ok", tokens_in=5, tokens_out=2)
    create_mock = AsyncMock(return_value=fake)
    with patch.object(
        claude_service, "_get_client",
        return_value=MagicMock(messages=MagicMock(create=create_mock)),
    ):
        await claude_service.call_vision(
            ctx=ctx,
            model="claude-sonnet-4-6",
            system="x",
            image=b"PNGFAKE",
            prompt="x",
            max_tokens=10,
            db=async_session,
        )

    call_kwargs = create_mock.call_args.kwargs
    source = call_kwargs["messages"][0]["content"][0]["source"]
    assert source["type"] == "base64"
    assert source["data"] == base64.b64encode(b"PNGFAKE").decode("ascii")
