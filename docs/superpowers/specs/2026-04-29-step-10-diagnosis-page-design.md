# Step 10 · Diagnosis Page — design

**Reference:** `docs/design/Grade Sight Handoff v2.html` §Implementation Step 10:
> STEP 10 · DIAGNOSIS PAGE · Build /assessments/[id] as the three-layer narrative.
> Top sentence · pattern groups · problem rows. `HandwrittenWork` uses Caveat *only* here. Implement `ModeBadge` for the three modes. Match Diagnosis v2 canvas.

**Canvas:** `docs/design/Grade Sight Diagnosis v2.html` (rendered via `session4-diagnosis.jsx`).

**Branch:** `step-10-diagnosis-page`. **Mode:** v2 design step — branch + per-step PR.

## Why this exists as a step

Step 10 is the editorial moment of the product. The diagnostic engine (Specs 11 + 12) already produces grade + per-problem patterns + step-by-step solutions; the existing `<DiagnosisDisplay>` renders that data as a flat list of cards. The Diagnosis v2 canvas reframes the same data as a three-layer narrative — sentence at the top, patterns in the middle, problems at the bottom — so a parent who reads only the headline gets the right thing to do, and a teacher gets a navigable per-pattern breakdown rather than a problem ledger.

This is also the surface that establishes the canvas's vocabulary for the rest of the v2 sequence: `ModeBadge`, `HandwrittenWork`, `PatternGroup`, `ProblemRow`. Step 11 (inline correction + viewer), Step 12 (Student Page), Step 13 (Operational Surfaces), and Step 14 (Print Intervention) all assume Step 10's components exist.

## Discovery: data shape is fully sufficient; structure needs to be reframed client-side

The engine output already exposes everything Step 10 needs:

- `AssessmentDiagnosis.analysis_mode` — three values matching the canvas's `ModeBadge` modes.
- `AssessmentDiagnosis.total_problems_seen` and `problems[]` with `is_correct` — score derivation.
- `ProblemObservation.error_pattern_slug` and `error_pattern_name` — pattern grouping and accent phrase.
- `ProblemObservation.error_category_slug` — eyebrow category text.
- `ProblemObservation.solution_steps` — Steps expand body.
- `AssessmentDiagnosis.overall_summary` — fallback for top-sentence edge cases.

What's missing is structural assembly. The canvas's signature top-sentence rhetorical move (bold score + lead clause + accent-colored dominant pattern phrase) is not what `overall_summary` emits today (current production prose is sparse score-only, e.g., `"4 wrong of 18."`). Step 10 introduces a pure helper, `buildTopSentence(diagnosis, role)`, that constructs the structured sentence from the per-problem data. No engine changes.

The existing `<DiagnosisDisplay>` is the sole consumer of `AssessmentDiagnosis` in the UI. Replacement is clean — no parallel-build complications.

## Scope

- **In:** Three-layer narrative on `/assessments/[id]` for `status === "completed"` (top sentence, pattern groups, per-problem rows, problem grid, pages reel kept as-is).
- **In:** Rich `<ProcessingCard>` for `status === "processing"` (replaces today's minimalist banner). SSR-rendered, no polling.
- **In:** New `ModeBadge` with canvas labels (`AUTO-GRADED` / `GRADED WITH KEY` / `READING THE TEACHER'S MARKS`); answer-key name moves out of the badge into the metadata strip.
- **In:** Header restructure — breadcrumb (`Crumb`) above ModeBadge above serif H1 (`student_name`) above metadata strip. Action bar = Re-run + Delete only.
- **In:** "Everything else" problem grid (✓/✗ squares) below pattern groups.
- **In:** Pure `buildTopSentence` helper with five edge cases, vitest-covered.
- **Out:** Inline-correction edit panel (Step 11), `/assessments/[id]/viewer` (Step 11), Print intervention button (Step 14), class-context lines + recurring-for-student lines (Step 12 / future class-roster step), live polling, engine-side structured top-sentence emission, synthetic assessment-title field.

## Architecture

Page stays a server component (~80 lines). It composes a feature-scoped family under `apps/web/components/diagnosis/`. No client interactivity is introduced in Step 10 beyond native HTML `<details>` for the Steps expand. Old `apps/web/components/diagnosis-display.tsx` is deleted in the same PR.

Role (`"parent" | "teacher"`) is derived in `page.tsx` from `user.organization?.id` and threaded down where copy density differs. Mode is read directly from `diagnosis.analysis_mode`. The diagnosis family components remain pure — they take resolved props, not raw user/org state.

## Components

| Path | Type | Purpose |
|---|---|---|
| `apps/web/app/assessments/[id]/page.tsx` | rewrite | Server component. Status-branched body: `pending` → existing Run-diagnostic card; `processing` → `<ProcessingCard>`; `failed` → existing failure card + Re-run; `completed` → `<DiagnosisHeader>` + `<TopSentence>` + grouped `<PatternGroup>`s + `<ProblemGrid>` + pages reel. ~80 lines. |
| `apps/web/components/diagnosis/diagnosis-header.tsx` | new | Crumb (role-aware root: `Students` parent / `Assessments` teacher) + `<ModeBadge>` + serif H1 (`student_name`) + metadata strip + Re-run + `<DeleteAssessmentButton>`. |
| `apps/web/components/diagnosis/mode-badge.tsx` | new | Three labels: `AUTO-GRADED` / `GRADED WITH KEY` / `READING THE TEACHER'S MARKS`. Uppercase mono, `tracking-[0.14em]`, `text-ink-mute`. Replaces the inline `ModeBadge` in current `page.tsx`. |
| `apps/web/components/diagnosis/top-sentence.tsx` | new | Renders `TopSentence` (see §Sentence builder). Boxed: `border-l-[3px] border-accent`, `bg-paper-soft`, `border border-rule-soft`. Mono accent eyebrow above ("WHAT THIS QUIZ TELLS US" parent / "WHAT YOU'RE LOOKING AT" teacher). Score bold; accent phrase `text-accent`. |
| `apps/web/components/diagnosis/pattern-group.tsx` | new | Card with header (eyebrow + serif name + serif description + count) and ordered list of `<ProblemRow>`s. Header sits on `bg-paper-soft` for the first/recurring group; subsequent groups use `bg-paper`. |
| `apps/web/components/diagnosis/problem-row.tsx` | new | 3-column grid: `#N` index · prompt (serif) · `<HandwrittenWork>` · correct answer (serif) · Steps expand. Uses native `<details>/<summary>` for the expand. |
| `apps/web/components/diagnosis/handwritten-work.tsx` | new | Caveat font, line-broken student work, `text-ink-soft`. Used **only** here per handoff doc. |
| `apps/web/components/diagnosis/printed-solution.tsx` | new | Serif numbered steps. Inside the Steps expand. Parses `solution_steps` (newline-split, trims blanks). |
| `apps/web/components/diagnosis/problem-grid.tsx` | new | Bottom "Everything else" grid. ✓ for correct, ✗ for wrong; wrong squares get `border-insight` + `bg-[oklch(0.97_0.04_72)]`. Each square is an `<a href="#problem-N">` so keyboard users can jump to the matching `<ProblemRow>` (which renders `id="problem-N"`). |
| `apps/web/components/diagnosis/processing-card.tsx` | new | Two-column rich processing state: serif headline ("We're working through {firstName}'s paper") + steps checklist + page thumbnail strip from `detail.pages`. Static — derives an indicative current step from elapsed seconds since `uploaded_at` (e.g., 0–10s → step 2, 10–20s → step 3, 20+ → step 4). The checklist copy is mode-aware (so it doesn't lie about reading marks when there are none):

| Mode | Step 2 label |
|---|---|
| `already_graded` | "Reading the marks the teacher made" |
| `with_key` | "Reading against the answer key" |
| `auto_grade` | "Reading the work" |

Steps 1, 3, 4 are mode-stable: "Pages received" / "Looking at where {firstName} went off" / "Naming the pattern."

Trust strip below: "Stored encrypted. Delete any time from settings." (canvas mock said "Auto-deleted after 30 days," which doesn't match our committed privacy policy — the actual commitment is a 30-day deletion window on request, not auto-deletion. Revised for accuracy; flag back to design canvas.) |
| `apps/web/lib/diagnosis-sentence.ts` | new | Pure helper: `buildTopSentence(diagnosis, role)`. Returns a discriminated union (see §Sentence builder). |
| `apps/web/lib/__tests__/diagnosis-sentence.test.ts` | new | Vitest target — exhaustive case coverage. |
| `apps/web/components/diagnosis-display.tsx` | **delete** | Replaced. Single consumer (`page.tsx`) is rewritten in the same PR. |

The pages reel (existing `<ul>` of page thumbnails at the bottom of `page.tsx`) is kept as-is — real R2 thumbnails, not the canvas's placeholder mocks.

## Sentence builder

`apps/web/lib/diagnosis-sentence.ts`:

```ts
export type Role = "parent" | "teacher";

export type TopSentence =
  | {
      kind: "structured";
      score: string;          // e.g., "14 of 18"
      lead: string;           // e.g., "Three of the four he missed share the same pattern:"
      accentPhrase: string | null; // e.g., "he's losing the negative when he distributes"
    }
  | {
      kind: "fallback";
      text: string;           // free-form prose
    };

export function buildTopSentence(
  diagnosis: AssessmentDiagnosis,
  role: Role,
): TopSentence;
```

Algorithm:

1. Compute `right = problems.filter(p => p.is_correct).length`, `wrong = problems.filter(p => !p.is_correct)`, `seen = total_problems_seen ?? problems.length`.
2. If `seen === 0` and `overall_summary` is non-empty → `{kind: "fallback", text: overall_summary}`. If `seen === 0` and no summary → `{kind: "fallback", text: "Diagnostic complete."}`.
3. Score: `${right} of ${seen}`.
4. Cases (parent voice shown; teacher uses denser tokens — see Role tokens below):

| Case | Detection | Output |
|---|---|---|
| All correct | `wrong.length === 0` | `{score, lead: "No mistakes worth flagging.", accentPhrase: null}` |
| Single wrong with pattern | `wrong.length === 1 && wrong[0].error_pattern_name` | `{score, lead: "The miss is", accentPhrase: error_pattern_name}` |
| Single wrong without pattern | `wrong.length === 1 && !error_pattern_name` | `{score, lead: "One missed problem.", accentPhrase: null}` |
| Dominant pattern | groupBy `error_pattern_slug` (excluding null), max-count group has count ≥ 2 | `{score, lead: "${count} of ${wrong.length} wrong answers share the same pattern:", accentPhrase: error_pattern_name}` |
| No dominant pattern | no group has count ≥ 2 (every wrong has a different slug, or all are null) | `{score, lead: "Each missed problem hit a different pattern — see below.", accentPhrase: null}` |

Tie-breaking on dominant pattern: if two slugs tie at the max count, pick the one whose first occurrence has the lowest `problem_number`.

Role tokens (parent → teacher):
- `"wrong answers"` → `"wrong"`
- `"missed problem"` → `"missed"`
- `"the miss is"` → `"the miss is"` (unchanged; already terse)
- Everything else identical.

The component renders:
- For `kind: "structured"`: `<p>{role-specific possessive intro}<strong>{score}</strong>. {lead} <span className="text-accent">{accentPhrase}.</span></p>` (omits accent span when `accentPhrase` is null and trims trailing colon from the lead).
- For `kind: "fallback"`: plain serif `<p>{text}</p>`.

The "intro" portion (`"Marcus got "`, `"David got "`) is rendered by the component using `student_name`, not embedded in the helper — keeps the helper stateless about identity. The component derives a first-name token via `student_name.split(" ")[0]` for the conversational tone the canvas uses ("Marcus got 14 of 18" not "Marcus Reilly got 14 of 18"). Single-word names fall through unchanged. Co-locate this as a shared `firstName(fullName)` helper alongside `buildTopSentence` so `<ProcessingCard>` reuses it.

## Pattern grouping

Pure helper co-located with the sentence builder in `lib/diagnosis-sentence.ts`:

```ts
function groupProblemsByPattern(
  problems: ProblemObservation[],
): PatternGroup[];

interface PatternGroup {
  slug: string | null;          // null → "OTHER" bucket
  category: string | null;      // for eyebrow text
  name: string | null;          // serif headline
  description: string | null;   // engine-emitted? if not, use first problem's error_description
  problems: ProblemObservation[];
}
```

Logic:
1. Filter to wrong problems only.
2. Group by `error_pattern_slug`.
3. Sort groups by `problems.length` descending. The null-slug group is bucketed last regardless of count.
4. Return.

The `PatternGroup` description: the engine doesn't currently emit a per-pattern description distinct from per-problem `error_description`. For Step 10, the description is the first problem's `error_description` (truncated if absurdly long; line-clamp-3 suffices). If the description differs across problems in the same group, we show only the first — acceptable noise for v2 launch; revisit if it bites.

The eyebrow text:
- `≥2 problems` → `${category.toUpperCase()} · ${count} OF ${wrong.length} WRONG`
- `1 problem` (one-off pattern card) → `${category.toUpperCase()} · ONE-OFF`
- null-slug bucket → `OTHER · ${count} OF ${wrong.length} WRONG`

## Data flow

```
fetchAssessmentDetail(id) → AssessmentDetail
  ↓
page.tsx (server)
  ├─ Resolve role from user.organization?.id
  ├─ <DiagnosisHeader detail role />
  ├─ status === "completed":
  │    ├─ <TopSentence
  │    │     studentName={detail.student_name}
  │    │     sentence={buildTopSentence(diagnosis, role)}
  │    │     role
  │    │  />
  │    ├─ groupProblemsByPattern(diagnosis.problems).map(group =>
  │    │     <PatternGroup group key={group.slug}>
  │    │       {group.problems.map(p =>
  │    │         <ProblemRow problem={p} key={p.id} id={`problem-${p.problem_number}`} />
  │    │       )}
  │    │     </PatternGroup>)
  │    └─ <ProblemGrid problems={diagnosis.problems} />
  ├─ status === "processing": <ProcessingCard
  │       studentName={detail.student_name}
  │       pages={detail.pages}
  │       uploadedAt={detail.uploaded_at}
  │       role
  │    />
  ├─ status === "pending":   existing Run-diagnostic card (kept verbatim)
  ├─ status === "failed":    existing failure card (kept verbatim)
  └─ Pages reel (existing implementation, kept verbatim)
```

No new API calls. No new types in `lib/types.ts`.

## Error handling

- `<DiagnosisHeader>`: tolerates missing `answer_key` (only the with-key metadata fragment is conditional). Status pill renders only when `status !== "completed"`.
- `<TopSentence>`: helper falls back gracefully to `kind: "fallback"` for the empty / pathological cases. No throws.
- `<ProblemRow>`: renders nothing for the Steps expand when `solution_steps` is null/empty (per Q5 lock — don't render disabled).
- `<ProblemGrid>`: empty `problems[]` → grid renders nothing (the surrounding crumb still renders "Everything else"; if both grid and pattern groups are empty, the entire completed-body collapses to the top sentence — handled in `page.tsx` by skipping empty sections).
- `<ProcessingCard>`: tolerates `pages.length === 0` by skipping the thumbnail strip; copy still works.

## Accessibility

Per handoff §A11y:

- ModeBadge label is text, not just color.
- `<details>/<summary>` for Steps expand → keyboard + screen-reader native.
- Pattern group's count digit is decorative; the eyebrow text already states "3 of 4 wrong." Count digit gets `aria-hidden="true"`.
- Problem grid squares are `<a href="#problem-N">` jump links; each has `aria-label="Problem N: correct"` or `"Problem N: incorrect"` so screen readers don't read "✓" or "✗" as glyphs.
- All amber accents (`text-insight`) paired with mono caps eyebrow text — no color-only meaning.
- `<HandwrittenWork>` `aria-label` set to a plain-text reading of the lines so screen readers don't try to announce Caveat-styled glyphs as art.
- `:focus-visible` not overridden anywhere.
- Top-sentence accent phrase is inside a `<span className="text-accent">` — color only; the surrounding sentence carries the meaning, and AA contrast on `text-accent` over `bg-paper-soft` is verified per the handoff token table.

## Testing

- **`apps/web/lib/__tests__/diagnosis-sentence.test.ts`** (new vitest target). Cases:
  - All correct (`wrong.length === 0`, parent + teacher voicing).
  - Single wrong with pattern.
  - Single wrong without pattern.
  - Three wrong sharing one slug (recurring; dominant accent).
  - Four wrong, all different non-null slugs (no dominant; "each miss hit a different pattern").
  - Four wrong, all null slugs (no dominant; same fallback wording).
  - Mixed: 2 share one slug, 2 share another — picks larger; tie-break by lowest `problem_number`.
  - Empty `problems[]` with `overall_summary` (fallback to summary text).
  - Empty `problems[]` without `overall_summary` (fallback to default).
  - Role tokens: parent vs teacher in the dominant-pattern case.
- **`pnpm --filter web typecheck`** clean.
- **`pnpm --filter web lint`** clean.
- **Manual visual verification** in dev server. Required passes:
  - Parent role × `analysis_mode = "already_graded"` × completed status with recurring pattern.
  - Teacher role × `analysis_mode = "with_key"` × completed status with recurring pattern.
  - Either role × `analysis_mode = "auto_grade"` × completed status with all-correct (zero pattern groups).
  - Either role × `status = "processing"` (rich card renders).
  - Either role × `status = "failed"` (failure card unchanged).
- **No vitest target for individual presentational components** — they're thin compositions of tokens; visual verification is the cheaper signal.

## Verification checklist

- [ ] `apps/web/components/diagnosis/` family scaffolded per the components table.
- [ ] `apps/web/lib/diagnosis-sentence.ts` exports `buildTopSentence(diagnosis, role)` matching the helper API; vitest target green for all 10 cases.
- [ ] `apps/web/components/diagnosis-display.tsx` deleted; no remaining imports.
- [ ] `apps/web/app/assessments/[id]/page.tsx` rewritten; the inline `ModeBadge` is gone.
- [ ] Mode-badge labels match canvas exactly (`AUTO-GRADED` / `GRADED WITH KEY` / `READING THE TEACHER'S MARKS`).
- [ ] Top-sentence accent phrase renders in `text-accent` only when `accentPhrase` is non-null.
- [ ] Pattern groups sort count-desc; null-slug bucket renders last as `OTHER`.
- [ ] Steps expand renders only when `solution_steps` is non-null.
- [ ] Problem-grid squares are `<a href="#problem-N">` jump links that scroll the matching `<ProblemRow>` into view.
- [ ] Manual visual verification passes for the five scenarios listed in §Testing.
- [ ] `pnpm --filter web typecheck` clean; `pnpm --filter web lint` clean.

## Out of scope (with assignment)

| Item | Owner |
|---|---|
| Inline-correction edit panel on `<ProblemRow>` | Step 11 |
| `/assessments/[id]/viewer` (side-by-side with key) | Step 11 |
| `/assessments/[id]/processing` as a dedicated route | not built — the inline `<ProcessingCard>` covers it |
| Print intervention button in the action bar | Step 14 |
| "Save to Marcus" / "Done" / Prev/Next student buttons | dropped — not in Step 10 action bar |
| Class context line ("Class: 4 of 27 share this") | future class-roster step (followups.md) |
| "Recurring for David: third quiz" historical line | Step 12 (Student Page biography) |
| Live polling on processing status | not now; reconsider after Step 11 lifts client state |
| Engine-side structured `top_sentence` output | not now; client-side sentence builder is sufficient |
| Synthesizing an assessment topic title | requires schema change; skip |

## Seven-item checklist (handoff doc)

1. **Every font size is a token** — pass. Headline, top-sentence, pattern names, body, eyebrows all use existing tokens.
2. **Every color is a token** — pass. `text-ink`, `text-ink-soft`, `text-ink-mute`, `text-accent`, `text-insight`, `bg-paper`, `bg-paper-soft`, `border-rule`, `border-rule-soft`. No raw hex.
3. **Visible focus ring on every interactive element** — pass. `<details>/<summary>`, jump-link squares, action-bar buttons, breadcrumb links — all native `:focus-visible`.
4. **Amber only at insight moments. Red only on `/error` ERR-XXX** — pass. Insight amber on pattern-group eyebrow accent, problem-grid wrong squares, and the "↑ {mistake hint}" caption under handwritten work. No red anywhere; existing failure card uses `border-mark`.
5. **Body text is 18px. Nothing below 15px** — pass for body. Mono eyebrows `text-xs` (12px) — same allowance taken in Step 09 spec for the eyebrow pattern.
6. **Serif = meaning, sans = doing** — pass. Headline, top sentence, pattern names, "what it should be," and Steps expand are serif. Mode badge, eyebrows, breadcrumb, action-bar buttons, metadata strip are sans/mono. Caveat is reserved for `<HandwrittenWork>`.
7. **Matches reference canvas** — pass. Mapped to `docs/design/Grade Sight Diagnosis v2.html` (DiagnosisParent, DiagnosisTeacher, ProcessingState mockups). Three deliberate departures, all called out in §Out of scope: no inline-correction panel, no class-context lines, action bar reduced to Re-run + Delete.

## Locked decisions

- **Q1 scope:** rich processing state IN, "Everything else" grid IN, class-context lines DEFERRED to Step 12+.
- **Q2 sentence:** client-side construction in `buildTopSentence` with five edge cases; engine `overall_summary` is a fallback string only.
- **Q3 action bar:** Re-run (always visible) + Delete only. Print → Step 14, Save / Done / Prev-Next dropped.
- **Q4 header bundle:** canvas mode-badge labels above the headline; H1 stays `student_name` (no synthetic title); metadata strip carries grade, absolute date, page count, and answer-key link; breadcrumb root is `Students` (parent) / `Assessments` (teacher).
- **Q5 grouping + Steps:** group by `error_pattern_slug` count-desc, null bucket → `OTHER` last, correct excluded; Steps expand uses native `<details>` and only renders when `solution_steps` is non-null.
- **Q6 polling:** SSR-only, no polling. Reconsider after Step 11.
- **Approach:** Approach 2 (mid-grained feature-scoped components under `components/diagnosis/`).
