import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { AddStudentsDialog } from "./add-students-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const mockAdd = vi.fn();
vi.mock("@/lib/actions", () => ({
  addStudentsToClass: (...args: unknown[]) => mockAdd(...args),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const candidates = [
  { id: "s1", full_name: "Marcus Reilly", grade_level: 9, created_at: "2026-04-01T00:00:00Z" },
  { id: "s2", full_name: "Jordan Park", grade_level: 9, created_at: "2026-04-01T00:00:00Z" },
];

describe("AddStudentsDialog", () => {
  beforeEach(() => mockAdd.mockReset());

  it("renders candidate students", () => {
    render(
      <AddStudentsDialog open onOpenChange={() => {}} classId="c1" candidates={candidates} />,
    );
    expect(screen.getByText("Marcus Reilly")).toBeInTheDocument();
    expect(screen.getByText("Jordan Park")).toBeInTheDocument();
  });

  it("disables submit until at least one is selected", async () => {
    render(
      <AddStudentsDialog open onOpenChange={() => {}} classId="c1" candidates={candidates} />,
    );
    const submit = screen.getByRole("button", { name: /add 0 students/i });
    expect(submit).toBeDisabled();

    await userEvent.click(screen.getByLabelText("Marcus Reilly"));
    expect(screen.getByRole("button", { name: /add 1 student/i })).toBeEnabled();
  });

  it("shows the create-a-student link when no candidates", () => {
    render(
      <AddStudentsDialog open onOpenChange={() => {}} classId="c1" candidates={[]} />,
    );
    expect(screen.getByText(/already in this class/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create a new student/i })).toBeInTheDocument();
  });
});
