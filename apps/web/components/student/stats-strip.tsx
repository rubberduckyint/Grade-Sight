import type { BiographyStats } from "@/lib/types";

export function StatsStrip({ stats, weeksInWindow }: { stats: BiographyStats; weeksInWindow: number }) {
  const cells = [
    {
      eyebrow: "Assessments",
      headline: stats.assessments_count.toString(),
      sub: `in the last ${weeksInWindow} weeks`,
    },
    {
      eyebrow: "Avg score",
      headline: stats.average_score_percent !== null ? `${stats.average_score_percent}%` : "—",
      sub: stats.assessments_count
        ? `across ${stats.assessments_count} assessment${stats.assessments_count === 1 ? "" : "s"}`
        : "no assessments",
    },
    {
      eyebrow: "Problems reviewed",
      headline: stats.problems_reviewed.toString(),
      sub: `${stats.problems_missed} missed`,
    },
    {
      eyebrow: "Patterns detected",
      headline: stats.patterns_detected.toString(),
      sub: `${stats.recurring_count} recurring`,
    },
  ];

  return (
    <section
      aria-label="Stats"
      className="grid grid-cols-4 border border-rule rounded-[var(--radius-md)] bg-paper"
    >
      {cells.map((c, i) => (
        <div
          key={c.eyebrow}
          className={`px-6 py-5 ${i > 0 ? "border-l border-rule-soft" : ""}`}
        >
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
            {c.eyebrow}
          </p>
          <p className="font-serif text-2xl text-ink mt-2">{c.headline}</p>
          <p className="font-sans text-sm text-ink-mute mt-1">{c.sub}</p>
        </div>
      ))}
    </section>
  );
}
