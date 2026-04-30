import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ProblemRow } from "@/components/diagnosis/problem-row";
import type { ErrorPattern, ProblemObservation } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/actions/reviews", () => ({
  createReview: vi.fn(),
  updateReview: vi.fn(),
  deleteReview: vi.fn(),
}));
vi.mock("@/lib/notify", () => ({
  notify: { success: vi.fn(), error: vi.fn() },
}));

const PATTERNS: ErrorPattern[] = [
  { id: "p1", slug: "p1", name: "Pattern One", category_slug: "execution", category_name: "Execution" },
];

function makeProblem(overrides: Partial<ProblemObservation> = {}): ProblemObservation {
  return {
    id: "1",
    problem_number: 4,
    page_number: 1,
    student_answer: "x + 2",
    correct_answer: "2x",
    is_correct: false,
    error_pattern_slug: "auto-slug",
    error_pattern_name: "auto",
    error_category_slug: "execution",
    error_description: "auto desc",
    solution_steps: null,
    review: null,
    ...overrides,
  };
}

afterEach(cleanup);

describe("ProblemRow — affordance gating", () => {
  it("does not render Edit link for parent role on a wrong row", () => {
    render(
      <ProblemRow
        problem={makeProblem()}
        assessmentId="a-1"
        role="parent"
        errorPatterns={PATTERNS}
      />,
    );
    expect(screen.queryByRole("button", { name: /edit/i })).toBeNull();
  });

  it("renders Edit link for teacher role on a wrong row", () => {
    render(
      <ProblemRow
        problem={makeProblem()}
        assessmentId="a-1"
        role="teacher"
        errorPatterns={PATTERNS}
      />,
    );
    expect(screen.getByRole("button", { name: /edit ›/i })).toBeInTheDocument();
  });

  it("renders Edit link for teacher when row is correct but has a review", () => {
    render(
      <ProblemRow
        problem={makeProblem({
          is_correct: true,
          review: {
            id: "r1",
            marked_correct: true,
            override_pattern_id: null,
            override_pattern_slug: null,
            override_pattern_name: null,
            note: null,
            reviewed_at: "2026-04-30T00:00:00Z",
            reviewed_by_name: "Jane",
          },
        })}
        assessmentId="a-1"
        role="teacher"
        errorPatterns={PATTERNS}
      />,
    );
    expect(screen.getByRole("button", { name: /edit ›/i })).toBeInTheDocument();
  });
});

describe("ProblemRow — edit transitions", () => {
  it("clicking Edit shows the EditPanel", async () => {
    const user = userEvent.setup();
    render(
      <ProblemRow
        problem={makeProblem()}
        assessmentId="a-1"
        role="teacher"
        errorPatterns={PATTERNS}
      />,
    );
    await user.click(screen.getByRole("button", { name: /edit ›/i }));
    expect(screen.getByText(/editing this diagnosis/i)).toBeInTheDocument();
  });

  it("Cancel returns to view mode", async () => {
    const user = userEvent.setup();
    render(
      <ProblemRow
        problem={makeProblem()}
        assessmentId="a-1"
        role="teacher"
        errorPatterns={PATTERNS}
      />,
    );
    await user.click(screen.getByRole("button", { name: /edit ›/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByText(/editing this diagnosis/i)).toBeNull();
    expect(screen.getByRole("button", { name: /edit ›/i })).toBeInTheDocument();
  });
});
