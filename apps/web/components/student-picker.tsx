"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { Student } from "@/lib/types";
import { createStudent } from "@/lib/actions";

const GRADE_OPTIONS = [5, 6, 7, 8, 9, 10, 11, 12] as const;

export interface StudentPickerProps {
  students: Student[];
  value: string | null;
  onChange: (studentId: string) => void;
  onStudentAdded: (student: Student) => void;
}

export function StudentPicker({
  students,
  value,
  onChange,
  onStudentAdded,
}: StudentPickerProps) {
  const [query, setQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGrade, setNewGrade] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const filtered = students.filter((s) =>
    s.full_name.toLowerCase().includes(query.toLowerCase().trim()),
  );

  const handleCreate = async () => {
    setError(null);
    if (!newName.trim()) {
      setError("Name is required");
      return;
    }
    if (!newGrade) {
      setError("Grade is required");
      return;
    }
    setIsPending(true);
    try {
      const created = await createStudent({
        full_name: newName.trim(),
        grade_level: Number(newGrade),
      });
      onStudentAdded(created);
      onChange(created.id);
      setIsAdding(false);
      setNewName("");
      setNewGrade("");
      setQuery("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add student");
    } finally {
      setIsPending(false);
    }
  };

  if (isAdding) {
    return (
      <div className="rounded-[var(--radius-sm)] border border-rule bg-paper-soft p-4">
        <div className="space-y-3">
          <div>
            <label htmlFor="new_student_name" className="block text-sm text-ink-soft">
              New student name
            </label>
            <input
              id="new_student_name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mt-1 w-full rounded-[var(--radius-sm)] border border-rule bg-paper px-3 py-2 text-base text-ink focus-visible:outline-2 focus-visible:outline-accent"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="new_student_grade" className="block text-sm text-ink-soft">
              Grade <span className="text-mark">*</span>
            </label>
            <select
              id="new_student_grade"
              value={newGrade}
              onChange={(e) => setNewGrade(e.target.value)}
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
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.12em] text-mark">
            {error}
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <Button onClick={handleCreate} disabled={isPending} size="sm">
            {isPending ? "Adding…" : "Add and select"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsAdding(false);
              setNewName("");
              setNewGrade("");
              setError(null);
            }}
            disabled={isPending}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="student_search" className="block text-sm text-ink-soft">
        Student
      </label>
      <input
        id="student_search"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search students…"
        className="mt-1 w-full rounded-[var(--radius-sm)] border border-rule bg-paper px-3 py-2 text-base text-ink focus-visible:outline-2 focus-visible:outline-accent"
      />
      <div className="mt-2 max-h-60 overflow-y-auto rounded-[var(--radius-sm)] border border-rule">
        {filtered.length === 0 && (
          <div className="px-3 py-2 text-sm text-ink-mute">
            No matches.
          </div>
        )}
        {filtered.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            aria-pressed={value === s.id}
            className={`block w-full px-3 py-2 text-left text-base hover:bg-paper-soft ${
              value === s.id ? "bg-accent-soft text-ink" : "text-ink"
            }`}
          >
            {s.full_name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="block w-full border-t border-rule-soft px-3 py-2 text-left text-base text-accent hover:bg-paper-soft"
        >
          + Add new student
        </button>
      </div>
    </div>
  );
}
