# Step 11b · Side-by-side viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the bare-minimum side-by-side viewer at `/assessments/[id]/viewer` — student pages stacked on the left, answer-key pages stacked on the right, each panel scrolling independently, with a `view side-by-side` entry-point link added to the diagnosis page metadata strip.

**Architecture:** Pure server-rendered route. New page composes `<ViewerHeader>` + two `<ViewerPanel>`s. One new frontend API helper (`fetchAnswerKeyDetail`). One small modification to `<DiagnosisHeader>` to surface the entry point. No client state, no `"use client"`.

**Tech Stack:** Next.js 16 (App Router) + React 19 server components + Tailwind 4. No new packages.

**Spec:** `docs/superpowers/specs/2026-04-30-step-11b-viewer-design.md`

**Branch:** `step-11b-viewer` (already created off `main` post-Step-11a merge; spec already committed at `af202ef`).

---

## File Structure

| Path | Type | Responsibility |
|---|---|---|
| `apps/web/lib/api.ts` | modify | Add `fetchAnswerKeyDetail(id)` mirroring `fetchAssessmentDetail` (Bearer token, `cache: "no-store"`, returns `AnswerKeyDetail`). |
| `apps/web/components/diagnosis/viewer-panel.tsx` | new (~50 lines) | Generic single-panel renderer: `{ label, pages }`. Mono-caps eyebrow + stacked `<img>` blocks per page with `PAGE N OF M` mono labels. |
| `apps/web/components/diagnosis/viewer-header.tsx` | new (~50 lines) | Crumb (`ASSESSMENTS · {STUDENT_NAME} · SIDE-BY-SIDE`) + serif H1 (`{student_name} · {answer_key.name}`) + Close-viewer link. |
| `apps/web/app/assessments/[id]/viewer/page.tsx` | new (~110 lines) | Server component. Five auth/role/mode/detail/key gates. Parallel + sequential fetches. Two-column grid composition. |
| `apps/web/components/diagnosis/diagnosis-header.tsx` | modify | Append `· view side-by-side` link in the metadata strip, conditional on `role === "teacher" && detail.answer_key !== null`. |

---

## Task 1: `fetchAnswerKeyDetail` helper

**Files:**
- Modify: `apps/web/lib/api.ts`

- [ ] **Step 1: Add the helper function**

Open `apps/web/lib/api.ts` and find where `fetchAssessmentDetail` is defined. Add a sibling helper directly below it (or after `fetchAnswerKeys` if the file groups list/detail together):

```typescript
export async function fetchAnswerKeyDetail(
  id: string,
): Promise<AnswerKeyDetail | null> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return null;

  const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/answer-keys/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GET /api/answer-keys/${id} failed: ${response.status}`);
  }
  return (await response.json()) as AnswerKeyDetail;
}
```

The shape of the existing `fetchAssessmentDetail` helper is the canonical pattern — match its imports and error-handling style. If the existing helpers throw on 404 instead of returning null, follow that pattern (the page-level gate will translate the throw to `notFound()`). Read `fetchAssessmentDetail` and mirror it.

If `AnswerKeyDetail` isn't imported at the top of the file (or its re-export block), add it. Same import source: `@/lib/types`.

- [ ] **Step 2: Verify**

```bash
pnpm --filter web typecheck
pnpm --filter web lint
```

Expected: clean (0 errors / 2 pre-existing warnings).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/api.ts
git commit -m "$(cat <<'EOF'
web: add fetchAnswerKeyDetail helper

Step 11b · viewer. Mirrors fetchAssessmentDetail (Bearer token,
cache: no-store, null on 404). Used by the new viewer page in
subsequent commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `<ViewerPanel>` component

**Files:**
- Create: `apps/web/components/diagnosis/viewer-panel.tsx`

- [ ] **Step 1: Create the component**

```typescript
interface ViewerPage {
  page_number: number;
  original_filename: string;
  view_url: string;
}

export function ViewerPanel({
  label,
  pages,
}: {
  label: string;
  pages: ViewerPage[];
}) {
  const total = pages.length;
  const sorted = [...pages].sort((a, b) => a.page_number - b.page_number);

  return (
    <section
      aria-label={label}
      className="flex flex-col gap-4 max-h-[calc(100vh-220px)] overflow-y-auto pr-2"
    >
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute sticky top-0 bg-paper py-2 z-10">
        {label} · {total} {total === 1 ? "page" : "pages"}
      </p>
      <ul className="flex flex-col gap-6">
        {sorted.map((p) => (
          <li
            key={p.page_number}
            className="rounded-[var(--radius-sm)] border border-rule bg-paper p-4"
          >
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
              Page {p.page_number} of {total}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element -- presigned R2 URL, not optimizable */}
            <img
              src={p.view_url}
              alt={`${label}, page ${p.page_number} of ${total}`}
              className="w-full rounded-[var(--radius-sm)] border border-rule-soft"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
```

The `max-h-[calc(100vh-220px)]` reserves room for the header/chrome above. Each panel scrolls independently because of `overflow-y-auto`. The eyebrow stays visible during scroll via `sticky top-0`.

- [ ] **Step 2: Verify**

```bash
pnpm --filter web typecheck
pnpm --filter web lint
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/diagnosis/viewer-panel.tsx
git commit -m "$(cat <<'EOF'
web: add diagnosis/viewer-panel (single-column scrollable image stack)

Step 11b · viewer. Generic panel: label + pages prop. Mono-caps
sticky eyebrow + vertically stacked image blocks with per-page
PAGE N OF M labels. Independently scrollable via overflow-y-auto.
Renders both the student panel and the key panel from one component.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `<ViewerHeader>` component

**Files:**
- Create: `apps/web/components/diagnosis/viewer-header.tsx`

- [ ] **Step 1: Create the component**

```typescript
import Link from "next/link";

import { SerifHeadline } from "@/components/serif-headline";
import type { AnswerKeyDetail, AssessmentDetail } from "@/lib/types";

export function ViewerHeader({
  detail,
  answerKey,
}: {
  detail: AssessmentDetail;
  answerKey: AnswerKeyDetail;
}) {
  return (
    <header>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
        <span>Assessments</span>
        <span aria-hidden="true"> · </span>
        <span>{detail.student_name}</span>
        <span aria-hidden="true"> · </span>
        <span className="text-ink">Side-by-side</span>
      </p>

      <div className="mt-6 flex items-end justify-between gap-8">
        <SerifHeadline level="page" as="h1">
          {detail.student_name} · {answerKey.name}
        </SerifHeadline>
        <Link
          href={`/assessments/${detail.id}`}
          className="font-mono text-xs uppercase tracking-[0.14em] text-accent hover:underline shrink-0"
        >
          Close viewer ›
        </Link>
      </div>
    </header>
  );
}
```

The crumb breadcrumb mirrors the diagnosis-header pattern but with a third segment `Side-by-side` to identify the route. Close-viewer is a real `<Link>`, not a button, so back-navigation works with the browser back button.

- [ ] **Step 2: Verify**

```bash
pnpm --filter web typecheck
pnpm --filter web lint
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/diagnosis/viewer-header.tsx
git commit -m "$(cat <<'EOF'
web: add diagnosis/viewer-header (crumb + serif H1 + Close link)

Step 11b · viewer. Mirrors DiagnosisHeader's crumb + headline
pattern. Title format: "{student_name} · {answer_key.name}".
Close-viewer is a real <Link> so the browser back button does
the right thing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: The viewer page itself

**Files:**
- Create: `apps/web/app/assessments/[id]/viewer/page.tsx`

- [ ] **Step 1: Create the directory and page**

```bash
mkdir -p apps/web/app/assessments/\[id\]/viewer
```

Write `apps/web/app/assessments/[id]/viewer/page.tsx`:

```typescript
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ViewerHeader } from "@/components/diagnosis/viewer-header";
import { ViewerPanel } from "@/components/diagnosis/viewer-panel";
import { PageContainer } from "@/components/page-container";
import {
  fetchAnswerKeyDetail,
  fetchAssessmentDetail,
  fetchMe,
} from "@/lib/api";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AssessmentViewerPage({ params }: PageProps) {
  const { id } = await params;
  const [user, detail] = await Promise.all([
    fetchMe(),
    fetchAssessmentDetail(id),
  ]);

  // Auth gate
  if (!user) redirect("/sign-in");
  // Detail gate (also covers cross-org via the API's existing org-scope)
  if (!detail) notFound();
  // Role gate (parents have no organization_id; viewer is teacher-only)
  if (!user.organization?.id) notFound();
  // Mode gate
  if (detail.diagnosis?.analysis_mode !== "with_key") notFound();
  // Key gate (defensive; with_key implies answer_key but assert)
  if (!detail.answer_key) notFound();

  // Sequential fetch — depends on detail.answer_key.id
  const answerKey = await fetchAnswerKeyDetail(detail.answer_key.id);
  if (!answerKey) notFound();

  return (
    <AppShell
      orgName={user.organization?.name}
      userId={user.id}
      organizationId={user.organization?.id ?? null}
    >
      <PageContainer className="max-w-[1400px]">
        <ViewerHeader detail={detail} answerKey={answerKey} />

        <div className="mt-8 grid grid-cols-2 gap-6">
          <ViewerPanel
            label="Student's paper"
            pages={detail.pages}
          />
          <ViewerPanel
            label={`${answerKey.name} key`}
            pages={answerKey.pages}
          />
        </div>
      </PageContainer>
    </AppShell>
  );
}
```

The five gates fail fast in the order: auth → detail → role → mode → key. Each `notFound()` throws and the layout's `not-found.tsx` renders. The sequential fetch is intentional (depends on `detail.answer_key.id`).

- [ ] **Step 2: Verify**

```bash
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web build
```

Expected: typecheck clean; lint 0 errors / 2 pre-existing warnings; build succeeds with the new route showing as `ƒ /assessments/[id]/viewer`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/assessments/\[id\]/viewer/page.tsx
git commit -m "$(cat <<'EOF'
web: add /assessments/[id]/viewer route

Step 11b · viewer. Server component. Five auth/role/mode/detail/key
gates fail-fast with notFound(); auth gate redirects to sign-in.
Org-match is delegated to the backend GET (returns null for
cross-org). Composes ViewerHeader + two ViewerPanels in a 2-col
grid at max-w-[1400px].

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add the entry-point link to `<DiagnosisHeader>`

**Files:**
- Modify: `apps/web/components/diagnosis/diagnosis-header.tsx`

- [ ] **Step 1: Read the existing metadata strip**

Open `apps/web/components/diagnosis/diagnosis-header.tsx` and find the metadata strip JSX (the section that renders `uploaded {date} · {N} pages · graded against {answer_key.name}`). Note where the answer-key link is rendered.

- [ ] **Step 2: Append the entry-point link**

Right after the existing answer-key `<Link>` (and inside the same `{detail.answer_key ? (...) : null}` conditional that already gates on the key being present), add a sibling segment with the `view side-by-side` link, conditional additionally on `role === "teacher"`:

```typescript
{detail.answer_key ? (
  <>
    <span aria-hidden="true">·</span>
    <span>
      graded against{" "}
      <Link
        href={`/keys/${detail.answer_key.id}`}
        className="text-accent hover:underline"
      >
        {detail.answer_key.name}
      </Link>
    </span>
    {role === "teacher" ? (
      <>
        <span aria-hidden="true">·</span>
        <Link
          href={`/assessments/${detail.id}/viewer`}
          className="text-accent hover:underline"
        >
          view side-by-side
        </Link>
      </>
    ) : null}
  </>
) : null}
```

The exact JSX shape should match what's already in `<DiagnosisHeader>`. The above is a sketch — preserve the existing whitespace, separator-dot styling, and React fragment patterns. The new addition is just the second nested `<>` block conditional on `role === "teacher"`.

- [ ] **Step 3: Verify**

```bash
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web build
```

Expected: all four clean. typecheck must verify that `role` is in scope where you're adding the conditional (`<DiagnosisHeader>` already takes `role: Role` per Step 11a's modifications).

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/diagnosis/diagnosis-header.tsx
git commit -m "$(cat <<'EOF'
web: add "view side-by-side" entry point to DiagnosisHeader

Step 11b · viewer. Appends a sibling link in the metadata strip
beside the answer-key name. Renders only when role === "teacher"
&& detail.answer_key !== null. Link target: /assessments/{id}/viewer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Manual visual verification

**Files:** none (verification only).

Restart the dev servers if needed: `pnpm dev` from repo root.

- [ ] **Step 1: Verify scenario 1 — Teacher × with_key × completed**

Sign in as a teacher account. Navigate to a completed assessment graded against an answer key. In the metadata strip below the headline, confirm the new `view side-by-side` link appears beside the answer-key name.

- [ ] **Step 2: Verify scenario 2 — Click the link → viewer renders**

Click `view side-by-side`. Confirm:
- URL is `/assessments/{id}/viewer`.
- Crumb at top reads `ASSESSMENTS · {STUDENT_NAME} · SIDE-BY-SIDE`.
- Serif H1 reads `{student_name} · {answer_key.name}`.
- Two columns: student pages on left, key pages on right.
- Each panel scrolls independently (scroll the left panel; right stays put, and vice versa).
- "Close viewer ›" link at top-right.

- [ ] **Step 3: Verify scenario 3 — Close-viewer returns to diagnosis page**

Click `Close viewer ›`. Confirm URL returns to `/assessments/{id}`. Browser back button after that takes you back to the viewer.

- [ ] **Step 4: Verify scenario 4 — Parent role on with_key assessment**

Sign in as parent. Navigate to a with_key assessment (or any assessment if parents don't see them in role). Confirm `view side-by-side` link does NOT appear in the metadata strip.

Direct URL access `/assessments/{id}/viewer` as parent → 404.

- [ ] **Step 5: Verify scenario 5 — auto_grade mode**

Sign in as teacher. Navigate to an assessment in auto_grade mode (no answer key uploaded). Confirm `view side-by-side` link does NOT render. Direct URL access → 404.

- [ ] **Step 6: Verify scenario 6 — Cross-org assessment ID**

If you have access to two teacher accounts in different orgs, sign in as teacher A and try to access teacher B's `/assessments/{id}/viewer` URL. Expected: 404. (The backend's GET org-scopes; the frontend Detail gate fires.)

If only one teacher account is available locally, skip this scenario and note it as a defense-in-depth gate verified by the backend's existing tests.

- [ ] **Step 7: Note any deviations**

If anything looks wrong, screenshot to `assets/screenshots/step-11b-{scenario}.png` and report the deviation. This task does not produce a commit unless deviations require fixes.

---

## Task 7: Open the PR via gh CLI + merge after user OK

**Files:** none.

- [ ] **Step 1: Verify branch state**

```bash
git log --oneline main..HEAD
```

Expected: spec commit (`af202ef`) plus 5 task commits (helper, viewer-panel, viewer-header, page, diagnosis-header link).

- [ ] **Step 2: Push the latest**

```bash
git push
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create \
  --title "Step 11b · Side-by-side viewer (bare minimum)" \
  --base main \
  --body "$(cat <<'EOF'
## Summary

New server-rendered route `/assessments/[id]/viewer`. Two-column layout: student pages on the left, answer-key pages on the right, each panel scrolls independently. Bare-minimum scope per spec lock — no per-problem nav, no tabs, no bounding-box overlay (engine-extension-required).

## Why

Step 11b of the v2 design build. Step 10 + Step 11a cover the editorial summary and teacher overrides on text-transcribed problem data. The viewer adds the visual side-by-side: actual handwriting next to the actual answer key. For teachers grading at scale, "did the student dead-end on a multi-step solution or jump to a wrong answer" reads off the photos better than off the transcript.

## What changed

- New route `apps/web/app/assessments/[id]/viewer/page.tsx`. Server component. Five fail-fast gates (auth, detail, role, mode, key) — org-match is delegated to the backend GET.
- New components `<ViewerHeader>` (crumb + serif H1 + Close-viewer link) and `<ViewerPanel>` (generic — same component renders student or key based on `{ label, pages }` props).
- New frontend helper `fetchAnswerKeyDetail(id)` mirroring `fetchAssessmentDetail`.
- `<DiagnosisHeader>` metadata strip gains a `view side-by-side` link, rendered only when `role === "teacher" && detail.answer_key !== null`.

## Tokens used

`text-ink` / `text-ink-soft` / `text-ink-mute` / `text-accent` for chrome and links. `bg-paper` / `border-rule` / `border-rule-soft` for panels. Mono caps eyebrows `text-xs` (13px) per the established Step 09/10/11a allowance.

## Verification

`pnpm --filter web typecheck` clean · `pnpm --filter web lint` (0 errors / 2 pre-existing warnings) · `pnpm --filter web test` clean (no new vitest target — the viewer is pure server composition with no state machine) · `pnpm --filter web build` clean (new route appears as `ƒ /assessments/[id]/viewer`).

Visual verification: teacher × with_key × completed → metadata strip shows `view side-by-side` link → click → two-panel viewer renders → each side scrolls independently → close-viewer returns to diagnosis page. Parent role + non-with_key modes → no link, direct URL → 404.

## Seven-item checklist

1. Every font size is a token — pass.
2. Every color is a token — pass.
3. Visible focus ring on every interactive element — pass (Close-viewer link, metadata-strip link).
4. Amber only at insight moments. Red only on `/error` — pass.
5. Body 18px / nothing below 15px — pass; mono eyebrows `text-xs` (13px) per established allowance.
6. Serif = meaning, sans = doing — pass.
7. Matches reference canvas — partial pass. Three deliberate v1 departures called out in spec: no per-problem Prev/Next nav, no four-tab row, no bounding-box overlay.

## Open questions / provisional decisions

- Bounding-box overlay deferred until engine emits per-problem coordinates. The canvas's amber-bordered "wrong line" is mocked there.
- Per-problem Prev/Next nav and the tabs row deferred to followups; revisit if teachers report needing them.
- Mobile responsive layout out of scope for v1.
EOF
)"
```

- [ ] **Step 4: Wait for David's "merge" / "lgtm" / "ship it"**

Do not run `gh pr merge` until David approves. Once authorized:

```bash
gh pr merge --squash --delete-branch
git checkout main
git pull
```

Mark this task done.

---

## Self-Review

**1. Spec coverage**

| Spec section | Plan task |
|---|---|
| §Components: `fetchAnswerKeyDetail` helper | Task 1 |
| §Components: `<ViewerPanel>` | Task 2 |
| §Components: `<ViewerHeader>` | Task 3 |
| §Components: viewer page route + 5 gates | Task 4 |
| §Components: `<DiagnosisHeader>` entry-point link (teacher + with_key conditional) | Task 5 |
| §Auth gates (5 fail-fast) | Task 4 (page composes them) |
| §Image loading (presigned R2 + eslint-disable) | Task 2 (ViewerPanel uses `<img>` with the disable comment) |
| §Entry point on diagnosis page | Task 5 |
| §Manual verification (six scenarios) | Task 6 |
| §PR opening + merge via gh CLI | Task 7 |

All requirements covered.

**2. Placeholder scan**

No "TBD", "TODO", "implement later", or "similar to Task N" patterns. Task 5 has a "the exact JSX shape should match what's already in `<DiagnosisHeader>`" instruction — that's a directive to match the existing pattern, not a placeholder; the surrounding code block shows the expected addition shape.

**3. Type consistency**

- `AnswerKeyDetail` (TS) → fetched in Task 1 (helper), consumed in Task 3 (`<ViewerHeader>` props) and Task 4 (page).
- `AssessmentDetail` (TS) → consumed in Task 3 and Task 4.
- `ViewerPage` (Task 2 internal type) is a local interface matching the shape of `AssessmentDetail.pages[]` and `AnswerKeyDetail.pages[]` items. Both source types satisfy the structural shape.
- `Role` type is referenced in Task 5; sourced from `@/lib/diagnosis-sentence` per the existing `<DiagnosisHeader>` import (already in place from Step 10/11a).
- `<ViewerPanel>` props `{ label: string; pages: ViewerPage[] }` are consumed in Task 4's two callsites with matching shapes.

All names and signatures consistent across tasks.
