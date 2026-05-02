// apps/web/components/privacy/delete-account-dialog.tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteSelf } from "@/lib/actions";

export function DeleteAccountDialog({
  open,
  onOpenChange,
  email,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
}) {
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { signOut } = useClerk();

  const matches = typed.trim().toLowerCase() === email.trim().toLowerCase();

  function onConfirm() {
    startTransition(async () => {
      try {
        await deleteSelf();
        await signOut();
        router.push("/account-deleted");
      } catch {
        toast.error("Couldn't delete the account — try again.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete account &amp; all data</DialogTitle>
        </DialogHeader>
        <p className="mb-4 text-sm text-ink-soft">
          This is permanent after a 30-day grace window. To confirm, type your
          email address.
        </p>
        <input
          aria-label="Type your email to confirm"
          type="email"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={email}
          className="w-full rounded-[var(--radius-sm)] border border-rule px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-[var(--radius-sm)] border border-rule px-4 py-2 text-sm text-ink-soft hover:bg-paper-soft"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!matches || pending}
            onClick={onConfirm}
            className="rounded-[var(--radius-sm)] bg-mark px-4 py-2 text-sm text-paper disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
