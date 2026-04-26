# Lazy-Upsert Cleanup — Design

**Spec 6 of Phase 1 MVP**
**Date:** 2026-04-25
**Status:** approved (design)

## Goal

Prevent orphan Clerk orgs and Stripe customers when the lazy-upsert in `get_current_user` fails partway through. Surfaced during Spec 4 acceptance: a single signup with a transient post-external-call DB error left a Clerk org + Stripe customer in production while our DB transaction rolled back.

The advisory lock added in Spec 4 fixed *concurrent-request* leaks (10 orphans from 10 racing retries). This spec fixes *single-request mid-flow* leaks (1 orphan from 1 partial failure).

## Scope

**In scope:**
- Wrap the create-branch of `get_current_user` in try/except.
- New helper `_cleanup_partial_lazy_upsert(*, clerk_org_id, stripe_customer_id)` — best-effort delete of whichever external resources got created.
- Unit tests covering the three failure-point cases.

**Out of scope (deferred):**
- Reordering the lazy-upsert flow ("DB first, externals second"). Would survive process death, but requires schema migration (nullable `stripe_customer_id` etc.) and substantially more state tracking. Defer until we observe Railway-restart-mid-signup in production.
- Background reconciliation job. Not warranted at current orphan rate.
- One-shot cleanup script for existing orphans — manually cleaned during Spec 4 acceptance; future orphans will be visible in the Clerk/Stripe dashboards.
- The `existing-user` branch of `get_current_user` doesn't create external resources, so no changes there.

## Architectural choice

**Try/except compensating cleanup, not flow reordering.** The realistic failure modes (network blip mid-call, transient API error, DB connection drop) are all caught by try/except. Reordering survives process death but adds schema migration cost and ongoing state-tracking complexity. For a 1-engineer MVP team, simpler wins.

The cleanup is **best-effort**: each external delete is independently try/except'd, failures log at WARNING with `exc_info=True`, and the original exception is what surfaces to the caller. The user gets a 500; the next request runs lazy-upsert fresh on a clean slate (because cleanup deleted what was created).

## Failure-point mapping

| Failure point | clerk_org_id | stripe_customer_id | Cleanup action |
|---|---|---|---|
| Clerk org create raises | `None` | `None` | nothing |
| DB org INSERT raises | set | `None` | delete Clerk org |
| Stripe customer create raises | set | `None` | delete Clerk org |
| Subscription INSERT raises | set | set | delete both |
| User INSERT raises | set | set | delete both |

The advisory lock is `pg_advisory_xact_lock` (transaction-scoped) — DB transaction rollback auto-releases it. No manual lock release needed.

## Components

### `_cleanup_partial_lazy_upsert` (new, in `auth/dependencies.py`)

```python
async def _cleanup_partial_lazy_upsert(
    *,
    clerk_org_id: str | None,
    stripe_customer_id: str | None,
) -> None:
    """Best-effort cleanup of external resources created during a failed lazy upsert.

    Each delete is independently try/except'd — cleanup-of-cleanup failures
    log at WARNING with exc_info, and never propagate. The caller's original
    exception is what surfaces to FastAPI's error handler.
    """
    if clerk_org_id:
        try:
            clerk_client.organizations.delete(organization_id=clerk_org_id)
        except Exception:
            logger.warning(
                "Lazy upsert cleanup: failed to delete Clerk org %s",
                clerk_org_id,
                exc_info=True,
            )
    if stripe_customer_id:
        try:
            await stripe.Customer.delete_async(stripe_customer_id)
        except Exception:
            logger.warning(
                "Lazy upsert cleanup: failed to delete Stripe customer %s",
                stripe_customer_id,
                exc_info=True,
            )
```

### `get_current_user` create branch (modified)

The existing flow stays. The diff is:
- Initialize `clerk_org_id: str | None = None` and `stripe_customer_id: str | None = None` before the create steps.
- Wrap steps 2-6 (Clerk create through user INSERT) in `try:`.
- On `except Exception:` — call `_cleanup_partial_lazy_upsert(...)`, then `raise`.
- Track each ID into the local var as soon as it's known so cleanup has the right state.

## Testing

Three unit tests in `apps/api/tests/auth/test_lazy_upsert_cleanup.py`. All mock `clerk_client.organizations`, `stripe.Customer`, and use the DB session fixture.

1. **Stripe customer creation fails** — patch `stripe_service.create_customer` to raise; assert `clerk_client.organizations.delete` called with the Clerk org ID; assert `stripe.Customer.delete_async` NOT called.
2. **DB user INSERT fails** — patch `db.add(user_row)` (or simulate via a unique constraint pre-violation) to raise on flush; assert both Clerk delete and Stripe customer delete are called.
3. **Cleanup itself fails** — patch Clerk delete to raise; assert a `WARNING` log is emitted with `exc_info=True`; assert the original exception (not the cleanup exception) is what propagates; assert Stripe delete is still attempted.

No smoke test. Real failure paths against production resources are brittle, and the cleanup logic is fully exercised by mocks.

## Out of this spec

- Reordering for process-death resilience.
- Background reconciliation job.
- Logging/alerting infrastructure (Sentry breadcrumb in cleanup) — separate observability spec.

## Estimated implementation

Three tasks: helper + create-branch wrapping (one task), tests (one task), CLAUDE.md update (one task). Probably 30-45 minutes of subagent work plus reviews.
