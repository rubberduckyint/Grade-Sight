"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { AnswerKey } from "@/lib/types";
import { createAnswerKeyForUpload } from "@/lib/actions";
import { runWithConcurrency } from "@/lib/upload-queue";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_PAGES = 20;
const PUT_CONCURRENCY = 4;
const MAX_RETRIES = 2;

interface StagedFile {
  id: string;
  file: File;
  previewUrl: string;
}

export interface AnswerKeyUploadFormProps {
  onCreated: (key: AnswerKey) => void;
  onCancel?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AnswerKeyUploadForm({
  onCreated,
  onCancel,
}: AnswerKeyUploadFormProps) {
  const [name, setName] = useState("");
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();

  const stagedRef = useRef<StagedFile[]>([]);
  useEffect(() => {
    stagedRef.current = staged;
  }, [staged]);

  useEffect(() => {
    return () => {
      stagedRef.current.forEach((s) => URL.revokeObjectURL(s.previewUrl));
    };
  }, []);

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
        const key = `${f.name}-${f.size}-${f.lastModified}`;
        if (
          merged.some(
            (s) => `${s.file.name}-${s.file.size}-${s.file.lastModified}` === key,
          )
        )
          continue;
        merged.push({
          id: key,
          file: f,
          previewUrl: URL.createObjectURL(f),
        });
      }
      if (merged.length > MAX_PAGES) {
        setError(`Max ${MAX_PAGES} pages per answer key`);
        for (const s of merged.slice(MAX_PAGES)) URL.revokeObjectURL(s.previewUrl);
        merged.length = MAX_PAGES;
      }
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

  async function uploadAll(): Promise<void> {
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (staged.length === 0) {
      setError("Pick at least one file");
      return;
    }

    const intent = await createAnswerKeyForUpload({
      name: name.trim(),
      files: staged.map((s) => ({
        filename: s.file.name,
        content_type: s.file.type,
      })),
    });

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
          // TODO(spec-cleanup): R2 PUT failure leaves orphan key — pending detector spec
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
        // Notify parent picker so the new key can be auto-selected.
        onCreated({
          id: intent.answer_key_id,
          name: name.trim(),
          page_count: pairs.length,
          first_page_thumbnail_url: pairs[0]?.staged.previewUrl ?? "",
          created_at: new Date().toISOString(),
        });
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

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[var(--radius-sm)] border border-rule bg-paper-soft p-6 space-y-5"
    >
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
        Uploading an answer key noticeably improves grading accuracy.
        Recommended whenever you have one.
      </p>

      <div>
        <label
          htmlFor="answer-key-name"
          className="block text-sm text-ink-soft"
        >
          Answer key name
        </label>
        <input
          id="answer-key-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Algebra 1 Chapter 7 Quiz Key"
          className="mt-1 w-full rounded-[var(--radius-sm)] border border-rule bg-paper px-3 py-2 text-base text-ink focus-visible:outline-2 focus-visible:outline-accent"
          disabled={isPending}
          required
        />
      </div>

      <div>
        <label className="block text-sm text-ink-soft" htmlFor="key-files">
          Key pages (image, max 10 MB each, up to 20 pages)
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
          <p className="text-base text-ink-soft">Drop key pages here, or</p>
          <label
            htmlFor="key-files"
            className="mt-2 inline-block cursor-pointer rounded-[var(--radius-sm)] border border-rule bg-paper-soft px-4 py-2 text-sm text-ink hover:bg-paper-deep focus-visible:outline-2 focus-visible:outline-accent"
          >
            click to browse
          </label>
          <input
            id="key-files"
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
          <ul className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-4">
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

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={isPending || staged.length === 0 || !name.trim()}
        >
          {isPending
            ? `Uploading ${progress?.done ?? 0} of ${progress?.total ?? staged.length}…`
            : `Save answer key (${staged.length} ${staged.length === 1 ? "page" : "pages"})`}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isPending}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
