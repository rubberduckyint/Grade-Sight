// apps/web/components/archive/archive-table.tsx
import type { AssessmentListItem } from "@/lib/types";
import type { TopSentence } from "@/lib/diagnosis-sentence";
import { ArchiveRow } from "./archive-row";

interface RowData extends AssessmentListItem { headline: TopSentence | null }

export function ArchiveTable({ rows, filtersActive }: { rows: RowData[]; filtersActive: boolean }) {
  if (rows.length === 0) {
    return (
      <p className="py-12 text-center text-base text-ink-soft">
        {filtersActive
          ? "No assessments match this date range."
          : "No assessments yet."}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-rule">
      <table className="w-full text-left">
        <thead className="border-b border-rule-soft bg-paper-soft">
          <tr className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
            <th className="py-3 pl-3 pr-4 font-normal">Date</th>
            <th className="py-3 pr-4 font-normal">Student</th>
            <th className="py-3 pr-4 font-normal">Status</th>
            <th className="py-3 pr-4 font-normal">Key</th>
            <th className="py-3 pr-4 font-normal">Headline</th>
            <th className="py-3 pr-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => <ArchiveRow key={r.id} row={r} />)}
        </tbody>
      </table>
    </div>
  );
}
