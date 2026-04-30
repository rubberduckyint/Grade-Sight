import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EditPanel } from "@/components/diagnosis/edit-panel";
import type { ErrorPattern } from "@/lib/types";

const PATTERNS: ErrorPattern[] = [
  { id: "p1", slug: "p1", name: "Pattern One", category_slug: "execution", category_name: "Execution" },
  { id: "p2", slug: "p2", name: "Pattern Two", category_slug: "conceptual", category_name: "Conceptual" },
];

afterEach(cleanup);

describe("EditPanel — initial state", () => {
  it("renders Save disabled when no review and no inputs", () => {
    render(
      <EditPanel
        initialPatternId={null}
        initialMarkedCorrect={false}
        patterns={PATTERNS}
        hasExistingReview={false}
        isSaving={false}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const save = screen.getByRole("button", { name: /save/i });
    expect(save).toBeDisabled();
  });

  it("renders Delete only when there's an existing review", () => {
    const { rerender } = render(
      <EditPanel
        initialPatternId={null}
        initialMarkedCorrect={false}
        patterns={PATTERNS}
        hasExistingReview={false}
        isSaving={false}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();

    rerender(
      <EditPanel
        initialPatternId={null}
        initialMarkedCorrect={true}
        patterns={PATTERNS}
        hasExistingReview={true}
        isSaving={false}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });
});

describe("EditPanel — interactions", () => {
  it("checking 'Mark as actually correct' enables Save", async () => {
    const user = userEvent.setup();
    render(
      <EditPanel
        initialPatternId={null}
        initialMarkedCorrect={false}
        patterns={PATTERNS}
        hasExistingReview={false}
        isSaving={false}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const checkbox = screen.getByRole("checkbox", { name: /mark this problem as actually correct/i });
    await user.click(checkbox);
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
  });

  it("Cancel triggers onCancel without calling onSave", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(
      <EditPanel
        initialPatternId={null}
        initialMarkedCorrect={false}
        patterns={PATTERNS}
        hasExistingReview={false}
        isSaving={false}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Save with mark-correct calls onSave with correct payload", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EditPanel
        initialPatternId={null}
        initialMarkedCorrect={true}
        patterns={PATTERNS}
        hasExistingReview={false}
        isSaving={false}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith({
      override_pattern_id: null,
      marked_correct: true,
    });
  });
});
