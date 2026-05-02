"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AddKeyDialog } from "./add-key-dialog";

export function AddKeyCard() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex aspect-[3/2] flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border-2 border-dashed border-rule bg-paper p-8 text-center hover:bg-paper-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span className="font-serif text-lg text-ink">+ Add answer key</span>
        <span className="text-sm text-ink-soft max-w-[200px]">Photo, PDF, or type answers in.</span>
      </button>
      <AddKeyDialog
        open={open}
        onOpenChange={setOpen}
        onAfterCreate={() => router.refresh()}
      />
    </>
  );
}
