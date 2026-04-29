"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createStudent } from "@/lib/actions";

const GRADE_OPTIONS = [5, 6, 7, 8, 9, 10, 11, 12] as const;

export function AddStudentForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [grade, setGrade] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) {
      setError("Name is required");
      return;
    }
    if (!grade) {
      setError("Grade is required");
      return;
    }
    startTransition(async () => {
      try {
        await createStudent({
          full_name: fullName.trim(),
          grade_level: Number(grade),
        });
        setFullName("");
        setGrade("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add student");
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[var(--radius-sm)] border border-rule bg-paper p-6"
    >
      <h3 className="font-serif text-xl text-ink">Add a student</h3>
      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="full_name" className="block text-sm text-ink-soft">
            Full name <span className="text-mark">*</span>
          </label>
          <input
            id="full_name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-rule bg-paper px-3 py-2 text-base text-ink focus-visible:outline-2 focus-visible:outline-accent"
            disabled={isPending}
            required
          />
        </div>
        <div>
          <label htmlFor="grade" className="block text-sm text-ink-soft">
            Grade <span className="text-mark">*</span>
          </label>
          <select
            id="grade"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-rule bg-paper px-3 py-2 text-base text-ink focus-visible:outline-2 focus-visible:outline-accent"
            disabled={isPending}
            required
          >
            <option value="" disabled>
              Select Grade
            </option>
            {GRADE_OPTIONS.map((g) => (
              <option key={g} value={String(g)}>
                {g}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <p className="mt-3 font-mono text-xs uppercase tracking-[0.12em] text-mark">
          {error}
        </p>
      )}
      <div className="mt-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adding…" : "Add student"}
        </Button>
      </div>
    </form>
  );
}
