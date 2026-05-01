import Link from "next/link";

import type { Role } from "@/lib/diagnosis-sentence";
import type { RecentAssessmentRow } from "@/lib/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function RecentAssessmentsTable({
  assessments,
  role,
}: {
  assessments: RecentAssessmentRow[];
  role: Role;
}) {
  if (assessments.length === 0) {
    return (
      <section>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
          Recent assessments
        </p>
        <p className="mt-3 font-serif text-base text-ink-soft">No assessments yet.</p>
      </section>
    );
  }

  const showKeyColumn = role === "teacher";
  const cols = showKeyColumn
    ? "grid-cols-[80px_1.6fr_1fr_90px_1.6fr_28px]"
    : "grid-cols-[80px_2fr_90px_1.6fr_28px]";

  return (
    <section>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
        Recent assessments · {assessments.length}
      </p>
      <div className="mt-3 border border-rule rounded-[var(--radius-md)] bg-paper overflow-hidden">
        <div className={`grid ${cols} gap-4 px-6 py-3 bg-paper-soft border-b border-rule-soft font-mono text-xs uppercase tracking-[0.12em] text-ink-mute`}>
          <div>Date</div>
          <div>Assessment</div>
          {showKeyColumn ? <div>Key</div> : null}
          <div>Score</div>
          <div>Primary error</div>
          <div></div>
        </div>
        {assessments.map((a) => (
          <Link
            key={a.id}
            href={`/assessments/${a.id}`}
            className={`grid ${cols} gap-4 px-6 py-4 items-center border-t border-rule-soft first:border-t-0 hover:bg-paper-soft focus-visible:outline-2 focus-visible:outline-accent`}
          >
            <p className="font-mono text-sm text-ink-mute">{formatDate(a.uploaded_at)}</p>
            <p className="font-serif text-lg text-ink">{a.name}</p>
            {showKeyColumn ? (
              <p className="font-sans text-sm text-ink-soft">
                {a.answer_key_name ?? "—"}
              </p>
            ) : null}
            <p className="font-serif text-lg text-ink">
              {a.score_total > 0 ? `${a.score_right}/${a.score_total}` : "—"}
            </p>
            <p className="font-sans text-base text-ink-soft">
              {a.primary_error_pattern_name
                ? `${a.primary_error_pattern_name} · ${a.primary_error_pattern_count}×`
                : "—"}
            </p>
            <span className="font-mono text-xs text-ink-mute text-right">›</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
