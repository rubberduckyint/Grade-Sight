# Step 10 · Diagnosis Page implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/assessments/[id]` as the three-layer Diagnosis v2 narrative — top sentence → pattern groups → problem rows + bottom problem grid + rich processing card. Server-rendered, role/mode-aware via copy and density only. Replaces the current `<DiagnosisDisplay>`.

**Architecture:** One pure helper module under `lib/` (sentence builder, pattern grouper, first-name helper) with full vitest coverage. Nine new presentational components under `components/diagnosis/`. The page itself stays a server component, composes the family, status-branches the body. Old `components/diagnosis-display.tsx` deleted in the same PR. No backend changes; the engine output already exposes everything we need.

**Tech Stack:** Next.js 16 (App Router) + Tailwind 4 + shadcn/ui (existing primitives) + vitest (existing setup at `apps/web/vitest.config.ts` with jsdom). No new packages.

**Spec:** `docs/superpowers/specs/2026-04-29-step-10-diagnosis-page-design.md`

**Branch:** `step-10-diagnosis-page` (already created off `main`; spec already committed at `6cc6e35`).

---

## File Structure

| Path | Type | Responsibility |
|---|---|---|
| `apps/web/lib/diagnosis-sentence.ts` | new (~150 lines) | Pure helpers: `firstName(fullName)`, `buildTopSentence(diagnosis, role)`, `groupProblemsByPattern(problems)`. No JSX. |
| `apps/web/lib/__tests__/diagnosis-sentence.test.ts` | new (~250 lines) | Exhaustive vitest coverage: firstName edge cases; all five buildTopSentence cases × parent + teacher voicing; tie-breaking; fallback paths; pattern grouping ordering and OTHER bucket. |
| `apps/web/components/diagnosis/mode-badge.tsx` | new (~25 lines) | Three labels: `AUTO-GRADED` / `GRADED WITH KEY` / `READING THE TEACHER'S MARKS`. Mono caps eyebrow. |
| `apps/web/components/diagnosis/handwritten-work.tsx` | new (~25 lines) | Caveat font (`font-hand`), line-broken student work. Used **only** here per handoff. `aria-label` flattens lines for screen readers. |
| `apps/web/components/diagnosis/printed-solution.tsx` | new (~35 lines) | Serif numbered steps. Parses `solution_steps` (newline-split, trim blanks, drop empties). Renders inside `<details>` Steps expand. |
| `apps/web/components/diagnosis/top-sentence.tsx` | new (~70 lines) | Renders the discriminated `TopSentence`. Boxed, `border-l-[3px] border-accent`, `bg-paper-soft`. Mono accent eyebrow above; bold score; accent-colored phrase. Falls back to plain serif when `kind === "fallback"`. |
| `apps/web/components/diagnosis/problem-row.tsx` | new (~80 lines) | Grid row + optional Steps expand below. 4-col grid: `#N` index · `<HandwrittenWork>` of student_answer · serif correct_answer · italic error_description hint. `<details>` lives **below** the grid (not inside it) so the expanded steps span the full row width. Renders `id="problem-{N}"` for jump-link target. The canvas's "PROBLEM" column (prompt text) is omitted — engine doesn't emit a problem_text field; see spec §Out of scope. |
| `apps/web/components/diagnosis/pattern-group.tsx` | new (~70 lines) | Card with header (eyebrow + serif name + serif description + count digit) and an ordered list of `<ProblemRow>`s. Header on `bg-paper-soft` for the recurring/largest group. |
| `apps/web/components/diagnosis/problem-grid.tsx` | new (~60 lines) | Bottom "Everything else" grid. ✓/✗ squares; wrong squares get `border-insight` + `bg-insight-soft`. Each square is `<a href="#problem-N">` with `aria-label`. |
| `apps/web/components/diagnosis/processing-card.tsx` | new (~110 lines) | Two-column rich processing state. Mode-aware step-2 label; static checklist; thumbnail strip from `detail.pages`. Trust strip below. |
| `apps/web/components/diagnosis/diagnosis-header.tsx` | new (~110 lines) | Crumb (role-aware root) + `<ModeBadge>` + serif H1 (`student_name`) + metadata strip + Re-run + `<DeleteAssessmentButton>`. Status pill rendered inline only for `pending`/`processing`/`failed`. |
| `apps/web/app/assessments/[id]/page.tsx` | rewrite | Server component. Composes the new family. Status-branched body. The existing inline `ModeBadge` and `timeAgo` helper are removed. |
| `apps/web/components/diagnosis-display.tsx` | **delete** | Replaced. Single consumer (`page.tsx`) is rewritten in the same PR. |

---

## Task 1: Pure helpers — `lib/diagnosis-sentence.ts` with full vitest coverage

**Files:**
- Create: `apps/web/lib/diagnosis-sentence.ts`
- Create: `apps/web/lib/__tests__/diagnosis-sentence.test.ts`

This task is pure TypeScript with no React. TDD throughout — write tests first, watch fail, implement, watch pass.

- [ ] **Step 1: Create the helper module skeleton**

Write `apps/web/lib/diagnosis-sentence.ts` with type definitions only — no implementations yet (so tests fail clearly):

```typescript
import type {
  AssessmentDiagnosis,
  ProblemObservation,
} from "@/lib/types";

export type Role = "parent" | "teacher";

export type TopSentence =
  | {
      kind: "structured";
      score: string;
      lead: string;
      accentPhrase: string | null;
    }
  | {
      kind: "fallback";
      text: string;
    };

export interface PatternGroup {
  slug: string | null;
  category: string | null;
  name: string | null;
  description: string | null;
  problems: ProblemObservation[];
}

export function firstName(fullName: string): string {
  throw new Error("not implemented");
}

export function buildTopSentence(
  diagnosis: AssessmentDiagnosis,
  role: Role,
): TopSentence {
  throw new Error("not implemented");
}

export function groupProblemsByPattern(
  problems: ProblemObservation[],
): PatternGroup[] {
  throw new Error("not implemented");
}
```

- [ ] **Step 2: Write the failing test file**

Write `apps/web/lib/__tests__/diagnosis-sentence.test.ts` with the full case matrix:

```typescript
import { describe, expect, it } from "vitest";
import {
  buildTopSentence,
  firstName,
  groupProblemsByPattern,
  type PatternGroup,
} from "@/lib/diagnosis-sentence";
import type {
  AssessmentDiagnosis,
  ProblemObservation,
} from "@/lib/types";

// ─── Test fixtures ──────────────────────────────────────────────────

function makeProblem(overrides: Partial<ProblemObservation> = {}): ProblemObservation {
  return {
    id: "p-" + (overrides.problem_number ?? 1),
    problem_number: 1,
    page_number: 1,
    student_answer: "",
    correct_answer: "",
    is_correct: false,
    error_pattern_slug: null,
    error_pattern_name: null,
    error_category_slug: null,
    error_description: null,
    solution_steps: null,
    ...overrides,
  };
}

function makeDiagnosis(
  problems: ProblemObservation[],
  overrides: Partial<AssessmentDiagnosis> = {},
): AssessmentDiagnosis {
  return {
    id: "d-1",
    model: "test-model",
    overall_summary: null,
    cost_usd: 0,
    latency_ms: 0,
    created_at: "2026-04-29T00:00:00Z",
    problems,
    analysis_mode: "auto_grade",
    total_problems_seen: problems.length,
    ...overrides,
  };
}

// ─── firstName ──────────────────────────────────────────────────────

describe("firstName", () => {
  it("returns the first space-separated token", () => {
    expect(firstName("Marcus Reilly")).toBe("Marcus");
  });

  it("returns the only token when name is single-word", () => {
    expect(firstName("Madonna")).toBe("Madonna");
  });

  it("trims leading/trailing whitespace before splitting", () => {
    expect(firstName("  Marcus  Reilly  ")).toBe("Marcus");
  });

  it("returns the original string when empty (degenerate input)", () => {
    expect(firstName("")).toBe("");
  });
});

// ─── buildTopSentence ───────────────────────────────────────────────

describe("buildTopSentence — all correct", () => {
  it("renders the no-mistakes structured sentence (parent)", () => {
    const d = makeDiagnosis([
      makeProblem({ problem_number: 1, is_correct: true }),
      makeProblem({ problem_number: 2, is_correct: true }),
    ]);
    expect(buildTopSentence(d, "parent")).toEqual({
      kind: "structured",
      score: "2 of 2",
      lead: "No mistakes worth flagging.",
      accentPhrase: null,
    });
  });

  it("renders identical structure for teacher in all-correct case", () => {
    const d = makeDiagnosis([
      makeProblem({ problem_number: 1, is_correct: true }),
      makeProblem({ problem_number: 2, is_correct: true }),
    ]);
    expect(buildTopSentence(d, "teacher")).toEqual({
      kind: "structured",
      score: "2 of 2",
      lead: "No mistakes worth flagging.",
      accentPhrase: null,
    });
  });
});

describe("buildTopSentence — single wrong", () => {
  it("renders the with-pattern accent phrase (parent)", () => {
    const d = makeDiagnosis([
      makeProblem({ problem_number: 1, is_correct: true }),
      makeProblem({
        problem_number: 2,
        is_correct: false,
        error_pattern_slug: "neg-distrib",
        error_pattern_name: "dropping the negative when distributing",
      }),
    ]);
    expect(buildTopSentence(d, "parent")).toEqual({
      kind: "structured",
      score: "1 of 2",
      lead: "The miss is",
      accentPhrase: "dropping the negative when distributing",
    });
  });

  it("renders without-pattern fallback for single wrong without slug", () => {
    const d = makeDiagnosis([
      makeProblem({ problem_number: 1, is_correct: true }),
      makeProblem({ problem_number: 2, is_correct: false }),
    ]);
    expect(buildTopSentence(d, "parent")).toEqual({
      kind: "structured",
      score: "1 of 2",
      lead: "One missed problem.",
      accentPhrase: null,
    });
  });
});

describe("buildTopSentence — dominant pattern", () => {
  it("uses parent voicing 'wrong answers'", () => {
    const d = makeDiagnosis([
      makeProblem({ problem_number: 1, is_correct: true }),
      makeProblem({
        problem_number: 4,
        is_correct: false,
        error_pattern_slug: "neg-distrib",
        error_pattern_name: "dropping the negative when distributing",
      }),
      makeProblem({
        problem_number: 7,
        is_correct: false,
        error_pattern_slug: "neg-distrib",
        error_pattern_name: "dropping the negative when distributing",
      }),
      makeProblem({
        problem_number: 12,
        is_correct: false,
        error_pattern_slug: "neg-distrib",
        error_pattern_name: "dropping the negative when distributing",
      }),
      makeProblem({ problem_number: 9, is_correct: false }),
    ]);
    expect(buildTopSentence(d, "parent")).toEqual({
      kind: "structured",
      score: "1 of 5",
      lead: "3 of 4 wrong answers share the same pattern:",
      accentPhrase: "dropping the negative when distributing",
    });
  });

  it("uses teacher voicing 'wrong'", () => {
    const d = makeDiagnosis([
      makeProblem({
        problem_number: 4,
        is_correct: false,
        error_pattern_slug: "neg-distrib",
        error_pattern_name: "dropping the negative when distributing",
      }),
      makeProblem({
        problem_number: 7,
        is_correct: false,
        error_pattern_slug: "neg-distrib",
        error_pattern_name: "dropping the negative when distributing",
      }),
      makeProblem({ problem_number: 9, is_correct: false }),
    ]);
    const result = buildTopSentence(d, "teacher");
    expect(result.kind).toBe("structured");
    if (result.kind !== "structured") return;
    expect(result.lead).toBe("2 of 3 wrong share the same pattern:");
    expect(result.accentPhrase).toBe("dropping the negative when distributing");
  });

  it("breaks ties on max-count by lowest problem_number of first occurrence", () => {
    const d = makeDiagnosis([
      makeProblem({
        problem_number: 5,
        is_correct: false,
        error_pattern_slug: "later",
        error_pattern_name: "later pattern",
      }),
      makeProblem({
        problem_number: 6,
        is_correct: false,
        error_pattern_slug: "later",
        error_pattern_name: "later pattern",
      }),
      makeProblem({
        problem_number: 1,
        is_correct: false,
        error_pattern_slug: "earlier",
        error_pattern_name: "earlier pattern",
      }),
      makeProblem({
        problem_number: 2,
        is_correct: false,
        error_pattern_slug: "earlier",
        error_pattern_name: "earlier pattern",
      }),
    ]);
    const result = buildTopSentence(d, "parent");
    expect(result.kind).toBe("structured");
    if (result.kind !== "structured") return;
    expect(result.accentPhrase).toBe("earlier pattern");
  });
});

describe("buildTopSentence — no dominant pattern", () => {
  it("renders the each-different fallback when every wrong has a distinct slug", () => {
    const d = makeDiagnosis([
      makeProblem({
        problem_number: 1,
        is_correct: false,
        error_pattern_slug: "a",
        error_pattern_name: "a",
      }),
      makeProblem({
        problem_number: 2,
        is_correct: false,
        error_pattern_slug: "b",
        error_pattern_name: "b",
      }),
      makeProblem({
        problem_number: 3,
        is_correct: false,
        error_pattern_slug: "c",
        error_pattern_name: "c",
      }),
    ]);
    expect(buildTopSentence(d, "parent")).toEqual({
      kind: "structured",
      score: "0 of 3",
      lead: "Each missed problem hit a different pattern — see below.",
      accentPhrase: null,
    });
  });

  it("renders the each-different fallback when all wrong have null slug", () => {
    const d = makeDiagnosis([
      makeProblem({ problem_number: 1, is_correct: false }),
      makeProblem({ problem_number: 2, is_correct: false }),
      makeProblem({ problem_number: 3, is_correct: false }),
    ]);
    expect(buildTopSentence(d, "parent")).toEqual({
      kind: "structured",
      score: "0 of 3",
      lead: "Each missed problem hit a different pattern — see below.",
      accentPhrase: null,
    });
  });
});

describe("buildTopSentence — fallback paths", () => {
  it("falls back to overall_summary when problems is empty", () => {
    const d = makeDiagnosis([], { overall_summary: "Diagnostic complete." });
    expect(buildTopSentence(d, "parent")).toEqual({
      kind: "fallback",
      text: "Diagnostic complete.",
    });
  });

  it("falls back to default text when problems is empty and no summary", () => {
    const d = makeDiagnosis([], { overall_summary: null });
    expect(buildTopSentence(d, "parent")).toEqual({
      kind: "fallback",
      text: "Diagnostic complete.",
    });
  });

  it("uses total_problems_seen for the denominator when present and larger than problems.length", () => {
    const d = makeDiagnosis(
      [makeProblem({ problem_number: 1, is_correct: true })],
      { total_problems_seen: 18 },
    );
    const result = buildTopSentence(d, "parent");
    expect(result.kind).toBe("structured");
    if (result.kind !== "structured") return;
    expect(result.score).toBe("1 of 18");
  });
});

// ─── groupProblemsByPattern ──────────────────────────────────────────

describe("groupProblemsByPattern", () => {
  it("excludes correct problems", () => {
    const problems = [
      makeProblem({ problem_number: 1, is_correct: true }),
      makeProblem({
        problem_number: 2,
        is_correct: false,
        error_pattern_slug: "x",
        error_pattern_name: "x pattern",
      }),
    ];
    const groups = groupProblemsByPattern(problems);
    expect(groups).toHaveLength(1);
    expect(groups[0].problems.map((p) => p.problem_number)).toEqual([2]);
  });

  it("sorts groups by count descending", () => {
    const problems = [
      makeProblem({
        problem_number: 1,
        is_correct: false,
        error_pattern_slug: "small",
        error_pattern_name: "small",
      }),
      makeProblem({
        problem_number: 2,
        is_correct: false,
        error_pattern_slug: "big",
        error_pattern_name: "big",
      }),
      makeProblem({
        problem_number: 3,
        is_correct: false,
        error_pattern_slug: "big",
        error_pattern_name: "big",
      }),
      makeProblem({
        problem_number: 4,
        is_correct: false,
        error_pattern_slug: "big",
        error_pattern_name: "big",
      }),
    ];
    const groups = groupProblemsByPattern(problems);
    expect(groups.map((g) => g.slug)).toEqual(["big", "small"]);
  });

  it("buckets null-slug wrong problems into a single OTHER group at the end", () => {
    const problems = [
      makeProblem({ problem_number: 1, is_correct: false }),
      makeProblem({
        problem_number: 2,
        is_correct: false,
        error_pattern_slug: "p",
        error_pattern_name: "p",
      }),
      makeProblem({ problem_number: 3, is_correct: false }),
    ];
    const groups = groupProblemsByPattern(problems);
    expect(groups.map((g) => g.slug)).toEqual(["p", null]);
    expect(groups[1].problems).toHaveLength(2);
  });

  it("places OTHER bucket last regardless of count", () => {
    const problems = [
      makeProblem({ problem_number: 1, is_correct: false }),
      makeProblem({ problem_number: 2, is_correct: false }),
      makeProblem({ problem_number: 3, is_correct: false }),
      makeProblem({
        problem_number: 4,
        is_correct: false,
        error_pattern_slug: "p",
        error_pattern_name: "p",
      }),
    ];
    const groups = groupProblemsByPattern(problems);
    expect(groups.map((g) => g.slug)).toEqual(["p", null]);
  });

  it("returns an empty array when no problems are wrong", () => {
    const problems = [
      makeProblem({ problem_number: 1, is_correct: true }),
      makeProblem({ problem_number: 2, is_correct: true }),
    ];
    expect(groupProblemsByPattern(problems)).toEqual([]);
  });

  it("uses the first problem's error_description as the group description", () => {
    const problems = [
      makeProblem({
        problem_number: 1,
        is_correct: false,
        error_pattern_slug: "p",
        error_pattern_name: "p",
        error_description: "first description",
      }),
      makeProblem({
        problem_number: 2,
        is_correct: false,
        error_pattern_slug: "p",
        error_pattern_name: "p",
        error_description: "second description (ignored)",
      }),
    ];
    const groups = groupProblemsByPattern(problems);
    expect(groups[0].description).toBe("first description");
  });
});
```

- [ ] **Step 3: Run failing tests to confirm they fail for the right reason**

Run: `pnpm --filter web test -- diagnosis-sentence`
Expected: every test fails with `Error: not implemented`. (The skeleton from Step 1 throws; tests run against it.)

- [ ] **Step 4: Implement the helpers**

Replace the contents of `apps/web/lib/diagnosis-sentence.ts` with the complete implementation:

```typescript
import type {
  AssessmentDiagnosis,
  ProblemObservation,
} from "@/lib/types";

export type Role = "parent" | "teacher";

export type TopSentence =
  | {
      kind: "structured";
      score: string;
      lead: string;
      accentPhrase: string | null;
    }
  | {
      kind: "fallback";
      text: string;
    };

export interface PatternGroup {
  slug: string | null;
  category: string | null;
  name: string | null;
  description: string | null;
  problems: ProblemObservation[];
}

export function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (trimmed === "") return fullName;
  return trimmed.split(/\s+/)[0];
}

export function buildTopSentence(
  diagnosis: AssessmentDiagnosis,
  role: Role,
): TopSentence {
  const { problems, total_problems_seen, overall_summary } = diagnosis;

  if (problems.length === 0) {
    const text =
      overall_summary && overall_summary.trim() !== ""
        ? overall_summary
        : "Diagnostic complete.";
    return { kind: "fallback", text };
  }

  const right = problems.filter((p) => p.is_correct).length;
  const wrong = problems.filter((p) => !p.is_correct);
  const seen = total_problems_seen ?? problems.length;
  const score = `${right} of ${seen}`;

  // All correct
  if (wrong.length === 0) {
    return {
      kind: "structured",
      score,
      lead: "No mistakes worth flagging.",
      accentPhrase: null,
    };
  }

  // Single wrong
  if (wrong.length === 1) {
    const only = wrong[0];
    if (only.error_pattern_name) {
      return {
        kind: "structured",
        score,
        lead: "The miss is",
        accentPhrase: only.error_pattern_name,
      };
    }
    return {
      kind: "structured",
      score,
      lead: "One missed problem.",
      accentPhrase: null,
    };
  }

  // Compute dominant pattern (only over non-null slugs)
  const slugCounts = new Map<string, { count: number; firstOccurrence: number; name: string | null }>();
  for (const p of wrong) {
    if (!p.error_pattern_slug) continue;
    const existing = slugCounts.get(p.error_pattern_slug);
    if (existing) {
      existing.count += 1;
    } else {
      slugCounts.set(p.error_pattern_slug, {
        count: 1,
        firstOccurrence: p.problem_number,
        name: p.error_pattern_name,
      });
    }
  }

  let dominantSlug: string | null = null;
  let dominantInfo: { count: number; firstOccurrence: number; name: string | null } | null = null;
  for (const [slug, info] of slugCounts) {
    if (info.count < 2) continue;
    if (
      dominantInfo === null ||
      info.count > dominantInfo.count ||
      (info.count === dominantInfo.count && info.firstOccurrence < dominantInfo.firstOccurrence)
    ) {
      dominantSlug = slug;
      dominantInfo = info;
    }
  }

  if (dominantInfo && dominantSlug !== null) {
    const wrongWord = role === "teacher" ? "wrong" : "wrong answers";
    return {
      kind: "structured",
      score,
      lead: `${dominantInfo.count} of ${wrong.length} ${wrongWord} share the same pattern:`,
      accentPhrase: dominantInfo.name ?? null,
    };
  }

  // No dominant pattern
  return {
    kind: "structured",
    score,
    lead: "Each missed problem hit a different pattern — see below.",
    accentPhrase: null,
  };
}

export function groupProblemsByPattern(
  problems: ProblemObservation[],
): PatternGroup[] {
  const wrong = problems.filter((p) => !p.is_correct);
  if (wrong.length === 0) return [];

  const buckets = new Map<string, PatternGroup>();
  const otherBucket: PatternGroup = {
    slug: null,
    category: null,
    name: null,
    description: null,
    problems: [],
  };

  for (const p of wrong) {
    if (!p.error_pattern_slug) {
      otherBucket.problems.push(p);
      if (otherBucket.description === null && p.error_description) {
        otherBucket.description = p.error_description;
      }
      continue;
    }
    const existing = buckets.get(p.error_pattern_slug);
    if (existing) {
      existing.problems.push(p);
      continue;
    }
    buckets.set(p.error_pattern_slug, {
      slug: p.error_pattern_slug,
      category: p.error_category_slug,
      name: p.error_pattern_name,
      description: p.error_description,
      problems: [p],
    });
  }

  const namedGroups = Array.from(buckets.values()).sort(
    (a, b) => b.problems.length - a.problems.length,
  );

  if (otherBucket.problems.length > 0) {
    return [...namedGroups, otherBucket];
  }
  return namedGroups;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter web test -- diagnosis-sentence`
Expected: all tests pass (one describe block per case area; ~18 tests total).

- [ ] **Step 6: Run full web typecheck**

Run: `pnpm --filter web typecheck`
Expected: clean (`tsc --noEmit` exits 0).

- [ ] **Step 7: Run lint**

Run: `pnpm --filter web lint`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/diagnosis-sentence.ts apps/web/lib/__tests__/diagnosis-sentence.test.ts
git commit -m "$(cat <<'EOF'
web: add diagnosis-sentence helpers (firstName, buildTopSentence, groupProblemsByPattern)

Step 10 · diagnosis page. Pure helpers consumed by the TopSentence
and PatternGroup components in subsequent commits. Full vitest
coverage of the five buildTopSentence cases (all-correct / single
wrong with pattern / single wrong without pattern / dominant pattern
/ no dominant pattern), tie-breaking by lowest problem_number,
parent vs teacher voicing tokens, fallback paths, and the OTHER
bucket placement in groupProblemsByPattern.

No call sites yet — this commit only adds the module.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `mode-badge.tsx` — atomic component

**Files:**
- Create: `apps/web/components/diagnosis/mode-badge.tsx`

- [ ] **Step 1: Create the component**

```typescript
import type { AssessmentDiagnosis } from "@/lib/types";

const LABELS: Record<AssessmentDiagnosis["analysis_mode"], string> = {
  auto_grade: "AUTO-GRADED",
  with_key: "GRADED WITH KEY",
  already_graded: "READING THE TEACHER'S MARKS",
};

export function ModeBadge({
  mode,
}: {
  mode: AssessmentDiagnosis["analysis_mode"];
}) {
  return (
    <span className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
      {LABELS[mode]}
    </span>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/diagnosis/mode-badge.tsx
git commit -m "$(cat <<'EOF'
web: add diagnosis/mode-badge with canvas labels

Step 10 · diagnosis page. Three labels per the Diagnosis v2 canvas:
AUTO-GRADED / GRADED WITH KEY / READING THE TEACHER'S MARKS.
Uppercase mono, tracking-[0.14em], text-ink-mute. Replaces the
inline ModeBadge currently in apps/web/app/assessments/[id]/page.tsx
(which embeds the answer-key name and uses sentence-case labels);
the answer-key name will move to the metadata strip in the header
component (Task 10).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `handwritten-work.tsx` — atomic component

**Files:**
- Create: `apps/web/components/diagnosis/handwritten-work.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { cn } from "@/lib/utils";

export function HandwrittenWork({
  lines,
  className,
}: {
  lines: string[];
  className?: string;
}) {
  const flat = lines.join(" ");
  return (
    <div
      aria-label={`Student work: ${flat}`}
      className={cn(
        "font-hand text-[1.667rem] leading-[1.4] tracking-[0.01em] text-ink-soft",
        className,
      )}
    >
      {lines.map((line, i) => (
        <div key={i} className="whitespace-pre">
          {line}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/diagnosis/handwritten-work.tsx
git commit -m "$(cat <<'EOF'
web: add diagnosis/handwritten-work (Caveat-only-here)

Step 10 · diagnosis page. Renders student work in --font-hand
(Caveat) per the Diagnosis v2 canvas. Per the handoff doc and
globals.css comment, --font-hand is reserved for diagnostic-mock
handwriting — this component is the only place it ships in v2.

aria-label flattens the lines to a single string so screen readers
don't try to announce per-line Caveat glyphs as decorative art.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `printed-solution.tsx` — atomic component

**Files:**
- Create: `apps/web/components/diagnosis/printed-solution.tsx`

- [ ] **Step 1: Create the component**

```typescript
export function PrintedSolution({ steps }: { steps: string }) {
  const lines = steps
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return null;

  return (
    <ol className="font-serif text-base text-ink leading-[1.55]">
      {lines.map((line, i) => (
        <li key={i} className="flex gap-3 py-1">
          <span className="font-mono text-xs text-ink-mute pt-1.5 min-w-[1.25rem]">
            {i + 1}.
          </span>
          <span className="whitespace-pre-wrap">{line}</span>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/diagnosis/printed-solution.tsx
git commit -m "$(cat <<'EOF'
web: add diagnosis/printed-solution (numbered serif steps)

Step 10 · diagnosis page. Parses the engine's solution_steps text
(newline-split, trimmed, blanks dropped) into a serif numbered ol.
Used inside the per-problem <details> Steps expand. Returns null
on empty input so the caller can render the disclosure trigger
conditionally.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `top-sentence.tsx` — composite (depends on Task 1)

**Files:**
- Create: `apps/web/components/diagnosis/top-sentence.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { firstName, type Role, type TopSentence as TopSentenceShape } from "@/lib/diagnosis-sentence";

const EYEBROW: Record<Role, string> = {
  parent: "WHAT THIS QUIZ TELLS US",
  teacher: "WHAT YOU'RE LOOKING AT",
};

export function TopSentence({
  studentName,
  sentence,
  role,
}: {
  studentName: string;
  sentence: TopSentenceShape;
  role: Role;
}) {
  return (
    <section className="border border-rule-soft border-l-[3px] border-l-accent rounded-[var(--radius-md)] bg-paper-soft px-10 py-9">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">
        {EYEBROW[role]}
      </p>
      {sentence.kind === "structured" ? (
        <p className="font-serif text-2xl font-normal text-ink leading-[1.3] tracking-[-0.014em] mt-3 max-w-[60ch]">
          {firstName(studentName)} got{" "}
          <strong className="font-medium">{sentence.score}</strong>.{" "}
          {sentence.lead}
          {sentence.accentPhrase ? (
            <>
              {" "}
              <span className="text-accent">{sentence.accentPhrase}.</span>
            </>
          ) : null}
        </p>
      ) : (
        <p className="font-serif text-2xl font-normal text-ink leading-[1.3] tracking-[-0.014em] mt-3 max-w-[60ch]">
          {sentence.text}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/diagnosis/top-sentence.tsx
git commit -m "$(cat <<'EOF'
web: add diagnosis/top-sentence (the editorial moment)

Step 10 · diagnosis page. Renders the TopSentence discriminated
union from lib/diagnosis-sentence: structured = first-name +
bold score + lead + accent-colored phrase; fallback = plain
serif text. Boxed with border-l-[3px] border-l-accent on
bg-paper-soft. Mono accent eyebrow label varies by role
("WHAT THIS QUIZ TELLS US" parent / "WHAT YOU'RE LOOKING AT"
teacher) per canvas. Uses text-2xl (28px), the closest token to
the canvas's 1.889rem treatment.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `problem-row.tsx` — composite (depends on Tasks 3, 4)

**Files:**
- Create: `apps/web/components/diagnosis/problem-row.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { HandwrittenWork } from "@/components/diagnosis/handwritten-work";
import { PrintedSolution } from "@/components/diagnosis/printed-solution";
import type { ProblemObservation } from "@/lib/types";

function workLines(answer: string): string[] {
  if (!answer) return [""];
  return answer.split(/\r?\n/);
}

export function ProblemRow({ problem }: { problem: ProblemObservation }) {
  const hasSteps =
    !!problem.solution_steps && problem.solution_steps.trim() !== "";

  return (
    <article
      id={`problem-${problem.problem_number}`}
      className="px-8 py-6 border-t border-rule-soft first:border-t-0"
    >
      <div className="grid grid-cols-[60px_1.4fr_1fr_1fr] gap-5 items-start">
        <div className="font-serif italic text-2xl text-ink-mute">
          #{problem.problem_number}
        </div>

        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
            Their answer
          </p>
          <div className="mt-1">
            <HandwrittenWork lines={workLines(problem.student_answer)} />
          </div>
        </div>

        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
            What it should be
          </p>
          <p className="font-serif text-xl text-ink mt-1">
            {problem.correct_answer}
          </p>
        </div>

        <div>
          {!problem.is_correct && problem.error_description ? (
            <>
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
                Why
              </p>
              <p className="font-sans italic text-sm text-insight mt-1">
                ↑ {problem.error_description}
              </p>
            </>
          ) : null}
        </div>
      </div>

      {hasSteps ? (
        <details className="mt-4 ml-[80px]">
          <summary className="font-mono text-xs uppercase tracking-[0.1em] text-accent cursor-pointer list-none [&::-webkit-details-marker]:hidden inline-block">
            Steps ›
          </summary>
          <div className="mt-3">
            <PrintedSolution steps={problem.solution_steps as string} />
          </div>
        </details>
      ) : null}
    </article>
  );
}
```

The grid is 4 columns: index · their answer (Caveat) · what it should be (serif) · why (italic insight-amber, only when error_description is non-null and the problem is wrong). The Steps `<details>` lives below the grid, indented with `ml-[80px]` to align under the answer column. The summary's default disclosure triangle is hidden via `list-none` + the `::-webkit-details-marker` selector so the link reads as a clean "Steps ›" rather than a bullet. `solution_steps` is `string | null` in the type; the `hasSteps` check narrows it before we cast in the `<PrintedSolution>` prop.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/diagnosis/problem-row.tsx
git commit -m "$(cat <<'EOF'
web: add diagnosis/problem-row (3-col + native <details> Steps expand)

Step 10 · diagnosis page. Three-column row per canvas: prompt
(serif) · student work (Caveat via HandwrittenWork) · correct
answer (serif). Steps expand uses native <details>/<summary> for
keyboard + screen-reader native behavior; renders only when
solution_steps is non-null/non-empty. Each row carries
id="problem-{N}" so the bottom problem grid's jump links scroll
the matching row into view.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `pattern-group.tsx` — composite (depends on Tasks 1, 6)

**Files:**
- Create: `apps/web/components/diagnosis/pattern-group.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { ProblemRow } from "@/components/diagnosis/problem-row";
import type { PatternGroup as PatternGroupShape } from "@/lib/diagnosis-sentence";

export function PatternGroup({
  group,
  totalWrong,
  emphasis,
}: {
  group: PatternGroupShape;
  totalWrong: number;
  emphasis: "primary" | "secondary";
}) {
  const isOther = group.slug === null;
  const count = group.problems.length;
  const isOneOff = !isOther && count === 1;

  let eyebrow: string;
  if (isOther) {
    eyebrow = `OTHER · ${count} OF ${totalWrong} WRONG`;
  } else if (isOneOff) {
    eyebrow = `${(group.category ?? "PATTERN").toUpperCase()} · ONE-OFF`;
  } else {
    eyebrow = `${(group.category ?? "PATTERN").toUpperCase()} · ${count} OF ${totalWrong} WRONG`;
  }

  const headerBg = emphasis === "primary" ? "bg-paper-soft" : "bg-paper";
  const eyebrowColor = emphasis === "primary" ? "text-accent" : "text-ink-mute";

  return (
    <section className="border border-rule rounded-[var(--radius-md)] bg-paper overflow-hidden">
      <header className={`${headerBg} px-8 py-6 border-b border-rule-soft flex items-baseline justify-between gap-6`}>
        <div>
          <p className={`font-mono text-xs uppercase tracking-[0.14em] ${eyebrowColor}`}>
            {eyebrow}
          </p>
          {group.name ? (
            <h3 className="font-serif text-xl font-medium text-ink mt-2 tracking-[-0.012em]">
              {group.name}
            </h3>
          ) : (
            <h3 className="font-serif text-xl font-medium text-ink mt-2">
              Unclassified
            </h3>
          )}
          {group.description ? (
            <p className="font-serif text-lg text-ink-soft leading-[1.5] mt-2 max-w-[60ch] line-clamp-3">
              {group.description}
            </p>
          ) : null}
        </div>
        <div aria-hidden="true" className="font-serif text-3xl font-normal text-ink shrink-0">
          {count}
        </div>
      </header>
      <div>
        {group.problems.map((p) => (
          <ProblemRow key={p.id} problem={p} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/diagnosis/pattern-group.tsx
git commit -m "$(cat <<'EOF'
web: add diagnosis/pattern-group (eyebrow + name + count + rows)

Step 10 · diagnosis page. Card with header (eyebrow + serif name +
serif description (line-clamp-3) + decorative count digit) and a
list of <ProblemRow>s. Eyebrow text:

  • ≥2 wrong sharing a slug → "{CATEGORY} · {N} OF {WRONG} WRONG"
  • 1 wrong (one-off card)  → "{CATEGORY} · ONE-OFF"
  • OTHER bucket             → "OTHER · {N} OF {WRONG} WRONG"

Primary emphasis (the largest group; first card in the page) gets
bg-paper-soft on the header and text-accent on the eyebrow. All
others get bg-paper and text-ink-mute. The count digit is
aria-hidden because the eyebrow text already states the count.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `problem-grid.tsx` — atomic component

**Files:**
- Create: `apps/web/components/diagnosis/problem-grid.tsx`

- [ ] **Step 1: Create the component**

```typescript
import type { ProblemObservation } from "@/lib/types";

export function ProblemGrid({ problems }: { problems: ProblemObservation[] }) {
  if (problems.length === 0) return null;

  // Sort by problem_number ascending so the grid reads left-to-right in order
  const sorted = [...problems].sort((a, b) => a.problem_number - b.problem_number);

  return (
    <section>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
        Everything else
      </p>
      <p className="font-sans text-base text-ink-soft mt-2 max-w-[60ch]">
        Tap any problem to scroll to its row above.
      </p>
      <ul
        role="list"
        className="grid grid-cols-9 gap-2 mt-5"
      >
        {sorted.map((p) => {
          const wrong = !p.is_correct;
          const label = `Problem ${p.problem_number}: ${wrong ? "incorrect" : "correct"}`;
          return (
            <li key={p.id}>
              <a
                href={wrong ? `#problem-${p.problem_number}` : undefined}
                aria-label={label}
                className={`flex flex-col items-center justify-center aspect-square rounded-[var(--radius-xs)] border ${
                  wrong
                    ? "border-insight bg-insight-soft hover:bg-[oklch(0.97_0.04_72)] cursor-pointer"
                    : "border-rule bg-paper"
                }`}
              >
                <span className="font-mono text-xs text-ink-mute" aria-hidden="true">
                  #{p.problem_number}
                </span>
                <span
                  className={`font-serif text-sm mt-0.5 ${wrong ? "text-insight" : "text-ink"}`}
                  aria-hidden="true"
                >
                  {wrong ? "✗" : "✓"}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

Correct squares omit the `href` so they're not focusable (their role is purely informational; only wrong problems have a target row to scroll to). Wrong squares jump to `#problem-{N}` per the row IDs from Task 6.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/diagnosis/problem-grid.tsx
git commit -m "$(cat <<'EOF'
web: add diagnosis/problem-grid (Everything else jump squares)

Step 10 · diagnosis page. Bottom 9-column grid of all problems
sorted ascending by problem_number. Wrong squares get
border-insight + bg-insight-soft and become <a href="#problem-N">
jump links to the matching ProblemRow. Correct squares are
informational only (no href, not focusable). Each square carries
aria-label="Problem N: correct/incorrect" so screen readers don't
read the ✓/✗ glyphs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `processing-card.tsx` — composite (depends on Task 1 firstName)

**Files:**
- Create: `apps/web/components/diagnosis/processing-card.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { firstName } from "@/lib/diagnosis-sentence";
import type { AssessmentDetail } from "@/lib/types";

type AnalysisMode = "auto_grade" | "with_key" | "already_graded";

const STEP_2_LABEL: Record<AnalysisMode, string> = {
  auto_grade: "Reading the work",
  with_key: "Reading against the answer key",
  already_graded: "Reading the marks the teacher made",
};

function indicativeStep(uploadedAt: string): 1 | 2 | 3 | 4 {
  const elapsed = (Date.now() - new Date(uploadedAt).getTime()) / 1000;
  if (elapsed < 5) return 1;
  if (elapsed < 15) return 2;
  if (elapsed < 25) return 3;
  return 4;
}

export function ProcessingCard({
  studentName,
  pages,
  uploadedAt,
  mode,
}: {
  studentName: string;
  pages: AssessmentDetail["pages"];
  uploadedAt: string;
  mode: AnalysisMode;
}) {
  const first = firstName(studentName);
  const current = indicativeStep(uploadedAt);

  const steps = [
    { n: 1 as const, label: "Pages received" },
    { n: 2 as const, label: STEP_2_LABEL[mode] },
    { n: 3 as const, label: `Looking at where ${first} went off` },
    { n: 4 as const, label: "Naming the pattern" },
  ];

  return (
    <section className="my-12">
      <div className="grid grid-cols-[1.4fr_1fr] gap-14 items-center bg-paper-soft border border-rule-soft rounded-[var(--radius-md)] px-14 py-14">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">
            Reading the quiz
          </p>
          <h2 className="font-serif text-3xl font-normal text-ink leading-tight tracking-[-0.014em] mt-4 max-w-[34ch]">
            We're working through {first}'s paper. Usually about thirty seconds.
          </h2>
          <p className="font-serif text-lg font-light text-ink-soft leading-[1.55] mt-4 max-w-[40ch]">
            You can close this page. We'll save the result to {first} when it's ready, and you can come back any time.
          </p>

          <ol className="mt-7 flex flex-col gap-3">
            {steps.map((s) => {
              const state =
                s.n < current ? "done" : s.n === current ? "doing" : "todo";
              return (
                <li key={s.n} className="flex gap-4 items-center">
                  <span
                    aria-hidden="true"
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      state === "done"
                        ? "border-accent bg-accent text-paper"
                        : "border-rule"
                    }`}
                  >
                    {state === "done" ? (
                      <span className="text-[9px] font-bold leading-none">✓</span>
                    ) : null}
                  </span>
                  <span
                    className={`font-serif text-base ${
                      state === "doing"
                        ? "text-ink italic"
                        : state === "todo"
                          ? "text-ink-mute"
                          : "text-ink-soft"
                    }`}
                  >
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        {pages.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {pages.slice(0, 4).map((p) => (
              /* eslint-disable-next-line @next/next/no-img-element -- presigned R2 URL, not optimizable */
              <img
                key={p.page_number}
                src={p.view_url}
                alt={`Page ${p.page_number}`}
                className="aspect-[8.5/11] object-cover bg-paper border border-rule rounded-[var(--radius-xs)]"
              />
            ))}
          </div>
        ) : null}
      </div>

      <p className="font-sans text-sm text-ink-mute text-center mt-6">
        Stored encrypted. Delete any time from settings.
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/diagnosis/processing-card.tsx
git commit -m "$(cat <<'EOF'
web: add diagnosis/processing-card (the calmer-than-a-spinner state)

Step 10 · diagnosis page. Two-column rich processing state per the
Diagnosis v2 canvas: serif headline + soft body invitation to leave
+ four-step checklist + thumbnail strip from detail.pages. Static
SSR — derives indicative current step from elapsed seconds since
uploaded_at (0–5s step 1; 5–15s step 2; 15–25s step 3; 25+ step 4).
Step-2 label varies by analysis_mode so we don't claim to be reading
marks when there are none.

Trust strip: "Stored encrypted. Delete any time from settings."
The canvas mock said "Auto-deleted after 30 days" which doesn't
match committed policy (30-day deletion-on-request, not auto-delete);
revised here, flagged in the spec.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `diagnosis-header.tsx` — composite (depends on Task 2)

**Files:**
- Create: `apps/web/components/diagnosis/diagnosis-header.tsx`

- [ ] **Step 1: Create the component**

```typescript
import Link from "next/link";

import { ModeBadge } from "@/components/diagnosis/mode-badge";
import { DeleteAssessmentButton } from "@/components/delete-assessment-button";
import { RunDiagnosticButton } from "@/components/run-diagnostic-button";
import { SerifHeadline } from "@/components/serif-headline";
import { Badge } from "@/components/ui/badge";
import type { AssessmentDetail, AssessmentStatus } from "@/lib/types";
import type { Role } from "@/lib/diagnosis-sentence";

const STATUS_LABEL: Record<AssessmentStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
};

function formatAbsoluteDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

export function DiagnosisHeader({
  detail,
  role,
}: {
  detail: AssessmentDetail;
  role: Role;
}) {
  const crumbRoot = role === "teacher" ? "Assessments" : "Students";
  const showStatusPill = detail.status !== "completed";

  return (
    <header>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
        <span>{crumbRoot}</span>
        <span aria-hidden="true"> · </span>
        <span className="text-ink">{detail.student_name}</span>
      </p>

      <div className="mt-6 flex items-end justify-between gap-8">
        <div>
          {detail.diagnosis ? <ModeBadge mode={detail.diagnosis.analysis_mode} /> : null}
          <SerifHeadline level="page" as="h1" className="mt-2">
            {detail.student_name}
          </SerifHeadline>
        </div>
        <div className="flex gap-3 shrink-0">
          {(detail.status === "pending" || detail.status === "failed" || detail.status === "completed") ? (
            <RunDiagnosticButton id={detail.id} />
          ) : null}
          <DeleteAssessmentButton id={detail.id} redirectTo="/dashboard" />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-2 font-sans text-base text-ink-soft">
        <span>uploaded {formatAbsoluteDate(detail.uploaded_at)}</span>
        <span aria-hidden="true">·</span>
        <span>
          {detail.pages.length} {detail.pages.length === 1 ? "page" : "pages"}
        </span>
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
          </>
        ) : null}
        {showStatusPill ? (
          <>
            <span aria-hidden="true">·</span>
            <Badge
              variant="secondary"
              className="font-mono uppercase tracking-[0.12em]"
            >
              {STATUS_LABEL[detail.status]}
            </Badge>
          </>
        ) : null}
      </div>
    </header>
  );
}
```

The Re-run button (`RunDiagnosticButton`) currently only renders for `pending` and `failed` in the existing `page.tsx`. The header renders it for `completed` too (per spec — "always visible") but **not** for `processing` (the diagnostic is mid-flight; re-running mid-run isn't meaningful). The button itself doesn't need any change; only the conditional callsite.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/diagnosis/diagnosis-header.tsx
git commit -m "$(cat <<'EOF'
web: add diagnosis/diagnosis-header (crumb + ModeBadge + H1 + meta + actions)

Step 10 · diagnosis page. Header per Diagnosis v2 canvas:

  • Crumb (mono caps): role-aware root — "Students" parent /
    "Assessments" teacher, then student name.
  • ModeBadge above the headline (canvas position).
  • SerifHeadline level="page" as="h1": student_name (no
    synthetic title — see spec §Out of scope).
  • Metadata strip: absolute-date "uploaded Apr 28" + page count
    + (with-key) link to the answer key in /keys/{id}.
  • Status pill (Pending/Processing/Failed) renders only for
    non-completed states.
  • Action bar: Re-run + Delete only (Print → Step 14, Save /
    Done / Prev/Next dropped per spec Q3 lock).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Rewrite `app/assessments/[id]/page.tsx`; delete `components/diagnosis-display.tsx`

**Files:**
- Modify: `apps/web/app/assessments/[id]/page.tsx`
- Delete: `apps/web/components/diagnosis-display.tsx`

- [ ] **Step 1: Replace the page**

Overwrite `apps/web/app/assessments/[id]/page.tsx` with:

```typescript
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { DiagnosisHeader } from "@/components/diagnosis/diagnosis-header";
import { PatternGroup } from "@/components/diagnosis/pattern-group";
import { ProblemGrid } from "@/components/diagnosis/problem-grid";
import { ProcessingCard } from "@/components/diagnosis/processing-card";
import { TopSentence } from "@/components/diagnosis/top-sentence";
import { PageContainer } from "@/components/page-container";
import { RunDiagnosticButton } from "@/components/run-diagnostic-button";
import { SerifHeadline } from "@/components/serif-headline";
import {
  buildTopSentence,
  groupProblemsByPattern,
  type Role,
} from "@/lib/diagnosis-sentence";
import { fetchAssessmentDetail, fetchMe } from "@/lib/api";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AssessmentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [user, detail] = await Promise.all([
    fetchMe(),
    fetchAssessmentDetail(id),
  ]);
  if (!user) redirect("/sign-in");
  if (!detail) notFound();

  const role: Role = user.organization?.id ? "teacher" : "parent";

  return (
    <AppShell
      orgName={user.organization?.name}
      userId={user.id}
      organizationId={user.organization?.id ?? null}
    >
      <PageContainer className="max-w-[1100px]">
        <DiagnosisHeader detail={detail} role={role} />

        {detail.status === "pending" ? (
          <div className="my-12 rounded-[var(--radius-sm)] border border-rule bg-paper-soft p-8 text-center">
            <SerifHeadline level="section" as="h2">
              Run diagnostic
            </SerifHeadline>
            <p className="mt-2 text-base text-ink-soft">
              Grade-Sight will analyze each problem on this assessment, identify
              error patterns, and provide step-by-step solutions.
            </p>
            <p className="mt-1 font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
              Takes about 30 seconds
            </p>
            <div className="mt-6 flex justify-center">
              <RunDiagnosticButton id={detail.id} />
            </div>
          </div>
        ) : null}

        {detail.status === "processing" ? (
          <ProcessingCard
            studentName={detail.student_name}
            pages={detail.pages}
            uploadedAt={detail.uploaded_at}
            mode={detail.diagnosis?.analysis_mode ?? "auto_grade"}
          />
        ) : null}

        {detail.status === "failed" ? (
          <div className="my-12 rounded-[var(--radius-sm)] border border-mark bg-paper-soft p-8 text-center">
            <p className="text-base text-mark">
              Something went wrong analyzing this assessment.
            </p>
            <div className="mt-4 flex justify-center">
              <RunDiagnosticButton id={detail.id} />
            </div>
          </div>
        ) : null}

        {detail.status === "completed" && detail.diagnosis ? (
          <CompletedBody detail={detail} role={role} />
        ) : null}

        <PagesReel detail={detail} />
      </PageContainer>
    </AppShell>
  );
}

function CompletedBody({
  detail,
  role,
}: {
  detail: NonNullable<Awaited<ReturnType<typeof fetchAssessmentDetail>>>;
  role: Role;
}) {
  if (!detail.diagnosis) return null;

  const sentence = buildTopSentence(detail.diagnosis, role);
  const groups = groupProblemsByPattern(detail.diagnosis.problems);
  const totalWrong = groups.reduce((acc, g) => acc + g.problems.length, 0);

  return (
    <div className="my-12 flex flex-col gap-12">
      <TopSentence
        studentName={detail.student_name}
        sentence={sentence}
        role={role}
      />

      {groups.length > 0 ? (
        <div className="flex flex-col gap-6">
          {groups.map((g, i) => (
            <PatternGroup
              key={g.slug ?? "other"}
              group={g}
              totalWrong={totalWrong}
              emphasis={i === 0 ? "primary" : "secondary"}
            />
          ))}
        </div>
      ) : null}

      <ProblemGrid problems={detail.diagnosis.problems} />
    </div>
  );
}

function PagesReel({
  detail,
}: {
  detail: NonNullable<Awaited<ReturnType<typeof fetchAssessmentDetail>>>;
}) {
  if (detail.pages.length === 0) return null;
  return (
    <section>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
        Pages · {detail.pages.length} photographed
      </p>
      <ul className="mt-5 space-y-6">
        {detail.pages.map((p) => (
          <li
            key={p.page_number}
            className="rounded-[var(--radius-sm)] border border-rule bg-paper p-4"
          >
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
              Page {p.page_number} · {p.original_filename}
            </p>
            <a
              href={p.view_url}
              target="_blank"
              rel="noreferrer"
              className="block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- presigned R2 URL, not optimizable */}
              <img
                src={p.view_url}
                alt={`Page ${p.page_number}: ${p.original_filename}`}
                className="w-full rounded-[var(--radius-sm)] border border-rule-soft"
              />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

Notes:
- Page width widens from `max-w-[800px]` to `max-w-[1100px]` to accommodate the 5-column problem-row grid (per canvas's 1180px parent / 1280px teacher max). One width for both roles is acceptable; canvas shows different widths but spec keeps "same components, different copy/density" as the guiding principle.
- `mode` in the ProcessingCard fallback to `"auto_grade"` is defensive — `diagnosis` is null during processing on first run; if a subsequent re-run is in flight we use the prior mode.
- `RunDiagnosticButton` still renders inside the failed-state body (existing) AND inside the new `<DiagnosisHeader>` action bar. Both are intentional — the body button is the prominent CTA on a failed page; the header button is consistent action chrome on completed pages.

- [ ] **Step 2: Delete the old DiagnosisDisplay**

```bash
git rm apps/web/components/diagnosis-display.tsx
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter web typecheck`
Expected: clean. If any stale references to `DiagnosisDisplay` remain, the typecheck will surface them — there should be none (single consumer was `page.tsx`).

- [ ] **Step 4: Run lint**

Run: `pnpm --filter web lint`
Expected: clean.

- [ ] **Step 5: Run vitest (full web suite)**

Run: `pnpm --filter web test`
Expected: all tests pass — diagnosis-sentence (~18 tests) + sentry-scrubber (10 tests) + any others.

- [ ] **Step 6: Run build**

Run: `pnpm --filter web build`
Expected: build succeeds. Static analysis on the page route passes.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/assessments/[id]/page.tsx
git commit -m "$(cat <<'EOF'
web: rewrite /assessments/[id] as the three-layer diagnosis narrative

Step 10 · diagnosis page. Replaces the flat-list <DiagnosisDisplay>
with the v2 editorial narrative composed from the new
components/diagnosis/ family:

  status === "completed":
    DiagnosisHeader → TopSentence → grouped PatternGroups → ProblemGrid → PagesReel
  status === "processing":
    DiagnosisHeader → ProcessingCard → PagesReel
  status === "pending" / "failed":
    DiagnosisHeader → existing run-diagnostic / failure cards → PagesReel

Page width widens to max-w-[1100px] for the 5-column problem-row
grid. Role (parent / teacher) derives from user.organization?.id and
threads down where copy density differs. The inline ModeBadge and
timeAgo helper are removed — both are now provided by
DiagnosisHeader (canvas labels) and DiagnosisHeader (absolute dates).

components/diagnosis-display.tsx is deleted; no other consumers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Manual visual verification

**Files:** none (verification only).

The dev server may need a restart per the kickoff prompt. Restart it before this task if necessary: `pnpm --filter web dev`.

For each of the five required scenarios, navigate to the matching assessment in the local DB and confirm the listed checks. If a scenario has no fixture in seed data, skip with a note — the spec's verification list documents it as a known gap, not a failure.

- [ ] **Step 1: Confirm dev servers are up**

`pnpm --filter web dev` (port 3000) and `pnpm --filter api dev` (port 8000) both running. If either is down, start it.

- [ ] **Step 2: Verify scenario 1 — Parent × already_graded × completed × recurring pattern**

Sign in as a parent account with at least one completed assessment that has ≥2 problems sharing the same `error_pattern_slug`. Navigate to `/assessments/{id}`. Verify:

- Crumb reads `STUDENTS · {STUDENT_NAME}`.
- ModeBadge reads `READING THE TEACHER'S MARKS`.
- H1 is the student name in serif.
- Metadata strip shows `uploaded {abs date} · N pages`.
- Action bar shows Re-run + Delete only.
- Top sentence: bold score, lead clause, accent-colored pattern phrase.
- First (largest) PatternGroup has `bg-paper-soft` header with `text-accent` eyebrow.
- ProblemRows: `#N` italic serif index, prompt serif, Caveat handwritten work, serif correct answer; "Steps ›" link present where solution_steps is non-null.
- Bottom ProblemGrid: 9-col grid; wrong squares amber-bordered; clicking a wrong square scrolls to the matching ProblemRow.
- No console errors.

- [ ] **Step 3: Verify scenario 2 — Teacher × with_key × completed × recurring pattern**

Sign in as a teacher account with at least one completed assessment graded against an answer key. Verify:

- Crumb reads `ASSESSMENTS · {STUDENT_NAME}`.
- ModeBadge reads `GRADED WITH KEY`.
- Metadata strip includes `· graded against {KEY_NAME}` linking to `/keys/{id}`.
- Top sentence uses `wrong` (teacher voicing), not `wrong answers`.
- Other checks identical to scenario 1.

- [ ] **Step 4: Verify scenario 3 — All correct (any role) × auto_grade × completed**

Either upload a perfect assessment or use existing seed data. Verify:

- Top sentence reads `{first} got X of X. No mistakes worth flagging.` with no accent phrase.
- No PatternGroup cards render.
- ProblemGrid shows all ✓ squares, all `border-rule` (no amber).
- ModeBadge reads `AUTO-GRADED`.

- [ ] **Step 5: Verify scenario 4 — Processing state**

Upload a fresh assessment and click Run diagnostic. While it's processing (~30s), the page should render the rich `<ProcessingCard>` (not the prior minimalist banner). Verify:

- Headline: `We're working through {first}'s paper. Usually about thirty seconds.`
- Body: `You can close this page. We'll save the result to {first} when it's ready, and you can come back any time.`
- Step-2 label varies by mode: with answer key → `Reading against the answer key`; without → `Reading the work` (or `Reading the marks the teacher made` for already-graded uploads).
- Page thumbnails render to the right (up to 4).
- Trust strip below: `Stored encrypted. Delete any time from settings.`
- After ~30s, refresh — completed view replaces the processing card (no auto-poll, per spec Q6).

- [ ] **Step 6: Verify scenario 5 — Failed state**

If a failed assessment exists, navigate to it. Verify the existing failure card renders unchanged (red border-mark text + Re-run button), with the new `<DiagnosisHeader>` above it. If no failed fixture exists, skip with a note.

- [ ] **Step 7: Note any deviations**

If anything in scenarios 1–6 doesn't match the spec, capture a screenshot to `assets/screenshots/step-10-{scenario}.png` and note it. The implementer can decide whether to fix in the same PR or open a follow-up issue.

This task does not produce a commit unless deviations require fixes.

---

## Task 13: Push branch and open PR

**Files:** none.

- [ ] **Step 1: Verify branch state**

```bash
git log --oneline main..HEAD
```

Expected: 11 task commits (Task 1 helper + 9 component commits + Task 11 page rewrite) plus the existing spec commit (`6cc6e35`). Total 12 commits on the branch.

- [ ] **Step 2: Push branch**

```bash
git push -u origin step-10-diagnosis-page
```

- [ ] **Step 3: Ask user before opening the PR**

Stop and ask the user. They have indicated a preference to use the GitHub UI for PR opening (or to authorize `gh` CLI explicitly). Do not run `gh pr create` without that authorization.

If authorized, the PR template per the user's working pattern is six headings: **Summary**, **Why**, **What changed**, **How to verify**, **Out of scope**, **Notes**. Body example:

```markdown
## Summary

Rebuilds `/assessments/[id]` as the Diagnosis v2 three-layer narrative — top sentence → pattern groups → problem rows — replacing the flat-list `<DiagnosisDisplay>`.

## Why

Step 10 of the v2 design build. Establishes the editorial vocabulary (`ModeBadge`, `HandwrittenWork`, `PatternGroup`, `ProblemRow`) that Steps 11–14 build on top of.

## What changed

- New pure helper `apps/web/lib/diagnosis-sentence.ts` with `firstName`, `buildTopSentence`, `groupProblemsByPattern`. Full vitest coverage.
- New family under `apps/web/components/diagnosis/`: `mode-badge`, `handwritten-work`, `printed-solution`, `top-sentence`, `problem-row`, `pattern-group`, `problem-grid`, `processing-card`, `diagnosis-header`.
- `apps/web/app/assessments/[id]/page.tsx` rewritten to compose the family; status-branched body; role/mode-aware copy.
- Old `apps/web/components/diagnosis-display.tsx` deleted (single consumer; no parallel-build).
- Spec patch: trust-strip copy revised for accuracy ("Stored encrypted. Delete any time from settings." vs canvas's inaccurate "Auto-deleted after 30 days").

## How to verify

Run `pnpm --filter web test`, `typecheck`, `lint`, `build` — all clean. Open `/assessments/{id}` for at least one completed assessment in each of: parent × already_graded with recurring pattern; teacher × with_key with recurring pattern; all-correct; processing in flight; failed.

## Out of scope

- Inline-correction edit panel → Step 11.
- `/assessments/[id]/viewer` (side-by-side with key) → Step 11.
- Print intervention button → Step 14.
- Class-context line / "recurring for student" longitudinal line → Step 12 / future class-roster step.
- Live polling on processing status — SSR-only per spec Q6.

## Notes

Spec at `docs/superpowers/specs/2026-04-29-step-10-diagnosis-page-design.md`. Plan at `docs/superpowers/plans/2026-04-29-step-10-diagnosis-page.md`. The processing card flagged a privacy mismatch in the canvas mock copy — captured in the spec for the design canvas owner.
```

---

## Self-Review

**1. Spec coverage**

Walking the spec section-by-section:

| Spec section | Plan task |
|---|---|
| §Architecture: page server component + family under components/diagnosis/ | Task 11 (page) + Tasks 2–10 (family) |
| §Components: `mode-badge.tsx` | Task 2 |
| §Components: `handwritten-work.tsx` (Caveat-only-here) | Task 3 |
| §Components: `printed-solution.tsx` | Task 4 |
| §Components: `top-sentence.tsx` (boxed, accent border-l, mono accent eyebrow) | Task 5 |
| §Components: `problem-row.tsx` (4-col grid + `<details>` below; no PROBLEM column — engine doesn't emit problem text) | Task 6 |
| §Components: `pattern-group.tsx` (header on bg-paper-soft for primary) | Task 7 |
| §Components: `problem-grid.tsx` (✓/✗, jump links) | Task 8 |
| §Components: `processing-card.tsx` (mode-aware step-2 label) | Task 9 |
| §Components: `diagnosis-header.tsx` (crumb + ModeBadge + H1 + meta + actions) | Task 10 |
| §Components: `diagnosis-sentence.ts` pure helpers | Task 1 |
| §Components: vitest coverage of helpers | Task 1 (Step 2) |
| §Components: delete `diagnosis-display.tsx` | Task 11 (Step 2) |
| §Sentence builder: 5 cases + tie-breaking + role tokens | Task 1 (test cases + impl) |
| §Pattern grouping: count-desc, OTHER bucket last, correct excluded | Task 1 (test cases + impl) |
| §Data flow: page composes the family with role threaded down | Task 11 |
| §Error handling: tolerates missing answer_key, empty problems, null solution_steps | Task 6, Task 8, Task 10 (each renders nothing/conditionally) |
| §Accessibility: aria-labels on grid, count digit aria-hidden, native focus | Tasks 7, 8, 3 |
| §Testing: vitest target | Task 1 |
| §Testing: typecheck + lint clean | Tasks 2–11 each verify; Task 11 cross-checks |
| §Testing: manual verification five scenarios | Task 12 |
| §Verification checklist (10 items) | covered across Tasks 1–12 |
| §Out of scope items (10 items) | nothing implemented from this list — verified by absence |

All requirements covered.

**2. Placeholder scan**

No "TBD", "TODO", "implement later", "appropriate error handling", "similar to Task N", or other red-flag phrases in the plan. (One pre-existing `// TODO(billing-card-summary)` exists in `apps/web/app/settings/billing/page.tsx` already in the codebase per `followups.md` — out of scope for this plan.)

**3. Type consistency**

- `Role` defined in Task 1, imported consistently in Tasks 5, 9, 10, 11.
- `TopSentence` (discriminated union) defined in Task 1, consumed in Task 5 + Task 11.
- `PatternGroup` (helper return type) defined in Task 1, consumed in Task 7 + Task 11. Shadows the component name `PatternGroup` from Task 7 — both are intentional and live in different namespaces (helper export vs component export); the component import uses the type alias `PatternGroupShape` to disambiguate, per Task 7 code.
- `firstName` defined in Task 1, consumed in Tasks 5, 9.
- `buildTopSentence` / `groupProblemsByPattern` defined in Task 1, consumed in Task 11.
- `ModeBadge` defined in Task 2, consumed in Task 10.
- `HandwrittenWork` defined in Task 3, consumed in Task 6.
- `PrintedSolution` defined in Task 4, consumed in Task 6.
- `ProblemRow` defined in Task 6, consumed in Task 7.

All type names, function signatures, and component prop shapes are consistent across tasks.
