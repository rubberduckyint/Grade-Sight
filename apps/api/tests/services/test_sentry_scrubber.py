"""Tests for the Sentry before_send scrubber.

Each test feeds a synthetic Sentry event through scrub_event() and asserts
PII shapes are removed while non-PII fields are preserved. The scrubber must
also fail safe — return None to drop the event if scrubbing itself raises.
"""

from __future__ import annotations

from typing import Any

from grade_sight_api.services.sentry_scrubber import scrub_event


def test_scrub_strips_request_headers() -> None:
    event: dict[str, Any] = {
        "request": {
            "headers": {"authorization": "Bearer abc", "cookie": "session=xyz"},
            "url": "https://api.example.com/api/assessments",
        }
    }
    cleaned = scrub_event(event, hint={})
    assert cleaned is not None
    assert "headers" not in cleaned["request"]
    assert cleaned["request"]["url"] == "https://api.example.com/api/assessments"


def test_scrub_strips_request_cookies() -> None:
    event: dict[str, Any] = {"request": {"cookies": {"__session": "abc123"}}}
    cleaned = scrub_event(event, hint={})
    assert cleaned is not None
    assert "cookies" not in cleaned["request"]


def test_scrub_strips_request_body() -> None:
    event: dict[str, Any] = {
        "request": {
            "data": {"student_name": "Lily Smith", "original_filename": "Lily_Algebra2.pdf"}
        }
    }
    cleaned = scrub_event(event, hint={})
    assert cleaned is not None
    assert "data" not in cleaned["request"]


def test_scrub_strips_query_string() -> None:
    event: dict[str, Any] = {"request": {"query_string": "student_email=lily@example.com"}}
    cleaned = scrub_event(event, hint={})
    assert cleaned is not None
    assert "query_string" not in cleaned["request"]


def test_scrub_strips_emails_in_messages() -> None:
    event: dict[str, Any] = {
        "logentry": {"formatted": "Failed to send to lily@example.com"}
    }
    cleaned = scrub_event(event, hint={})
    assert cleaned is not None
    assert "lily@example.com" not in cleaned["logentry"]["formatted"]


def test_scrub_strips_r2_presigned_urls() -> None:
    event: dict[str, Any] = {
        "logentry": {
            "formatted": "Upload failed: https://abc.r2.cloudflarestorage.com/bucket/key?X-Amz-Signature=foo"
        }
    }
    cleaned = scrub_event(event, hint={})
    assert cleaned is not None
    assert "r2.cloudflarestorage.com" not in cleaned["logentry"]["formatted"]


def test_scrub_strips_image_frame_vars_in_claude_service() -> None:
    event: dict[str, Any] = {
        "exception": {
            "values": [
                {
                    "stacktrace": {
                        "frames": [
                            {
                                "module": "grade_sight_api.services.claude_service",
                                "function": "call_vision",
                                "vars": {
                                    "image": "<base64 megabytes>",
                                    "prompt": "Grade this work",
                                    "system": "You are a math grader",
                                    "model": "claude-sonnet-4-6",
                                },
                            }
                        ]
                    }
                }
            ]
        }
    }
    cleaned = scrub_event(event, hint={})
    assert cleaned is not None
    frame = cleaned["exception"]["values"][0]["stacktrace"]["frames"][0]
    assert "image" not in frame["vars"]
    assert "prompt" not in frame["vars"]
    assert "system" not in frame["vars"]
    # Non-PII frame var preserved
    assert frame["vars"]["model"] == "claude-sonnet-4-6"


def test_scrub_strips_user_email_username_ip() -> None:
    event: dict[str, Any] = {
        "user": {
            "id": "00000000-0000-0000-0000-000000000001",
            "email": "lily@example.com",
            "username": "lily.smith",
            "ip_address": "203.0.113.5",
        }
    }
    cleaned = scrub_event(event, hint={})
    assert cleaned is not None
    assert cleaned["user"] == {"id": "00000000-0000-0000-0000-000000000001"}


def test_scrub_preserves_non_pii_fields() -> None:
    event: dict[str, Any] = {
        "tags": {"environment": "production", "release": "abc123", "service": "api"},
        "level": "error",
        "exception": {"values": [{"type": "ValueError", "value": "bad input"}]},
    }
    cleaned = scrub_event(event, hint={})
    assert cleaned is not None
    assert cleaned["tags"]["release"] == "abc123"
    assert cleaned["exception"]["values"][0]["type"] == "ValueError"


def test_scrub_returns_none_on_internal_exception() -> None:
    # Pathological input: scrubber's regex paths assume strings; force a TypeError.
    event: object = ["not", "a", "dict"]
    cleaned = scrub_event(event, hint={})  # type: ignore[arg-type]
    assert cleaned is None
