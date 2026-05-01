import type { PatternTimelineRow, WeekBucket } from "@/lib/types";

const TREND_COLORS: Record<PatternTimelineRow["trend"], { dot: string; chip: string }> = {
  recurring: { dot: "bg-accent", chip: "text-accent" },
  new: { dot: "bg-insight", chip: "text-insight" },
  fading: { dot: "bg-ink-mute", chip: "text-ink-mute" },
  one_off: { dot: "bg-ink-mute", chip: "text-ink-mute" },
};

const TREND_LABELS: Record<PatternTimelineRow["trend"], string> = {
  recurring: "Recurring",
  new: "New this week",
  fading: "Fading",
  one_off: "One-off",
};

function dotSizeClass(count: number): string {
  if (count === 0) return "w-1.5 h-1.5";
  if (count === 1) return "w-2.5 h-2.5";
  if (count === 2) return "w-4 h-4";
  return "w-5 h-5";
}

function dotColorClass(count: number, trend: PatternTimelineRow["trend"]): string {
  if (count === 0) return "bg-rule-soft";
  return TREND_COLORS[trend].dot;
}

export function PatternTimeline({
  rows,
  weeks,
}: {
  rows: PatternTimelineRow[];
  weeks: string[];
}) {
  if (rows.length === 0) {
    return (
      <section>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
          Patterns over time
        </p>
        <p className="mt-3 font-serif text-base text-ink-soft">
          No patterns yet — keep uploading quizzes and we&apos;ll start spotting recurring themes.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="flex justify-between items-baseline">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
            Patterns over time · last {weeks.length} weeks
          </p>
          <p className="mt-2 font-serif text-2xl text-ink tracking-[-0.014em]">
            Where points have been going.
          </p>
        </div>
      </div>

      <div className="mt-5 border border-rule rounded-[var(--radius-md)] bg-paper overflow-hidden">
        <div className="grid grid-cols-[280px_1fr_70px_120px] gap-3 px-6 py-3 bg-paper-soft border-b border-rule-soft items-baseline">
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">Pattern</p>
          <div
            className="grid font-mono text-xs uppercase tracking-[0.06em] text-ink-mute text-center"
            style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}
          >
            {weeks.map((iso) => (
              <div key={iso}>
                {new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </div>
            ))}
          </div>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute text-right">Total</p>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">Trend</p>
        </div>

        {rows.map((row) => (
          <div
            key={row.slug}
            className="grid grid-cols-[280px_1fr_70px_120px] gap-3 px-6 py-5 items-center border-t border-rule-soft first:border-t-0"
          >
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
                {row.category_name}
              </p>
              <p className="font-serif text-lg text-ink mt-1 leading-tight">{row.name}</p>
            </div>
            <div
              className="grid items-center justify-items-center"
              style={{ gridTemplateColumns: `repeat(${row.weeks.length}, 1fr)` }}
              aria-label={`${row.name} weekly counts`}
            >
              {row.weeks.map((w: WeekBucket) => (
                <span
                  key={w.week_start}
                  className={`rounded-full ${dotSizeClass(w.count)} ${dotColorClass(w.count, row.trend)}`}
                  aria-label={`${w.label}: ${w.count}`}
                />
              ))}
            </div>
            <p className="font-serif text-lg text-ink text-right">
              {row.total_count}
              <span className="text-ink-mute text-sm">×</span>
            </p>
            <p
              className={`font-mono text-xs uppercase tracking-[0.12em] ${TREND_COLORS[row.trend].chip}`}
            >
              {TREND_LABELS[row.trend]}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
