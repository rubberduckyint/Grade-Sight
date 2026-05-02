"use client";
import { useState } from "react";
import { ClassFormDialog } from "./class-form-dialog";
import type { Klass } from "@/lib/types";

export function EditClassButton({ klass }: { klass: Klass }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-[var(--radius-sm)] border border-rule px-4 py-2 text-sm text-ink-soft hover:bg-paper-soft"
      >
        Edit
      </button>
      <ClassFormDialog open={open} onOpenChange={setOpen} mode="edit" initial={klass} />
    </>
  );
}
