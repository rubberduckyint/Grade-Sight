"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { AnswerKeyUploadForm } from "@/components/answer-key-upload-form";
import type { AnswerKey } from "@/lib/types";
import { deleteAnswerKey } from "@/lib/actions";

export interface AnswerKeyPickerProps {
  keys: AnswerKey[];
  value: string | null;
  onChange: (id: string | null) => void;
}

export function AnswerKeyPicker({
  keys: initialKeys,
  value,
  onChange,
}: AnswerKeyPickerProps) {
  // Optimistic keys are those just created locally and not yet present
  // in server-fetched initialKeys. We keep them around (state never
  // shrinks here) but only display the ones that aren't yet superseded
  // by an initialKeys entry. Cleanup of the blob: URL happens in an
  // effect when initialKeys catches up.
  const [optimisticKeys, setOptimisticKeys] = useState<AnswerKey[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  // When initialKeys catches up to an optimistic entry, revoke its
  // blob: placeholder URL. We don't setState here (forbidden by lint);
  // the optimistic entry is filtered out of `keys` derivation below.
  useEffect(() => {
    for (const o of optimisticKeys) {
      if (!o.first_page_thumbnail_url.startsWith("blob:")) continue;
      const replaced = initialKeys.find((k) => k.id === o.id);
      if (replaced) {
        URL.revokeObjectURL(o.first_page_thumbnail_url);
      }
    }
  }, [initialKeys, optimisticKeys]);

  const pendingOptimistic = optimisticKeys.filter(
    (o) => !initialKeys.some((k) => k.id === o.id),
  );
  const keys =
    pendingOptimistic.length === 0
      ? initialKeys
      : [...pendingOptimistic, ...initialKeys];

  const filtered = keys.filter((k) =>
    k.name.toLowerCase().includes(query.toLowerCase().trim()),
  );

  const selected = keys.find((k) => k.id === value) ?? null;

  function handleCreated(newKey: AnswerKey): void {
    // Optimistic: show the new key immediately with the placeholder
    // blob URL the form handed us (looks instant to the user).
    setOptimisticKeys((prev) => [newKey, ...prev]);
    onChange(newKey.id);
    setIsAdding(false);
    // Trigger a server refresh so the parent server component re-fetches
    // answer keys with real R2 thumbnail URLs. The effect above will
    // then drop our optimistic entry and revoke the blob: URL.
    router.refresh();
  }

  function handleDelete(id: string): void {
    if (!window.confirm("Delete this answer key? This cannot be undone.")) {
      return;
    }
    setDeletingId(id);
    startTransition(async () => {
      try {
        await deleteAnswerKey(id);
        // Drop any optimistic copy with this id, and revoke its blob URL.
        setOptimisticKeys((prev) => {
          const removed = prev.find((k) => k.id === id);
          if (removed && removed.first_page_thumbnail_url.startsWith("blob:")) {
            URL.revokeObjectURL(removed.first_page_thumbnail_url);
          }
          return prev.filter((k) => k.id !== id);
        });
        if (value === id) {
          onChange(null);
        }
        // Refresh server-fetched keys so the deleted one disappears.
        router.refresh();
      } catch {
        window.alert("Could not delete — please try again.");
      } finally {
        setDeletingId(null);
      }
    });
  }

  return (
    <div>
      {selected ? (
        <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-rule bg-paper p-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- presigned URL */}
            <img
              src={selected.first_page_thumbnail_url}
              alt={`First page of ${selected.name}`}
              className="size-12 shrink-0 rounded-[var(--radius-sm)] border border-rule-soft object-cover"
            />
            <div>
              <p className="text-base text-ink">{selected.name}</p>
              <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
                {selected.page_count}{" "}
                {selected.page_count === 1 ? "page" : "pages"} · selected
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(null)}
          >
            Change
          </Button>
        </div>
      ) : (
        <p className="text-sm text-ink-mute">
          (none — recommended for accuracy)
        </p>
      )}

      <div className="mt-3 space-y-2">
        {!selected && keys.length > 0 && !isAdding && (
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search answer keys…"
            className="w-full rounded-[var(--radius-sm)] border border-rule bg-paper px-3 py-2 text-base text-ink focus-visible:outline-2 focus-visible:outline-accent"
          />
        )}
        {!selected && filtered.length > 0 && !isAdding && (
          <ul className="divide-y divide-rule-soft rounded-[var(--radius-sm)] border border-rule">
            {filtered.map((k) => (
              <li
                key={k.id}
                className="flex items-center gap-3 px-3 py-2 hover:bg-paper-soft"
              >
                <button
                  type="button"
                  onClick={() => onChange(k.id)}
                  className="flex flex-1 items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- presigned URL */}
                  <img
                    src={k.first_page_thumbnail_url}
                    alt={`First page of ${k.name}`}
                    className="size-12 shrink-0 rounded-[var(--radius-sm)] border border-rule-soft object-cover"
                  />
                  <div>
                    <p className="text-base text-ink">{k.name}</p>
                    <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
                      {k.page_count}{" "}
                      {k.page_count === 1 ? "page" : "pages"}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${k.name}`}
                  onClick={() => handleDelete(k.id)}
                  disabled={deletingId === k.id}
                  className="rounded-full bg-paper-deep px-2 py-0.5 text-xs text-ink hover:bg-mark hover:text-paper focus-visible:outline-2 focus-visible:outline-accent"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {isAdding ? (
          <AnswerKeyUploadForm
            onCreated={handleCreated}
            onCancel={() => setIsAdding(false)}
          />
        ) : (
          !selected && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsAdding(true)}
            >
              + Upload new key
            </Button>
          )
        )}
      </div>
    </div>
  );
}
