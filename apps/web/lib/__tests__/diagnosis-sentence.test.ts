import { describe, expect, it } from "vitest";
import {
  buildTopSentence,
  firstName,
  groupProblemsByPattern,
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
    expect(groups[0]!.problems.map((p) => p.problem_number)).toEqual([2]);
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
    expect(groups[1]!.problems).toHaveLength(2);
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
    expect(groups[0]!.description).toBe("first description");
  });
});
