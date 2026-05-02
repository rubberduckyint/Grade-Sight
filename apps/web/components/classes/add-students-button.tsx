"use client";
import { useState } from "react";
import { AddStudentsDialog } from "./add-students-dialog";
import type { Student } from "@/lib/types";

export function AddStudentsButton({
  classId,
  candidates,
}: {
  classId: string;
  candidates: Student[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-[var(--radius-sm)] bg-ink px-5 py-2.5 text-sm text-paper hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Add students
      </button>
      <AddStudentsDialog open={open} onOpenChange={setOpen} classId={classId} candidates={candidates} />
    </>
  );
}
