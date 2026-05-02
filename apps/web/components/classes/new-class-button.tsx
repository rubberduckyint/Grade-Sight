"use client";
import { useState } from "react";
import { ClassFormDialog } from "./class-form-dialog";

export function NewClassButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-[var(--radius-sm)] bg-ink px-5 py-2.5 text-sm text-paper hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        New class
      </button>
      <ClassFormDialog open={open} onOpenChange={setOpen} mode="create" />
    </>
  );
}
