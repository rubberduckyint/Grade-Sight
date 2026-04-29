// LongitudinalMini — landing illustration: bar chart of pattern
// resolution across 6 assessments. "Resolving" / "Resolved" rows use
// ink bars (good); "Recurring" / "New" use mark bars. Ported from
// docs/design/dir-editorial.jsx.

import { cn } from "@/lib/utils";

type Row = {
  label: string;
  points: number[];
  note: "Resolving" | "Recurring" | "Resolved" | "New";
  good?: boolean;
};

const rows: Row[] = [
  {
    label: "Sign errors when distributing",
    points: [3, 2, 2, 1, 1, 0],
    note: "Resolving",
    good: true,
  },
  {
    label: "Skipped verification step",
    points: [1, 2, 2, 2, 1, 2],
    note: "Recurring",
  },
  {
    label: "Factoring quadratics",
    points: [2, 1, 0, 0, 0, 0],
    note: "Resolved",
    good: true,
  },
  {
    label: "Combining like terms",
    points: [0, 0, 1, 1, 0, 1],
    note: "New",
  },
];

export function LongitudinalMini() {
  return (
    <div className="rounded-[var(--radius-sm)] border border-rule bg-paper px-7 py-5">
      <div className="mb-4 flex justify-between font-mono text-xs uppercase tracking-[0.08em] text-ink-mute">
        <span>Patterns · last 6 assessments</span>
        <span>Algebra II</span>
      </div>
      {rows.map((r) => {
        const noteColor =
          r.good
            ? "text-accent"
            : r.note === "Recurring"
              ? "text-mark"
              : "text-ink-mute";
        return (
          <div
            key={r.label}
            className="grid grid-cols-[1fr_160px_80px] items-center gap-4 border-t border-rule-soft py-3.5"
          >
            <div className="font-serif text-base text-ink">{r.label}</div>
            <div className="flex h-7 items-end gap-1.5">
              {r.points.map((p, i) => (
                <div
                  key={i}
                  className={cn("flex-1", r.good ? "bg-ink" : "bg-mark")}
                  style={{
                    height: Math.max(2, p * 8),
                    opacity: r.good
                      ? 0.25 + (i / r.points.length) * 0.5
                      : 0.35 + (p / 3) * 0.5,
                  }}
                />
              ))}
            </div>
            <div
              className={cn(
                "text-right font-mono text-xs uppercase tracking-[0.06em]",
                noteColor,
              )}
            >
              {r.note}
            </div>
          </div>
        );
      })}
    </div>
  );
}
