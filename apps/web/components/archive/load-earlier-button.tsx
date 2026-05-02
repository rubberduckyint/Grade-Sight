// apps/web/components/archive/load-earlier-button.tsx
"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { loadAssessments } from "@/lib/actions";
import type { AssessmentListItem } from "@/lib/types";
import type { Role, TopSentence } from "@/lib/diagnosis-sentence";
import { buildTopSentence } from "@/lib/diagnosis-sentence";
import { ArchiveRow } from "./archive-row";

interface RowData extends AssessmentListItem { headline: TopSentence | null }

function buildRowData(items: AssessmentListItem[], role: Role): RowData[] {
  return items.map((a) => ({
    ...a,
    headline: a.headline_inputs ? buildTopSentence(a.headline_inputs, role) : null,
  }));
}

export function LoadEarlierButton({
  initialCursor,
  role,
  since,
  until,
}: {
  initialCursor: string;
  role: Role;
  since: string | null;
  until: string | null;
}) {
  const [appended, setAppended] = useState<RowData[]>([]);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [pending, startTransition] = useTransition();

  if (cursor === null) return null;

  function loadMore() {
    startTransition(async () => {
      const resp = await loadAssessments({ cursor: cursor ?? undefined, since: since ?? undefined, until: until ?? undefined, limit: 50 });
      setAppended((prev) => [...prev, ...buildRowData(resp.assessments, role)]);
      setCursor(resp.has_more ? resp.next_cursor : null);
    });
  }

  return (
    <>
      {appended.length > 0 && (
        <div className="mt-0 overflow-x-auto rounded-b-[var(--radius-md)] border border-rule border-t-0">
          <table className="w-full text-left">
            <tbody>
              {appended.map((r) => <ArchiveRow key={r.id} row={r} />)}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-6 flex justify-center">
        <Button variant="secondary" onClick={loadMore} disabled={pending}>
          {pending ? "Loading…" : "Load earlier ↓"}
        </Button>
      </div>
    </>
  );
}
