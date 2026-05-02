import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { DeleteAccountDialog } from "./delete-account-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mockSignOut = vi.fn();
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut: mockSignOut }),
}));

const mockDeleteSelf = vi.fn();
vi.mock("@/lib/actions", () => ({
  deleteSelf: () => mockDeleteSelf(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("DeleteAccountDialog", () => {
  beforeEach(() => {
    mockDeleteSelf.mockReset();
    mockSignOut.mockReset();
  });

  it("disables confirm until typed email matches", async () => {
    render(<DeleteAccountDialog open onOpenChange={() => {}} email="parent@test.local" />);
    const confirm = screen.getByRole("button", { name: /delete permanently/i });
    expect(confirm).toBeDisabled();

    const input = screen.getByLabelText(/type your email to confirm/i);
    await userEvent.type(input, "wrong@test.local");
    expect(confirm).toBeDisabled();
  });

  it("enables confirm on exact case-insensitive match", async () => {
    render(<DeleteAccountDialog open onOpenChange={() => {}} email="Parent@Test.Local" />);
    const input = screen.getByLabelText(/type your email to confirm/i);
    await userEvent.type(input, "parent@test.local");
    expect(screen.getByRole("button", { name: /delete permanently/i })).toBeEnabled();
  });

  it("calls deleteSelf and signOut when confirm is clicked", async () => {
    mockDeleteSelf.mockResolvedValue(undefined);
    mockSignOut.mockResolvedValue(undefined);
    render(<DeleteAccountDialog open onOpenChange={() => {}} email="x@y.z" />);
    await userEvent.type(screen.getByLabelText(/type your email to confirm/i), "x@y.z");
    await userEvent.click(screen.getByRole("button", { name: /delete permanently/i }));
    expect(mockDeleteSelf).toHaveBeenCalledOnce();
  });
});
