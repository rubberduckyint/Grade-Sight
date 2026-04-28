"""Sentry before_send hook — strips PII before any event leaves the process.

Applied via sentry_sdk.init(before_send=scrub_event). Returns None to drop
the event entirely if scrubbing itself raises (better to lose an error
than leak PII).

What this strips:
- request headers/cookies/body/query_string (all bulk-removed)
- email-shaped strings in logentry message fields and exception value strings
- presigned R2 URLs in logentry message fields and exception value strings
- frame vars 'image', 'images', 'prompt', 'system' in claude_service frames
- user.email / user.username / user.ip_address (only user.id allowed)

What this preserves:
- stack traces, exception types, non-PII frame vars
- tags (environment, release, service)
- user.id (pseudonymous UUID)
- breadcrumbs (handled by send_default_pii=False at init time)
"""

from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_R2_URL_RE = re.compile(r"https://[A-Za-z0-9.\-]+\.r2\.cloudflarestorage\.com/\S*")
_PII_FRAME_VARS = frozenset({"image", "images", "prompt", "system"})
_CLAUDE_SERVICE_MODULE = "grade_sight_api.services.claude_service"


def _redact_string(s: str) -> str:
    s = _EMAIL_RE.sub("[redacted-email]", s)
    s = _R2_URL_RE.sub("[redacted-r2-url]", s)
    return s


def scrub_event(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any] | None:
    """Strip PII from a Sentry event in-place and return it. Drop on error."""
    try:
        # 1. Bulk-remove request body fields that may contain PII.
        request = event.get("request")
        if isinstance(request, dict):
            for key in ("headers", "cookies", "data", "query_string"):
                request.pop(key, None)

        # 2. Strip non-allowlisted user fields. Only user.id survives.
        user = event.get("user")
        if isinstance(user, dict):
            user_id = user.get("id")
            event["user"] = {"id": user_id} if user_id is not None else {}

        # 3. Redact email + R2 URL patterns from logentry.formatted/message.
        logentry = event.get("logentry")
        if isinstance(logentry, dict):
            for key in ("formatted", "message"):
                value = logentry.get(key)
                if isinstance(value, str):
                    logentry[key] = _redact_string(value)

        # 3b. Redact email + R2 URL patterns from exception value strings.
        exc_for_msg = event.get("exception")
        if isinstance(exc_for_msg, dict):
            for exc_val in exc_for_msg.get("values") or []:
                if isinstance(exc_val, dict):
                    raw_val = exc_val.get("value")
                    if isinstance(raw_val, str):
                        exc_val["value"] = _redact_string(raw_val)

        # 4. Remove PII-shaped frame vars in claude_service frames.
        exc = event.get("exception")
        if isinstance(exc, dict):
            values = exc.get("values")
            if isinstance(values, list):
                for value in values:
                    if not isinstance(value, dict):
                        continue
                    stacktrace = value.get("stacktrace")
                    if not isinstance(stacktrace, dict):
                        continue
                    frames = stacktrace.get("frames")
                    if not isinstance(frames, list):
                        continue
                    for frame in frames:
                        if not isinstance(frame, dict):
                            continue
                        frame_vars = frame.get("vars")
                        if isinstance(frame_vars, dict):
                            module = frame.get("module") or ""
                            if module == _CLAUDE_SERVICE_MODULE:
                                for var_name in list(frame_vars.keys()):
                                    if var_name in _PII_FRAME_VARS:
                                        frame_vars.pop(var_name)

        return event
    except Exception:
        logger.warning("sentry scrub_event raised; dropping event", exc_info=True)
        return None
