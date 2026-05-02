# Step 13b · Privacy — Design Spec

**Date:** 2026-05-01
**Branch:** `step-13b-privacy`
**Scope:** Replace the `/settings/privacy` "Coming soon" stub with editorial copy from the Supporting Surfaces canvas plus a working **Delete my account & all data** affordance using soft-delete with a 30-day grace window. Hard-purge cron, data-export-zip, and the four canvas toggles (photo retention, diagnosis history, email-when-processed, second-parent share) are deferred to followups.

---

## 1. Goal

Land the privacy positioning on `/settings/privacy` and ship the most legally-loaded affordance — a self-serve right-to-delete — without inventing four other features that each deserve their own brainstorm.

The page also has a strategic role: privacy-as-acquisition-lever (per project memory). Editorial copy is hard-coded from the canvas and ships verbatim. A separate copy-fact-check pass happens after the platform is functional end-to-end (per workflow memory).

## 2. Scope

### In scope

- Replace `/settings/privacy/page.tsx` body. The existing `<SettingsLayout>` shell (Profile/Privacy/Billing tabs + auth gate) is untouched.
- New page `/account-deleted` (no auth gate) — landing page after delete.
- Backend `POST /api/users/me/delete` — soft-delete cascade + Stripe cancellation + audit log.
- New service `apps/api/src/grade_sight_api/services/account_deletion_service.py`.
- Schema check: `organizations.deleted_at` column. Add via alembic migration if missing.
- Verify `get_current_user` rejects soft-deleted users. Add `deleted_at IS NULL` filter if missing — security gate.

### Out of scope (deferred — see §10)

- Hard-purge cron (Railway scheduled task)
- Data export `.zip` download
- Photo retention preferences (no schema)
- Diagnosis history toggle (no schema)
- Email-when-processed (no transactional email infra)
- Second-parent share (multi-account-per-student feature)
- Multi-teacher org delete branch
- Copy fact-check pass

## 3. Architecture

### Routes

| Path | Auth | What it is |
|---|---|---|
| `/settings/privacy` | authenticated user (any role) | Editorial body + delete-account affordance. Replaces existing stub inside `<SettingsLayout>`. |
| `/account-deleted` | none | Post-delete landing page. |

### Backend

| Path | Method | Behavior |
|---|---|---|
| `/api/users/me/delete` | `POST` | Soft-deletes the authenticated user + all owned tenant data, cancels Stripe at period end, writes audit log. Returns 204. No body. |

### Frontend component layout

```
apps/web/components/privacy/
  privacy-header.tsx          (eyebrow + h1 + subhead — editorial)
  what-we-keep-section.tsx    (one section row: eyebrow + title + body)
  what-we-keep-block.tsx      (composes the 4 sections with canvas copy)
  delete-account-section.tsx  (bottom destructive zone — server)
  delete-account-button.tsx   (client; opens dialog)
  delete-account-dialog.tsx   (client; type-email confirm + submit)

apps/web/app/settings/privacy/page.tsx  (rewrites the stub body)
apps/web/app/account-deleted/page.tsx   (new — landing page)
```

### Backend file layout

```
apps/api/src/grade_sight_api/
  routers/users.py                                    (new — POST /api/users/me/delete)
  services/account_deletion_service.py                (new — orchestrator)
  alembic/versions/<timestamp>_organizations_deleted_at.py  (only if column missing)
```

## 4. Data flow

```
Browser GET /settings/privacy
  ↓ (Settings layout already gates auth)
Renders: PrivacyHeader + WhatWeKeepBlock + DeleteAccountSection(email=user.email)
  ↓
User clicks "Delete account & all data"
  ↓
DeleteAccountDialog opens (shadcn Dialog)
  ↓
User types their email → confirm button enables on exact-match (case-insensitive trim)
  ↓
Click confirm → POST /api/users/me/delete via deleteSelf() server action
  ↓
Backend (single transaction):
  1. Stripe: cancel_at_period_end=true on active subscription (try/except — log + proceed on failure)
  2. Soft-delete cascade (parent vs teacher branch)
  3. Soft-delete user.deleted_at = now()
  4. audit_log entry: event_type="user_self_deleted"
  5. Return 204
  ↓
Frontend:
  1. Clerk signOut()
  2. router.push("/account-deleted")
```

## 5. Frontend — `/settings/privacy`

### Page composition

```tsx
// apps/web/app/settings/privacy/page.tsx
import { redirect } from "next/navigation";
import { fetchMe } from "@/lib/api";
import { PrivacyHeader } from "@/components/privacy/privacy-header";
import { WhatWeKeepBlock } from "@/components/privacy/what-we-keep-block";
import { DeleteAccountSection } from "@/components/privacy/delete-account-section";

export default async function PrivacyPage() {
  const user = await fetchMe();
  if (!user) redirect("/sign-in");

  return (
    <>
      <PrivacyHeader />
      <WhatWeKeepBlock />
      <DeleteAccountSection email={user.email} />
    </>
  );
}
```

The `<SettingsLayout>` (`apps/web/app/settings/layout.tsx`) already handles auth redirect and the Profile/Privacy/Billing tabs.

### `<PrivacyHeader>` (server)

```tsx
// editorial header — verbatim canvas copy
<header className="mb-14">
  <SectionEyebrow>Settings · Privacy &amp; data</SectionEyebrow>
  <div className="mt-4">
    <SerifHeadline level="page" as="h1">What we keep, and for how long.</SerifHeadline>
  </div>
  <p className="mt-3 font-serif text-xl font-light text-ink-soft leading-relaxed max-w-[720px]">
    Plain English. Edit anything below at any time. Deleting a quiz removes it from our servers within 24 hours.
  </p>
</header>
```

### `<WhatWeKeepBlock>` and `<WhatWeKeepSection>` (server)

Block composes 4 sections with canvas copy. Each section is a 2-col grid (`grid-cols-[180px_1fr]`) with mono uppercase eyebrow on left and serif title + body on right. Sections separated by `border-b border-rule-soft` (last section has no border).

```tsx
// Verbatim canvas copy
const SECTIONS = [
  {
    eyebrow: "WHAT WE STORE",
    title: "Quiz photos, the diagnosis, your child's name.",
    body: "Photos are encrypted. The diagnosis (what we found, what the pattern was) is plain JSON. Your child's name lives only on your account — we don't share it with anyone.",
  },
  {
    eyebrow: "WHAT WE NEVER STORE",
    title: "Faces. School names. Anything not on the quiz.",
    body: "If a photo includes a face or a school logo by accident, our processor blurs it before storing. We don't ask for or keep school identifiers.",
  },
  {
    eyebrow: "HOW LONG",
    title: "30 days by default. You can shorten it.",
    body: "After 30 days the photos auto-delete. The diagnosis (text only) stays in your history so longitudinal tracking works — unless you delete that too.",
  },
  {
    eyebrow: "AI TRAINING",
    title: "Off. We don't train on your child's work.",
    body: "Period. This is enforced at the database level, not a setting we can flip.",
  },
];
```

(The deferred-copy-review rule applies — these claims will be fact-checked in a later pass.)

### `<DeleteAccountSection>` and `<DeleteAccountButton>` / `<DeleteAccountDialog>`

`DeleteAccountSection` (server) — bottom destructive zone:

```tsx
<section className="mt-16 border-t border-rule pt-12">
  <SectionEyebrow>Your data</SectionEyebrow>
  <div className="mt-4 mb-3">
    <SerifHeadline level="section" as="h2">Delete your account.</SerifHeadline>
  </div>
  <p className="text-base text-ink-soft max-w-[640px] mb-8">
    This removes your account, all student data, and cancels your subscription.
    We keep a 30-day grace window in case you change your mind, then permanently
    purge everything.
  </p>
  <DeleteAccountButton email={email} />
</section>
```

`DeleteAccountButton` (client) — wraps `<DeleteAccountDialog>`:

```tsx
"use client";
export function DeleteAccountButton({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-[var(--radius-sm)] border border-mark px-5 py-2.5 font-sans text-sm text-mark hover:bg-mark hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mark"
      >
        Delete account & all data
      </button>
      <DeleteAccountDialog open={open} onOpenChange={setOpen} email={email} />
    </>
  );
}
```

`DeleteAccountDialog` (client) — type-email confirm pattern:

```tsx
"use client";
export function DeleteAccountDialog({ open, onOpenChange, email }: ...) {
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { signOut } = useClerk();

  const matches = typed.trim().toLowerCase() === email.trim().toLowerCase();

  function onConfirm() {
    startTransition(async () => {
      try {
        await deleteSelf();
        await signOut();
        router.push("/account-deleted");
      } catch {
        toast.error("Couldn't delete the account — try again.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete account &amp; all data</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-ink-soft mb-4">
          This is permanent after a 30-day grace window. To confirm, type your
          email address.
        </p>
        <input
          type="email"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={email}
          className="w-full rounded-[var(--radius-sm)] border border-rule px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-[var(--radius-sm)] border border-rule px-4 py-2 text-sm text-ink-soft hover:bg-paper-soft"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!matches || pending}
            onClick={onConfirm}
            className="rounded-[var(--radius-sm)] bg-mark px-4 py-2 text-sm text-paper disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### Server action

```ts
// apps/web/lib/actions.ts (extends existing actions file)
export async function deleteSelf(): Promise<void> {
  const response = await callApi("/api/users/me/delete", { method: "POST" });
  if (!response.ok) {
    throw new Error(`POST /api/users/me/delete failed: ${response.status}`);
  }
}
```

### `/account-deleted` landing page (new)

```tsx
// apps/web/app/account-deleted/page.tsx
import Link from "next/link";
import { PageContainer } from "@/components/page-container";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";

export default function AccountDeletedPage() {
  return (
    <PageContainer className="py-24">
      <SectionEyebrow>Account deleted</SectionEyebrow>
      <div className="mt-3 mb-6">
        <SerifHeadline level="page" as="h1">Your account is gone.</SerifHeadline>
      </div>
      <p className="text-base text-ink-soft max-w-[640px]">
        Your data will be permanently removed within 30 days. If this was a
        mistake, email support@gradesight.com within that window to restore
        the account.
      </p>
      <div className="mt-10">
        <Link href="/" className="font-mono text-xs uppercase tracking-[0.12em] text-accent">
          Back to home →
        </Link>
      </div>
    </PageContainer>
  );
}
```

No auth gate. No `<AppShell>` (signed-out user lands here).

## 6. Backend

### Router

```python
# apps/api/src/grade_sight_api/routers/users.py
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import get_current_user
from ..db import get_session
from ..models.user import User
from ..services import account_deletion_service

router = APIRouter()


@router.post("/api/users/me/delete", status_code=status.HTTP_204_NO_CONTENT)
async def delete_self(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    await account_deletion_service.soft_delete_user(user=user, db=db)
```

Register the new router in `apps/api/src/grade_sight_api/main.py` (the existing pattern for routers).

### Service

```python
# apps/api/src/grade_sight_api/services/account_deletion_service.py
"""Cascade soft-delete a user and their owned tenant data.

The 30-day hard-purge job is intentionally deferred — see followups.md.
"""
from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy import update, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.user import User, UserRole
from ..models.organization import Organization
from ..models.student import Student
from ..models.student_profile import StudentProfile
from ..models.assessment import Assessment
from ..models.assessment_page import AssessmentPage
from ..models.assessment_diagnosis import AssessmentDiagnosis
from ..models.problem_observation import ProblemObservation
from ..models.diagnostic_review import DiagnosticReview
from ..models.answer_key import AnswerKey
from ..models.answer_key_page import AnswerKeyPage
from ..models.klass import Klass
from ..models.class_member import ClassMember
from ..models.subscription import Subscription
from ..models.audit_log import AuditLog
from . import stripe_service


class MultiTeacherOrgError(Exception):
    """Raised when a teacher tries to delete in an org with other teachers — not v1 behavior."""


async def soft_delete_user(*, user: User, db: AsyncSession) -> None:
    now = datetime.now(timezone.utc)

    # 1. Stripe cancellation (best-effort)
    sub_result = await db.execute(
        select(Subscription).where(
            Subscription.user_id == user.id,
            Subscription.deleted_at.is_(None),
        )
    )
    subscription = sub_result.scalar_one_or_none()
    if subscription is not None and subscription.stripe_subscription_id:
        try:
            await stripe_service.cancel_at_period_end(subscription.stripe_subscription_id)
        except Exception as exc:  # noqa: BLE001
            db.add(AuditLog(
                user_id=user.id,
                organization_id=user.organization_id,
                event_type="subscription_cancel_failed",
                details={"stripe_subscription_id": subscription.stripe_subscription_id, "error": str(exc)},
            ))

    # 2. Multi-teacher guard (v1 supports single-teacher orgs only)
    if user.role == UserRole.teacher and user.organization_id is not None:
        other_teachers = await db.execute(
            select(User).where(
                User.organization_id == user.organization_id,
                User.id != user.id,
                User.deleted_at.is_(None),
                User.role == UserRole.teacher,
            )
        )
        if other_teachers.scalar_one_or_none() is not None:
            raise MultiTeacherOrgError("multi-teacher org delete not supported in v1")

    # 3. Cascade soft-delete (per role)
    cascade_counts: dict[str, int] = {}

    if user.role == UserRole.parent or user.organization_id is None:
        # Parent: scope by created_by_user_id
        for model in (Student, Assessment, AnswerKey):
            result = await db.execute(
                update(model)
                .where(model.created_by_user_id == user.id, model.deleted_at.is_(None))
                .values(deleted_at=now)
                .returning(model.id)
            )
            cascade_counts[model.__tablename__] = len(result.all())
        # Cascade through child tables keyed off the soft-deleted parents
        for model, parent_table, fk in (
            (StudentProfile, Student, "student_id"),
            (AssessmentPage, Assessment, "assessment_id"),
            (AssessmentDiagnosis, Assessment, "assessment_id"),
            (ProblemObservation, AssessmentDiagnosis, "diagnosis_id"),
            (DiagnosticReview, Assessment, "assessment_id"),
            (AnswerKeyPage, AnswerKey, "answer_key_id"),
        ):
            await db.execute(
                update(model)
                .where(
                    getattr(model, fk).in_(
                        select(parent_table.id).where(parent_table.deleted_at == now)
                    ),
                    model.deleted_at.is_(None),
                )
                .values(deleted_at=now)
            )
    else:
        # Teacher (single-teacher org): scope by org
        org_id = user.organization_id
        for model in (Student, Assessment, AnswerKey, Klass):
            result = await db.execute(
                update(model)
                .where(model.organization_id == org_id, model.deleted_at.is_(None))
                .values(deleted_at=now)
                .returning(model.id)
            )
            cascade_counts[model.__tablename__] = len(result.all())
        # Child tables (same as parent branch)
        for model, parent_table, fk in (
            (StudentProfile, Student, "student_id"),
            (AssessmentPage, Assessment, "assessment_id"),
            (AssessmentDiagnosis, Assessment, "assessment_id"),
            (ProblemObservation, AssessmentDiagnosis, "diagnosis_id"),
            (DiagnosticReview, Assessment, "assessment_id"),
            (AnswerKeyPage, AnswerKey, "answer_key_id"),
            (ClassMember, Klass, "class_id"),
        ):
            await db.execute(
                update(model)
                .where(
                    getattr(model, fk).in_(
                        select(parent_table.id).where(parent_table.deleted_at == now)
                    ),
                    model.deleted_at.is_(None),
                )
                .values(deleted_at=now)
            )
        # Org row
        await db.execute(
            update(Organization)
            .where(Organization.id == org_id, Organization.deleted_at.is_(None))
            .values(deleted_at=now)
        )

    # 4. Subscription row (separate from Stripe call)
    if subscription is not None:
        await db.execute(
            update(Subscription)
            .where(Subscription.id == subscription.id)
            .values(deleted_at=now)
        )

    # 5. User row
    await db.execute(update(User).where(User.id == user.id).values(deleted_at=now))

    # 6. Audit log
    db.add(AuditLog(
        user_id=user.id,
        organization_id=user.organization_id,
        event_type="user_self_deleted",
        details={"cascade_counts": cascade_counts},
    ))

    await db.commit()
```

### Stripe service helper

`apps/api/src/grade_sight_api/services/stripe_service.py` — verify the existing module has `cancel_at_period_end(stripe_subscription_id)` or equivalent. If not, add a thin wrapper:

```python
async def cancel_at_period_end(stripe_subscription_id: str) -> None:
    await asyncio.to_thread(
        stripe.Subscription.modify,
        stripe_subscription_id,
        cancel_at_period_end=True,
    )
```

### Schema check / migration

Verify `Organization.deleted_at` exists on the model and column. Most other tenant tables use `SoftDeleteMixin` per Spec 2; if `Organization` doesn't, add it via a one-line model edit + alembic migration in this step.

### `get_current_user` invariant check

Verify the existing dependency at `apps/api/src/grade_sight_api/auth/dependencies.py` filters `User.deleted_at.is_(None)` when loading the current user. If not, add the filter — this is a security gate. A soft-deleted user's Clerk session must not authenticate successfully.

## 7. Tests

### Backend (pytest)

`tests/services/test_account_deletion_service.py`:
- `test_soft_delete_parent_cascades_students_assessments_keys`
- `test_soft_delete_teacher_cascades_org_classes_and_owned_data`
- `test_soft_delete_cancels_stripe_subscription_at_period_end` (mock stripe)
- `test_soft_delete_skips_stripe_when_no_subscription`
- `test_soft_delete_proceeds_when_stripe_call_fails` (mock raises)
- `test_soft_delete_writes_audit_log_with_cascade_counts`
- `test_soft_delete_does_not_affect_other_users_data` (cross-isolation)
- `test_soft_delete_teacher_in_multi_teacher_org_raises_error`
- `test_soft_delete_user_with_zero_owned_data_succeeds`

`tests/routers/test_users_router.py`:
- `test_delete_self_returns_204`
- `test_delete_self_unauthenticated_returns_401`
- `test_delete_self_already_deleted_returns_401` (via get_current_user gate)

`tests/auth/test_get_current_user.py` (existing or new):
- `test_get_current_user_rejects_soft_deleted_user`

### Frontend (vitest)

`apps/web/components/privacy/delete-account-dialog.test.tsx`:
- confirm button disabled when typed email is empty
- confirm button enabled when typed email matches `email` prop (case-insensitive trim)
- confirm button disabled when typed email differs by even one character
- clicking confirm calls `deleteSelf` server action and signs out

### Manual visual verification

1. `/settings/privacy` as parent — header + 4 sections + delete zone render in `<SettingsLayout>` with Privacy tab active
2. `/settings/privacy` as teacher — same content (page is identical for both roles in v1)
3. Click "Delete account & all data" → dialog opens
4. Type partial email → confirm disabled
5. Type full email exactly → confirm enables
6. Click confirm → loading state → redirect to `/account-deleted` → no auth, signed out
7. Try to navigate back to `/dashboard` → redirect to `/sign-in`
8. (DB check) the user's row + students + assessments are soft-deleted; another user's data is untouched
9. Stripe subscription is `cancel_at_period_end=true` (verify in Stripe dashboard if possible, or just check the audit log entry)
10. `/account-deleted` page displays correctly with no auth

## 8. Edge cases

| Case | Handling |
|---|---|
| User has in-flight diagnose job | Job continues to write to now-soft-deleted assessment. Hidden by existing `deleted_at IS NULL` filters. No corruption. |
| User signs back in via Clerk after delete | `get_current_user` returns null. Frontend treats as signed-out. |
| User clicks Delete twice quickly | First call succeeds + signs out; second sees 401. UI already on `/account-deleted`. |
| Stripe API failure | Logged to `audit_log` as `subscription_cancel_failed`; deletion proceeds. Manual Stripe reconciliation later. |
| Teacher in multi-teacher org (not v1) | Service raises `MultiTeacherOrgError`. Router returns 409 with "Contact support to delete this account." |
| User has no owned data | Cascade counts are zero; `users.deleted_at` still set. |
| Concurrent assessment upload during delete transaction | Postgres isolation: upload either commits before or after the soft-delete. If after, the new assessment is orphaned (cleaned up by future hard-purge cron). |
| Email match comparison casing | `typed.trim().toLowerCase() === email.trim().toLowerCase()`. Case-insensitive. |
| User has unverified Clerk email | Treat the email on the User row as canonical. (Sign-up flow blocks unverified emails today.) |

## 9. Performance budget

- Endpoint p95 < 500ms — single transaction with ~10 bulk update statements + 1 Stripe API call (~150ms) + 1 audit log insert
- All in one transaction; atomic
- No background jobs in v1

## 10. Followups created from this spec

To be added to `docs/superpowers/plans/followups.md`:

- **Hard-purge cron job (Step 13b followup, post-launch).** Railway scheduled task; runs nightly; finds users where `deleted_at < now() - 30 days`, hard-deletes DB rows + S3 files (assessment_pages, answer_key_pages thumbnails), requests Sentry data deletion via API. Required to complete the 30-day deletion commitment in CLAUDE.md §4.
- **Data export `.zip`.** Canvas had a "Download everything we have on you" button. Real backend pipeline: gather user's tenant data, package into a zip, generate a presigned download URL, email a one-shot download link. Separate brainstorm.
- **Photo retention preference.** Schema (`users.photo_retention_days` or per-org pref) + lifecycle policy. Becomes meaningful only once the hard-purge cron exists.
- **Diagnosis history toggle.** "Keep until I delete" vs auto-purge after N months. Schema work.
- **Email-when-processed preference.** Requires transactional email infra (Resend per CLAUDE.md, not currently wired).
- **Second-parent share.** Multi-account-per-student is its own feature with role/permission complexity.
- **Multi-teacher org delete branch.** When/if multi-teacher signup ships, the `MultiTeacherOrgError` path needs a real workflow — admin transfer, partial-data preservation, etc.
- **Copy fact-check pass.** Verify the canvas claims (face/logo blurring, 30-day auto-delete, "enforced at the database level" for AI training) match implementation reality. Land copy revisions or build the missing features as appropriate. Per workflow memory, this is deferred to after the platform is functional end-to-end.
