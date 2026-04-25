"""CallContext — explicit per-call metadata for external service calls.

Constructed once at the route handler (or in a dependency that knows the
authenticated user/org), then passed by reference to every service-layer
function. Frozen so a service cannot mutate it. Validates the
data-minimization rule from CLAUDE.md §3 at construction time.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class CallContext:
    """Per-call metadata for external service invocations.

    Fields:
        organization_id: Tenant boundary; required for every audit/log row.
        user_id: Acting user. None for system-initiated calls (webhook handlers).
        request_type: Free-form short string (e.g. "diagnostic_classify",
            "presigned_upload"). Recorded on llm_call_logs and audit_log so
            cost and access dashboards can group by purpose.
        contains_pii: Explicit acknowledgment that the call carries PII.
            False guarantees no PII; True triggers an audit_log entry.
        audit_reason: Human-readable reason this call needs PII access.
            Required when contains_pii=True; appears in audit_log.
    """

    organization_id: UUID
    user_id: UUID | None
    request_type: str
    contains_pii: bool
    audit_reason: str | None = None

    def __post_init__(self) -> None:
        if self.contains_pii and not self.audit_reason:
            raise ValueError(
                "audit_reason is required when contains_pii=True"
            )
