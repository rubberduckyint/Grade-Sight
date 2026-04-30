import Link from "next/link";

import { ModeBadge } from "@/components/diagnosis/mode-badge";
import { DeleteAssessmentButton } from "@/components/delete-assessment-button";
import { RunDiagnosticButton } from "@/components/run-diagnostic-button";
import { SerifHeadline } from "@/components/serif-headline";
import { Badge } from "@/components/ui/badge";
import type { AssessmentDetail, AssessmentStatus } from "@/lib/types";
import type { Role } from "@/lib/diagnosis-sentence";

const STATUS_LABEL: Record<AssessmentStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
};

function formatAbsoluteDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

export function DiagnosisHeader({
  detail,
  role,
}: {
  detail: AssessmentDetail;
  role: Role;
}) {
  const crumbRoot = role === "teacher" ? "Assessments" : "Students";
  const showStatusPill = detail.status !== "completed";

  return (
    <header>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
        <span>{crumbRoot}</span>
        <span aria-hidden="true"> · </span>
        <span className="text-ink">{detail.student_name}</span>
      </p>

      <div className="mt-6 flex items-end justify-between gap-8">
        <div>
          {detail.diagnosis ? <ModeBadge mode={detail.diagnosis.analysis_mode} /> : null}
          <SerifHeadline level="page" as="h1" className="mt-2">
            {detail.student_name}
          </SerifHeadline>
        </div>
        <div className="flex gap-3 shrink-0">
          {(detail.status === "pending" || detail.status === "failed" || detail.status === "completed") ? (
            <RunDiagnosticButton
              id={detail.id}
              size="default"
              variant={detail.status === "pending" ? "initial" : "rerun"}
            />
          ) : null}
          <DeleteAssessmentButton id={detail.id} redirectTo="/dashboard" />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-2 font-sans text-base text-ink-soft">
        <span>uploaded {formatAbsoluteDate(detail.uploaded_at)}</span>
        <span aria-hidden="true">·</span>
        <span>
          {detail.pages.length} {detail.pages.length === 1 ? "page" : "pages"}
        </span>
        {detail.answer_key ? (
          <>
            <span aria-hidden="true">·</span>
            <span>
              graded against{" "}
              <Link
                href={`/keys/${detail.answer_key.id}`}
                className="text-accent hover:underline"
              >
                {detail.answer_key.name}
              </Link>
            </span>
          </>
        ) : null}
        {showStatusPill ? (
          <>
            <span aria-hidden="true">·</span>
            <Badge
              variant="secondary"
              className="font-mono uppercase tracking-[0.12em]"
            >
              {STATUS_LABEL[detail.status]}
            </Badge>
          </>
        ) : null}
      </div>
    </header>
  );
}
