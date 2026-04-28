"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { AnswerKeyPicker } from "@/components/answer-key-picker";
import { Button } from "@/components/ui/button";
import { StudentPicker } from "@/components/student-picker";
import type { AnswerKey, Student } from "@/lib/types";
import { createAssessmentForUpload } from "@/lib/actions";
import { runWithConcurrency } from "@/lib/upload-queue";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_PAGES = 20;
const PUT_CONCURRENCY = 4;
const MAX_RETRIES = 2;

interface StagedFile {
  id: string; // local-only key for React reconciliation
  file: File;
  previewUrl: string;
}

export interface AssessmentUploadFormProps {
  initialStudents: Student[];
  initialAnswerKeys: AnswerKey[];
  userRole: "teacher" | "parent";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AssessmentUploadForm({
  initialStudents,
  initialAnswerKeys,
  userRole,
}: AssessmentUploadFormProps) {
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [answerKeyId, setAnswerKeyId] = useState<string | null>(null);
  const [alreadyGraded, setAlreadyGraded] = useState<boolean>(false);
  const [reviewAll, setReviewAll] = useState<boolean>(false);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Keep a ref in sync so the unmount cleanup can revoke the latest staged
  // list (the empty-deps cleanup closure can't see state updates).
  const stagedRef = useRef<StagedFile[]>([]);
  useEffect(() => {
    stagedRef.current = staged;
  }, [staged]);

  // Revoke all object URLs on unmount.
  useEffect(() => {
    return () => {
      stagedRef.current.forEach((s) => URL.revokeObjectURL(s.previewUrl));
    };
  }, []);

  // beforeunload guard while uploads are in flight.
  useEffect(() => {
    if (!isPending) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isPending]);

  const totalSize = useMemo(
    () => staged.reduce((sum, s) => sum + s.file.size, 0),
    [staged],
  );

  function appendFiles(incoming: FileList | File[]): void {
    setError(null);
    const list = Array.from(incoming);
    const accepted: File[] = [];
    for (const f of list) {
      if (!f.type.startsWith("image/")) {
        setError(`"${f.name}" is not an image`);
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        setError(`"${f.name}" is larger than 10 MB`);
        continue;
      }
      accepted.push(f);
    }
    if (accepted.length === 0) return;
    setStaged((prev) => {
      const merged = [...prev];
      for (const f of accepted) {
        // de-dupe by name+size+lastModified to avoid double-add of same file
        const key = `${f.name}-${f.size}-${f.lastModified}`;
        if (merged.some((s) => `${s.file.name}-${s.file.size}-${s.file.lastModified}` === key)) continue;
        merged.push({
          id: key,
          file: f,
          previewUrl: URL.createObjectURL(f),
        });
      }
      // Cap at MAX_PAGES; revoke the truncated tail's preview URLs so
      // they don't leak if the user drops more files than allowed.
      if (merged.length > MAX_PAGES) {
        setError(`Max ${MAX_PAGES} pages per assessment`);
        for (const s of merged.slice(MAX_PAGES)) {
          URL.revokeObjectURL(s.previewUrl);
        }
        merged.length = MAX_PAGES;
      }
      // Sort alphabetically by filename.
      merged.sort((a, b) => a.file.name.localeCompare(b.file.name));
      return merged;
    });
  }

  function removeStaged(id: string): void {
    setStaged((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
  }

  function handleStudentAdded(s: Student): void {
    setStudents((prev) =>
      [...prev, s].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    );
  }

  async function uploadAll(): Promise<void> {
    setError(null);
    if (!studentId) {
      setError("Pick a student");
      return;
    }
    if (staged.length === 0) {
      setError("Pick at least one file");
      return;
    }

    const intent = await createAssessmentForUpload({
      student_id: studentId,
      files: staged.map((s) => ({
        filename: s.file.name,
        content_type: s.file.type,
      })),
      answer_key_id: answerKeyId ?? undefined,
      already_graded: alreadyGraded,
      review_all: reviewAll,
    });

    // Pair each staged file with its intent by index (server preserved order).
    const pairs = staged.map((s, i) => {
      const page = intent.pages[i];
      if (!page) {
        throw new Error("Server returned fewer upload URLs than files");
      }
      return { staged: s, intent: page };
    });

    setProgress({ done: 0, total: pairs.length });

    let attempt = 0;
    let unfinished = pairs;

    while (attempt <= MAX_RETRIES && unfinished.length > 0) {
      const outcomes = await runWithConcurrency(
        unfinished,
        PUT_CONCURRENCY,
        async (pair) => {
          const res = await fetch(pair.intent.upload_url, {
            method: "PUT",
            body: pair.staged.file,
            headers: { "Content-Type": pair.staged.file.type },
          });
          if (!res.ok) {
            throw new Error(`R2 PUT failed: ${res.status}`);
          }
          setProgress((p) => p && { done: p.done + 1, total: p.total });
        },
      );

      const failed = unfinished.filter((_, i) => !outcomes[i]?.ok);
      if (failed.length === 0) {
        router.push(`/assessments/${intent.assessment_id}`);
        return;
      }
      unfinished = failed;
      attempt += 1;
    }

    setError(
      `${pairs.length - unfinished.length} of ${pairs.length} pages uploaded — please try again or remove the failing files.`,
    );
    setProgress(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    startTransition(async () => {
      try {
        await uploadAll();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setProgress(null);
      }
    });
  }

  const isTeacher = userRole === "teacher";
  const showReviewAll = answerKeyId !== null || alreadyGraded;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <StudentPicker
        students={students}
        value={studentId}
        onChange={setStudentId}
        onStudentAdded={handleStudentAdded}
      />

      {/* Teacher's primary surface: answer key picker prominent */}
      {isTeacher && (
        <div>
          <p className="mb-2 text-sm text-ink-soft font-medium">
            Answer key (recommended)
          </p>
          <AnswerKeyPicker
            keys={initialAnswerKeys}
            value={answerKeyId}
            onChange={setAnswerKeyId}
          />
        </div>
      )}

      <div>
        <label className="block text-sm text-ink-soft" htmlFor="page-files">
          Quiz pages (image, max 10 MB each, up to 20 pages)
        </label>
        <div
          className={`mt-1 rounded-[var(--radius-sm)] border-2 border-dashed p-6 text-center transition-colors ${
            isDragging ? "border-accent bg-accent-soft" : "border-rule bg-paper"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files.length > 0) {
              appendFiles(e.dataTransfer.files);
            }
          }}
        >
          <p className="text-base text-ink-soft">
            Drop quiz pages here, or
          </p>
          <label
            htmlFor="page-files"
            className="mt-2 inline-block cursor-pointer rounded-[var(--radius-sm)] border border-rule bg-paper-soft px-4 py-2 text-sm text-ink hover:bg-paper-deep focus-visible:outline-2 focus-visible:outline-accent"
          >
            click to browse
          </label>
          <input
            id="page-files"
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              if (e.target.files) appendFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {staged.length > 0 && (
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
            {staged.length} {staged.length === 1 ? "page" : "pages"} staged · {formatBytes(totalSize)}
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {staged.map((s, i) => (
              <li
                key={s.id}
                className="relative rounded-[var(--radius-sm)] border border-rule bg-paper p-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- object URL, not optimizable */}
                <img
                  src={s.previewUrl}
                  alt={s.file.name}
                  className="aspect-square w-full rounded-[var(--radius-sm)] object-cover"
                />
                <p className="mt-1 truncate text-xs text-ink">{s.file.name}</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute">
                  Page {i + 1} · {formatBytes(s.file.size)}
                </p>
                <button
                  type="button"
                  aria-label={`Remove page ${i + 1}`}
                  onClick={() => removeStaged(s.id)}
                  disabled={isPending}
                  className="absolute right-1 top-1 rounded-full bg-paper-deep px-2 py-0.5 text-xs text-ink hover:bg-mark hover:text-paper focus-visible:outline-2 focus-visible:outline-accent"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Parent's primary surface: already-graded checkbox prominent */}
      {!isTeacher && (
        <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-rule bg-paper p-4 hover:bg-paper-soft cursor-pointer">
          <input
            type="checkbox"
            checked={alreadyGraded}
            onChange={(e) => setAlreadyGraded(e.target.checked)}
            disabled={isPending}
            className="mt-1"
          />
          <div>
            <p className="text-base text-ink">
              This paper is already graded by the teacher
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              Grade-Sight will read the teacher&apos;s red marks instead of
              re-grading from scratch (faster + cheaper).
            </p>
          </div>
        </label>
      )}

      {/* Teacher's secondary surface: small checkbox */}
      {isTeacher && (
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={alreadyGraded}
            onChange={(e) => setAlreadyGraded(e.target.checked)}
            disabled={isPending}
          />
          <span>This paper is already graded by the teacher</span>
        </label>
      )}

      {/* Parent's secondary surface: small answer-key picker */}
      {!isTeacher && (
        <details className="rounded-[var(--radius-sm)] border border-rule-soft bg-paper-soft p-3">
          <summary className="cursor-pointer text-sm text-ink-soft">
            I have an answer key (optional)
          </summary>
          <div className="mt-3">
            <AnswerKeyPicker
              keys={initialAnswerKeys}
              value={answerKeyId}
              onChange={setAnswerKeyId}
            />
          </div>
        </details>
      )}

      {/* Review-all override (only when key or graded set) */}
      {showReviewAll && (
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={reviewAll}
            onChange={(e) => setReviewAll(e.target.checked)}
            disabled={isPending}
          />
          <span>
            Review all problems (default: show only the wrong ones)
          </span>
        </label>
      )}

      {progress && (
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
          Uploading {progress.done} of {progress.total}…
        </p>
      )}
      {error && (
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-mark">
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={isPending || !studentId || staged.length === 0}
      >
        {isPending
          ? `Uploading ${progress?.done ?? 0} of ${progress?.total ?? staged.length}…`
          : `Upload ${staged.length === 0 ? "assessment" : staged.length === 1 ? "1 page" : `${staged.length} pages`}`}
      </Button>
    </form>
  );
}
