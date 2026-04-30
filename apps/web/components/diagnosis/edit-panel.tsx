"use client";

import { useState } from "react";

import { PatternPicker } from "@/components/diagnosis/pattern-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { ErrorPattern } from "@/lib/types";

export interface EditPanelProps {
  initialPatternId: string | null;
  initialMarkedCorrect: boolean;
  patterns: ErrorPattern[];
  hasExistingReview: boolean;
  isSaving: boolean;
  onSave: (state: { override_pattern_id: string | null; marked_correct: boolean }) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function EditPanel({
  initialPatternId,
  initialMarkedCorrect,
  patterns,
  hasExistingReview,
  isSaving,
  onSave,
  onCancel,
  onDelete,
}: EditPanelProps) {
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(initialPatternId);
  const [markedCorrect, setMarkedCorrect] = useState(initialMarkedCorrect);

  const canSave =
    !isSaving &&
    !(selectedPatternId === null && !markedCorrect) &&
    !(selectedPatternId !== null && markedCorrect);

  return (
    <div className="border-l-[2px] border-l-accent pl-4 py-1">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">
        Editing this diagnosis
      </p>

      <div className="mt-3">
        <p className="font-mono text-xs text-ink-mute mb-1">Pattern:</p>
        <PatternPicker
          value={selectedPatternId}
          onChange={setSelectedPatternId}
          patterns={patterns}
          disabled={markedCorrect || isSaving}
        />
      </div>

      <label className="flex gap-2 items-center mt-3 text-sm text-ink-soft cursor-pointer">
        <Checkbox
          checked={markedCorrect}
          onCheckedChange={(checked) => {
            const next = checked === true;
            setMarkedCorrect(next);
            if (next) setSelectedPatternId(null);
          }}
          disabled={isSaving}
          aria-label="Mark this problem as actually correct"
        />
        Mark as actually correct
      </label>

      <div className="flex gap-2 mt-4">
        <Button
          type="button"
          size="sm"
          onClick={() =>
            onSave({
              override_pattern_id: markedCorrect ? null : selectedPatternId,
              marked_correct: markedCorrect,
            })
          }
          disabled={!canSave}
        >
          {isSaving ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        {hasExistingReview && onDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={isSaving}
            className="text-ink-mute hover:text-mark"
          >
            Delete
          </Button>
        ) : null}
      </div>
    </div>
  );
}
