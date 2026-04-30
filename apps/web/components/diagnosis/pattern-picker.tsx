"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ErrorPattern } from "@/lib/types";

export function PatternPicker({
  value,
  onChange,
  patterns,
  disabled = false,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  patterns: ErrorPattern[];
  disabled?: boolean;
}) {
  // Group patterns by category_slug, preserving the API's ordering
  const grouped = new Map<string, { categoryName: string; items: ErrorPattern[] }>();
  for (const p of patterns) {
    const bucket = grouped.get(p.category_slug);
    if (bucket) {
      bucket.items.push(p);
    } else {
      grouped.set(p.category_slug, { categoryName: p.category_name, items: [p] });
    }
  }

  return (
    <Select
      value={value ?? ""}
      onValueChange={(next) => onChange(next === "" ? null : next)}
      disabled={disabled}
    >
      <SelectTrigger
        className="font-sans text-sm border-rule rounded-[var(--radius-sm)]"
        aria-label="Select error pattern"
      >
        <SelectValue placeholder={disabled ? "Marked correct — no pattern" : "Choose a pattern…"} />
      </SelectTrigger>
      <SelectContent>
        {Array.from(grouped.entries()).map(([slug, group]) => (
          <SelectGroup key={slug}>
            <SelectLabel className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
              {group.categoryName}
            </SelectLabel>
            {group.items.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
