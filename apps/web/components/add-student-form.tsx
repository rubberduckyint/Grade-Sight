"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createStudent } from "@/lib/api";

export function AddStudentForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) {
      setError("Name is required");
      return;
    }
    startTransition(async () => {
      try {
        await createStudent({
          full_name: fullName.trim(),
          date_of_birth: dob || undefined,
        });
        setFullName("");
        setDob("");
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
          <label htmlFor="dob" className="block text-sm text-ink-soft">
            Date of birth (optional)
          </label>
          <input
            id="dob"
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-rule bg-paper px-3 py-2 text-base text-ink focus-visible:outline-2 focus-visible:outline-accent"
            disabled={isPending}
          />
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
