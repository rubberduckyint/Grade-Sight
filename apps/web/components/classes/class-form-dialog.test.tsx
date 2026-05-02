import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { ClassFormDialog } from "./class-form-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
vi.mock("@/lib/actions", () => ({
  createClass: (...args: unknown[]) => mockCreate(...args),
  updateClass: (...args: unknown[]) => mockUpdate(...args),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Radix UI Select uses a Portal that doesn't render in jsdom.
// Replace the whole module with a simple native <select> wrapper that
// mirrors the onValueChange contract so the parent state logic is exercised.
import React from "react";

vi.mock("@/components/ui/select", async () => {
  function Select({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    children?: React.ReactNode;
  }) {
    return (
      <div data-testid="select-root">
        <select
          aria-label="subject-select"
          value={value ?? ""}
          onChange={(e) => onValueChange?.(e.target.value)}
        >
          {children}
        </select>
      </div>
    );
  }

  function SelectTrigger() {
    return null;
  }

  function SelectValue() {
    return null;
  }

  function SelectContent({ children }: { children?: React.ReactNode }) {
    return <>{children}</>;
  }

  function SelectItem({ value, children }: { value: string; children?: React.ReactNode }) {
    return <option value={value}>{children}</option>;
  }

  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

describe("ClassFormDialog", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockUpdate.mockReset();
  });

  it("disables submit until name has content", async () => {
    render(<ClassFormDialog open onOpenChange={() => {}} mode="create" />);
    const submit = screen.getByRole("button", { name: /create class/i });
    expect(submit).toBeDisabled();

    const nameInput = screen.getByPlaceholderText(/4th period/i);
    await userEvent.type(nameInput, "Period 4");
    expect(submit).toBeEnabled();
  });

  it("reveals custom subject input when 'Other…' is selected and gates submit on it", async () => {
    render(<ClassFormDialog open onOpenChange={() => {}} mode="create" />);
    await userEvent.type(screen.getByPlaceholderText(/4th period/i), "Period 4");

    // Select "Other…" via the native <select> that our mock renders
    const subjectSelect = screen.getByRole("combobox", { name: /subject-select/i });
    await userEvent.selectOptions(subjectSelect, "Other…");

    // Custom subject input appears, but is empty → submit disabled
    const customInput = screen.getByLabelText(/custom subject/i);
    expect(customInput).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: /create class/i });
    expect(submit).toBeDisabled();

    await userEvent.type(customInput, "Algebra Zero");
    expect(submit).toBeEnabled();
  });

  it("calls createClass with the form values", async () => {
    mockCreate.mockResolvedValue({ id: "new-id" });
    render(<ClassFormDialog open onOpenChange={() => {}} mode="create" />);
    await userEvent.type(screen.getByPlaceholderText(/4th period/i), "Period 4");
    await userEvent.click(screen.getByRole("button", { name: /create class/i }));

    expect(mockCreate).toHaveBeenCalledWith({
      name: "Period 4",
      subject: null,
      grade_level: null,
    });
  });

  it("pre-fills fields in edit mode", () => {
    render(
      <ClassFormDialog
        open
        onOpenChange={() => {}}
        mode="edit"
        initial={{
          id: "existing",
          name: "Old name",
          subject: "Algebra 1",
          grade_level: "9",
          archived: false,
          student_count: 2,
          created_at: "2026-04-01T00:00:00Z",
        }}
      />,
    );
    expect(screen.getByDisplayValue("Old name")).toBeInTheDocument();
    expect(screen.getByDisplayValue("9")).toBeInTheDocument();
  });
});
