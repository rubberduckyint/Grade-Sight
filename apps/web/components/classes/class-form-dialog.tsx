"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClass, updateClass } from "@/lib/actions";
import type { Klass } from "@/lib/types";

const SUBJECT_OPTIONS = [
  "Pre-Algebra", "Algebra 1", "Geometry", "Algebra 2",
  "Pre-Calculus", "Calculus", "Statistics", "Other…",
] as const;

export function ClassFormDialog({
  open,
  onOpenChange,
  mode,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initial?: Klass;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [isCustom, setIsCustom] = useState(
    initial?.subject != null && !(SUBJECT_OPTIONS as readonly string[]).includes(initial.subject),
  );
  const [gradeLevel, setGradeLevel] = useState(initial?.grade_level ?? "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const trimmedName = name.trim();
  const trimmedSubject = subject.trim();
  const subjectInvalid = isCustom && trimmedSubject === "";
  const canSubmit = trimmedName !== "" && !subjectInvalid;

  function onSubmit() {
    if (!canSubmit) return;
    startTransition(async () => {
      try {
        const payload = {
          name: trimmedName,
          subject: trimmedSubject || null,
          grade_level: gradeLevel.trim() || null,
        };
        if (mode === "create") {
          const created = await createClass(payload);
          onOpenChange(false);
          router.push(`/classes/${created.id}`);
        } else if (initial) {
          await updateClass(initial.id, payload);
          onOpenChange(false);
          router.refresh();
        }
      } catch {
        toast.error("Couldn't save the class — try again.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New class" : "Edit class"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., 4th period"
              className="rounded-[var(--radius-sm)] border border-rule px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">Subject (optional)</span>
            <Select
              value={isCustom ? "Other…" : (subject || undefined)}
              onValueChange={(v) => {
                if (v === "Other…") {
                  setIsCustom(true);
                  setSubject("");
                } else {
                  setIsCustom(false);
                  setSubject(v);
                }
              }}
            >
              <SelectTrigger><SelectValue placeholder="Pick a subject" /></SelectTrigger>
              <SelectContent>
                {SUBJECT_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isCustom && (
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., Algebra Zero Period"
                aria-label="Custom subject"
                className="mt-2 rounded-[var(--radius-sm)] border border-rule px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
            )}
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">Grade level (optional)</span>
            <input
              type="text"
              value={gradeLevel}
              onChange={(e) => setGradeLevel(e.target.value)}
              placeholder="e.g., 9"
              className="rounded-[var(--radius-sm)] border border-rule px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </label>
        </div>

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
            disabled={!canSubmit || pending}
            onClick={onSubmit}
            className="rounded-[var(--radius-sm)] bg-ink px-4 py-2 text-sm text-paper disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Saving…" : mode === "create" ? "Create class" : "Save changes"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
