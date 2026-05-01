# Step 11b · Side-by-side viewer — design

**Reference:** `docs/design/Grade Sight Handoff v2.html` §Implementation Step 11:
> STEP 11 · INLINE CORRECTION + VIEWER · `/assessments/[id]/viewer` renders the student's page next to the printed key, with the wrong line boxed.

Step 11 was decomposed in Step 11a's brainstorm into:
- **11a** — backend `diagnostic_reviews` + inline edit panel (shipped, PR #12).
- **11b** — this spec — the side-by-side viewer route.

**Canvas:** `docs/design/Grade Sight Diagnosis v2.html` (rendered via `session4-diagnosis.jsx`) — `WithKeyViewer` mock, lines 468–542.

**Branch:** `step-11b-viewer` (off `main` at `e8b85c2`). **Mode:** v2 design step — branch + per-step PR opened/merged via `gh` CLI per the established workflow.

## Why this exists as a step

The diagnosis page (Step 10) and the inline edit panel (Step 11a) handle the editorial summary and the teacher's overrides. They do not show the student's actual handwriting next to the actual answer key — only transcribed text of the final answers. For graded teachers grading at scale, seeing the visual side-by-side is its own signal: did the student write a coherent multi-step solution that just dead-ended, or did they jump to a wrong final answer with no work? The transcribed view can't tell that story; the photo can.

The handoff doc bundled this with Step 11a; the brainstorm decomposed them because they're independent and 11b's wrong-line-boxed treatment is the canvas's signature move that requires data we don't have (per-problem bounding boxes from the engine). 11b ships the bare minimum that's useful today and defers the overlay until the engine emits coordinates.

## Discovery

- The handoff route map explicitly lists `/assessments/[id]/viewer` as a teacher-only route.
- The data we have today: `AssessmentDetail.pages[]` (student's page images via R2 `view_url`); `AssessmentDetail.answer_key.{id, name, page_count}` (metadata only, no pages); `GET /api/answer-keys/{id}` returns `AnswerKeyDetail` with `pages[]`.
- Frontend helper `fetchAnswerKeyDetail(id)` is missing from `apps/web/lib/api.ts`. The list-only `fetchAnswerKeys()` exists. Adding the detail helper is one of two new helpers this step ships.
- The engine does NOT emit per-problem bounding boxes. `ProblemObservation.page_number` exists (which page on the assessment a problem lives on); coordinates within the page do not. The canvas's amber-bordered "wrong line" treatment is mocked in `session4-diagnosis.jsx`.

## Scope

- **In:** New route `/assessments/[id]/viewer` (server component). Two-column layout with stacked page images on each side, each panel scrolls independently. Close-viewer link returns to the diagnosis page. New `fetchAnswerKeyDetail(id)` helper on the frontend. `view side-by-side` entry-point link in the diagnosis page's metadata strip (rendered only when teacher + with_key).
- **In:** Auth gates — parents and other-org teachers get `notFound()`; non-with_key modes get `notFound()`.
- **Out:** Bounding-box overlay ("wrong line boxed") — engine extension required.
- **Out:** Per-problem Prev/Next navigation with URL state.
- **Out:** Tabs (Student only / Key only / Steps & explanation).
- **Out:** Single-column viewer for non-with_key modes (pages reel on diagnosis page already covers it).
- **Out:** Image zoom / pan / rotation. Browser-native (Cmd-+ / pinch-zoom) suffices.
- **Out:** Side-by-side scroll synchronization.
- **Out:** Print integration — Step 14 owns print.
- **Out:** Mobile responsive layout — desktop-first; the route renders on mobile but the side-by-side gets cramped.

## Architecture

The viewer is a pure server-rendered composition. No client state, no `"use client"`. Auth and mode gates fail-fast with `notFound()` to avoid information disclosure. Two `<ViewerPanel>` components (same component, different props) host the two columns. Image loading uses the same `<img>` + presigned-R2 pattern as the existing pages reel on `/assessments/[id]`.

## Components

| Path | Type | Responsibility |
|---|---|---|
| `apps/web/app/assessments/[id]/viewer/page.tsx` | new (~110 lines) | Server component. Parallel-fetches user + assessment-detail; sequentially fetches answer-key-detail (depends on `detail.answer_key.id`). Auth + mode + org + key gates. Renders `<ViewerHeader>` + grid of two `<ViewerPanel>`s. |
| `apps/web/components/diagnosis/viewer-header.tsx` | new (~50 lines) | Crumb (mono caps, role-aware): `ASSESSMENTS · {STUDENT_NAME} · SIDE-BY-SIDE` + `<SerifHeadline>` H1 with `{student_name} · {answer_key.name}` + Close-viewer link returning to `/assessments/{id}`. |
| `apps/web/components/diagnosis/viewer-panel.tsx` | new (~50 lines) | Generic single-panel renderer: `{ label: string; pages: Array<{ page_number, original_filename, view_url }> }`. Mono caps eyebrow `{label} · {N} PAGES` plus a vertically stacked list of `<img>` blocks (one per page) with per-image `PAGE N OF M` mono labels above. |
| `apps/web/lib/api.ts` | modify | Add `fetchAnswerKeyDetail(id: string): Promise<AnswerKeyDetail>` mirroring `fetchAssessmentDetail`. Bearer-token + `cache: "no-store"`. |
| `apps/web/components/diagnosis/diagnosis-header.tsx` | modify | In the metadata strip, append `· view side-by-side` link after the answer-key name. Render only when `role === "teacher" && detail.answer_key !== null`. Link target: `/assessments/{detail.id}/viewer`. |

The `<ViewerPanel>` is intentionally generic — same component renders the student's pages or the key's pages, differing only by the `label` and `pages` props. Same shape used twice keeps the file small and ensures visual consistency.

## Data flow

```
fetchMe() → user (Clerk-authed, may be null)
fetchAssessmentDetail(id) → AssessmentDetail | null
                            ↓
page.tsx server component
  ├─ Parallel: [user, detail] = await Promise.all([fetchMe(), fetchAssessmentDetail(id)])
  ├─ Auth gate:    !user → redirect("/sign-in")
  ├─ Detail gate:  !detail → notFound()  // backend already org-scopes; cross-org gets null
  ├─ Role gate:    !user.organization?.id → notFound()  // parent users have no org
  ├─ Mode gate:    detail.diagnosis?.analysis_mode !== "with_key" → notFound()
  ├─ Key gate:     !detail.answer_key → notFound()  // defensive
  ├─ Sequential: answerKey = await fetchAnswerKeyDetail(detail.answer_key.id)
  └─ Render:
       <AppShell ...>
         <PageContainer className="max-w-[1400px]">
           <ViewerHeader detail={detail} answerKey={answerKey} />
           <div className="grid grid-cols-2 gap-6">
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
```

The third fetch (`fetchAnswerKeyDetail`) waits on `detail.answer_key.id` so it sequences after the parallel pair. Two round-trips total (assessment metadata, then key metadata). Page-image loading is the dominant cost; metadata fetches are negligible.

**Frontend Org gate is implicit, not explicit.** `AssessmentDetail` does not carry `organization_id` on the frontend type (`lib/types.ts:45`). Cross-org access is prevented by the backend's existing `GET /api/assessments/{id}` authorization, which returns 404 for assessments outside the user's org. The viewer's `Detail gate` (`!detail → notFound()`) inherits that protection: a teacher attempting to GET another org's viewer URL receives 404 from the API, the frontend gate fires, the page renders 404. No explicit org-comparison happens (or is possible) on the frontend.

## Auth gates

| Gate | Trigger | Response | Why |
|---|---|---|---|
| Auth | `!user` | redirect `/sign-in` | Standard auth flow; no info disclosure. |
| Detail | `!detail` | `notFound()` | Assessment doesn't exist OR cross-org (backend GET 404s for non-matching org). Inherits the API's org enforcement. |
| Role | `!user.organization?.id` | `notFound()` | Parents have no `organization_id`; viewer is teacher-only. Returning 404 vs. 403 prevents teachers from probing for parent-uploaded assessment IDs. |
| Mode | `analysis_mode !== "with_key"` | `notFound()` | Side-by-side is only meaningful for with_key. |
| Key present | `!detail.answer_key` | `notFound()` | Defensive; with_key implies answer_key but assert rather than crash on missing data. |

Org-match enforcement is the API's responsibility (existing). The frontend has no `organization_id` on `AssessmentDetail` to compare. Five gates total. All non-auth gates use `notFound()` rather than `redirect()` to avoid information disclosure (a teacher discovering an assessment ID belonging to another org should see "this assessment doesn't exist," not "you don't have access").

## Image loading

Each `<img>` in `<ViewerPanel>` renders the existing presigned R2 `view_url`. No optimization layer — R2 presigned URLs aren't compatible with Next.js's `<Image>` component, so the existing pages reel on `/assessments/[id]/page.tsx` uses raw `<img>` with `eslint-disable-next-line @next/next/no-img-element`. The viewer follows the same pattern.

Two panels = double the bytes per assessment. Acceptable on desktop (the only target for v1); browsers cache R2 URLs by their query-signed key, so the viewer's images may be already cached if the user just came from the diagnosis page.

## Entry point on the diagnosis page

`<DiagnosisHeader>`'s metadata strip currently renders (for with_key teacher mode):

```
uploaded Apr 28 · 4 pages · graded against [Quiz 9.1]
                                          ^^^^^^^^^^
                                          existing link → /keys/{key.id}
```

Step 11b appends a sibling link rendered conditionally on `role === "teacher" && detail.answer_key !== null`:

```
uploaded Apr 28 · 4 pages · graded against [Quiz 9.1] · [view side-by-side]
                                                        ^^^^^^^^^^^^^^^^^^
                                                        new link → /assessments/{detail.id}/viewer
```

The link uses `text-accent hover:underline` to match the answer-key link. Separator dot uses `aria-hidden="true"` per the existing pattern.

For modes where the link doesn't render (auto_grade, already_graded, parent role), the metadata strip simply skips this segment. No empty-string artifacts or alignment shifts.

## Error handling

- Network failure on `fetchAnswerKeyDetail` → throws upstream → Next's `error.tsx` renders the global error page. No silent fallback; the viewer is broken without the key data.
- Empty `detail.pages[]` or `answerKey.pages[]` → the panel renders the eyebrow + an empty stack. No assertion needed; an assessment with zero pages is degenerate but not catastrophic for this surface.
- Mismatched page counts (student has 4 pages, key has 1) → both render their counts; teacher visually aligns. No coordination logic.

## Accessibility

- Each `<img>` carries `alt={\`${label}, page ${page_number} of ${total}\`}` so screen readers announce the orientation.
- Close-viewer link is a real `<a>` with `:focus-visible` ring (default).
- The metadata-strip entry-point link inherits the existing focus ring from the answer-key link.
- Panel scrolling: native scrollbars; keyboard arrows scroll within the focused panel. No custom keyboard handling.
- The `<SerifHeadline>` H1 is the page's primary heading; eyebrows above are mono caps (decorative `<p>`s).
- No animations introduced.

## Testing

- **No new vitest target.** Pure server composition; no state machine. Existing vitest coverage of helpers + Step 10/11a components is untouched.
- **`pnpm --filter web typecheck`** clean.
- **`pnpm --filter web lint`** clean (0 errors / 2 pre-existing warnings).
- **`pnpm --filter web build`** succeeds. New route appears as `ƒ /assessments/[id]/viewer` (dynamic).
- **Manual visual verification** in dev server. Required passes:
  - Teacher × with_key × completed → diagnosis page metadata strip shows the new `view side-by-side` link.
  - Click the link → viewer renders student pages on left, key pages on right.
  - Each panel scrolls independently.
  - Close-viewer link returns to `/assessments/{id}`.
  - Parent role on a with_key assessment → no `view side-by-side` link in the metadata strip.
  - Direct URL access `/assessments/{id}/viewer` as parent → 404.
  - auto_grade mode (no key) → no `view side-by-side` link. Direct URL access → 404.
  - Cross-org teacher attempting `/viewer` URL → 404 (defense-in-depth; API also scopes).

## Verification checklist

- [ ] `apps/web/app/assessments/[id]/viewer/page.tsx` exists and renders for teacher × with_key × org-matched.
- [ ] All five auth/role/mode/detail/key gates fail-fast with `notFound()` (or sign-in redirect for the unauthenticated case). Org enforcement is delegated to the backend GET endpoint.
- [ ] `<ViewerHeader>` renders crumb + headline + Close-viewer link.
- [ ] `<ViewerPanel>` accepts `{ label, pages }` and renders an eyebrow plus stacked `<img>` blocks with per-page mono labels.
- [ ] `fetchAnswerKeyDetail(id)` helper added to `lib/api.ts`.
- [ ] `<DiagnosisHeader>` metadata strip shows `view side-by-side` link only when `role === "teacher" && detail.answer_key !== null`.
- [ ] All four pnpm commands clean (typecheck/lint/test/build).
- [ ] Manual visual verification passes for the eight scenarios in §Testing.

## Out of scope (with assignment)

| Item | Owner |
|---|---|
| Bounding-box overlay ("wrong line boxed") | Future engine extension; defer until engine emits per-problem coordinates |
| Per-problem Prev/Next navigation + URL state | Followup once teachers report needing it |
| Tabs (Student only / Key only / Steps & explanation) | Followup; diagnosis page's `<details>` already covers Steps |
| Single-column viewer for non-with_key modes | Out — pages reel on diagnosis page covers it |
| Image zoom / pan / rotation | Browser-native suffices for v1 |
| Side-by-side scroll sync | Followup, paired with Prev/Next nav |
| Print-from-viewer | Step 14 |
| Mobile responsive layout | Out for v1; teachers grade on desktop |

## Seven-item checklist (handoff doc)

1. **Every font size is a token** — pass. Mono caps eyebrows `text-xs`; serif H1 from `<SerifHeadline level="page">`; body strip `text-base`. No raw size values.
2. **Every color is a token** — pass. `text-ink` / `text-ink-soft` / `text-ink-mute` for chrome; `bg-paper` / `border-rule` for panels; `text-accent` for the entry-point and Close-viewer links. No hex / oklch literals.
3. **Visible focus ring on every interactive element** — pass. Close-viewer is an `<a>`; the metadata-strip link is an `<a>`. Both inherit `:focus-visible` from globals.css.
4. **Amber only at insight moments. Red only on `/error` ERR-XXX** — pass. No amber, no red in the viewer chrome.
5. **Body text is 18px. Nothing below 15px** — pass for body. Mono eyebrows `text-xs` (13px) — established Step 09/10/11a allowance.
6. **Serif = meaning, sans = doing** — pass. H1 is serif; eyebrows mono; Close-viewer link sans/mono.
7. **Matches reference canvas** — partial pass. Layout matches `WithKeyViewer` (`session4-diagnosis.jsx` lines 468–542) on the two-column structure, mono-caps eyebrow per panel, Close-viewer affordance. Three deliberate v1 departures, all called out in §Out of scope: no per-problem navigation header / Prev / Next, no four-tab row (Side-by-side / Student only / Key only / Steps), no bounding-box overlay on the wrong line. The simplest viewer that ships — future steps add the canvas's full feature set.

## Locked decisions

- **Q1 ambition:** A — bare minimum (no overlay, no tabs, no per-problem nav).
- **Q2a per-problem nav:** truly minimum — no Prev/Next, no URL state.
- **Q2b cross-mode:** with_key only. Non-with_key modes get 404 + hidden entry point.
- **Q2c entry point:** sibling link in the diagnosis-page metadata strip beside the answer-key name.
- **Approach:** Approach 1 — new server-rendered route at `apps/web/app/assessments/[id]/viewer/page.tsx`; pure server composition; no client state.
