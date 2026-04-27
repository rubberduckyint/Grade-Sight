"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { StudentPicker } from "@/components/student-picker";
import type { Student } from "@/lib/api";
import { createAssessmentForUpload } from "@/lib/api";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export interface AssessmentUploadFormProps {
  initialStudents: Student[];
}

export function AssessmentUploadForm({ initialStudents }: AssessmentUploadFormProps) {
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const selected = e.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_FILE_SIZE) {
      setError("File too large (max 10MB)");
      e.target.value = "";
      setFile(null);
      return;
    }
    if (selected && !selected.type.startsWith("image/")) {
      setError("Only image files supported");
      e.target.value = "";
      setFile(null);
      return;
    }
    setFile(selected);
  };

  const handleStudentAdded = (s: Student) => {
    setStudents((prev) => [...prev, s].sort((a, b) => a.full_name.localeCompare(b.full_name)));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!studentId) {
      setError("Pick a student");
      return;
    }
    if (!file) {
      setError("Pick a file");
      return;
    }
    startTransition(async () => {
      try {
        const intent = await createAssessmentForUpload({
          student_id: studentId,
          original_filename: file.name,
          content_type: file.type,
        });
        const putRes = await fetch(intent.upload_url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        if (!putRes.ok) {
          throw new Error(`R2 upload failed: ${putRes.status}`);
        }
        router.push(`/dashboard?uploaded=${intent.assessment_id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <StudentPicker
        students={students}
        value={studentId}
        onChange={setStudentId}
        onStudentAdded={handleStudentAdded}
      />
      <div>
        <label htmlFor="file" className="block text-sm text-ink-soft">
          Quiz photo (image, max 10MB)
        </label>
        <input
          id="file"
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="mt-1 block w-full text-base text-ink file:mr-3 file:rounded-[var(--radius-sm)] file:border file:border-rule file:bg-paper-soft file:px-3 file:py-2 file:text-sm file:text-ink hover:file:bg-paper-deep"
          disabled={isPending}
        />
        {file && (
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
            {file.name} · {(file.size / 1024).toFixed(0)}KB
          </p>
        )}
      </div>
      {error && (
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-mark">
          {error}
        </p>
      )}
      <Button type="submit" disabled={isPending || !studentId || !file}>
        {isPending ? "Uploading…" : "Upload assessment"}
      </Button>
    </form>
  );
}
