"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addStudentsToClass } from "@/lib/actions";
import type { Student } from "@/lib/types";

export function AddStudentsDialog({
  open,
  onOpenChange,
  classId,
  candidates,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  candidates: Student[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  function onSubmit() {
    if (selected.size === 0) return;
    startTransition(async () => {
      try {
        await addStudentsToClass(classId, Array.from(selected));
        onOpenChange(false);
        setSelected(new Set());
        router.refresh();
      } catch {
        toast.error("Couldn't add students — try again.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add students to this class</DialogTitle>
        </DialogHeader>

        {candidates.length === 0 ? (
          <p className="text-sm text-ink-soft">
            All your students are already in this class.{" "}
            <Link href="/students" className="text-accent underline">Create a new student</Link>
            {" "}to add them here.
          </p>
        ) : (
          <ul className="max-h-[320px] overflow-y-auto divide-y divide-rule-soft border-y border-rule-soft">
            {candidates.map((s) => (
              <li key={s.id}>
                <label className="flex items-baseline gap-3 py-3 hover:bg-paper-soft -mx-2 px-2 rounded-[var(--radius-sm)]">
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                    aria-label={s.full_name}
                  />
                  <span className="text-base text-ink">{s.full_name}</span>
                  {s.grade_level != null && (
                    <span className="ml-auto font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
                      Grade {s.grade_level}
                    </span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}

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
            disabled={selected.size === 0 || pending}
            onClick={onSubmit}
            className="rounded-[var(--radius-sm)] bg-ink px-4 py-2 text-sm text-paper disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Adding…" : `Add ${selected.size} ${selected.size === 1 ? "student" : "students"}`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
