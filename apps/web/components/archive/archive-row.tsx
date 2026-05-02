// apps/web/components/archive/archive-row.tsx
import Link from "next/link";
import type { AssessmentListItem } from "@/lib/types";
import type { TopSentence } from "@/lib/diagnosis-sentence";
import { renderHeadline } from "@/lib/diagnosis-sentence";

interface RowData extends AssessmentListItem {
  headline: TopSentence | null;
}

const STATUS_LABELS: Record<string, { label: string; tone: "neutral" | "muted" | "danger" }> = {
  pending: { label: "Awaiting upload", tone: "muted" },
  processing: { label: "Reading the quiz…", tone: "muted" },
  failed: { label: "Couldn’t read — re-run from row", tone: "danger" },
  completed: { label: "", tone: "neutral" },
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}

export function ArchiveRow({ row }: { row: RowData }) {
  const status = STATUS_LABELS[row.status];
  const headlineText =
    row.headline ? renderHeadline(row.headline) : null;

  return (
    <tr className="border-t border-rule-soft hover:bg-paper-soft">
      <td className="py-4 pl-3 pr-4 align-baseline font-mono text-xs uppercase tracking-[0.06em] text-ink-soft">
        <Link href={`/assessments/${row.id}`} className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          {formatDate(row.uploaded_at)}
        </Link>
      </td>
      <td className="py-4 pr-4 align-baseline font-serif text-base text-ink">
        <Link href={`/assessments/${row.id}`}>{row.student_name}</Link>
      </td>
      <td className="py-4 pr-4 align-baseline font-mono text-xs uppercase tracking-[0.06em] text-ink-mute">
        {row.status === "completed" ? "—" : status?.label}
      </td>
      <td className="py-4 pr-4 align-baseline font-mono text-xs">
        <span className={row.has_key ? "text-green" : "text-ink-mute"}>
          {row.has_key ? "● linked" : "○ none"}
        </span>
      </td>
      <td className="py-4 pr-4 align-baseline font-serif italic text-ink-soft line-clamp-1">
        {headlineText ?? <span className={status?.tone === "danger" ? "text-mark not-italic" : ""}>{status?.label}</span>}
      </td>
      <td className="py-4 pr-3 align-baseline text-right font-mono text-xs uppercase tracking-[0.1em] text-accent">
        &rsaquo;
      </td>
    </tr>
  );
}
