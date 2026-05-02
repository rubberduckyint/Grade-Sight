// apps/web/components/privacy/delete-account-button.tsx
"use client";
import { useState } from "react";

import { DeleteAccountDialog } from "./delete-account-dialog";

export function DeleteAccountButton({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-[var(--radius-sm)] border border-mark px-5 py-2.5 font-sans text-sm text-mark hover:bg-mark hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mark"
      >
        Delete account &amp; all data
      </button>
      <DeleteAccountDialog open={open} onOpenChange={setOpen} email={email} />
    </>
  );
}
