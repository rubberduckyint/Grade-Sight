import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { DeleteAssessmentButton } from "@/components/delete-assessment-button";
import { DiagnosisDisplay } from "@/components/diagnosis-display";
import { PageContainer } from "@/components/page-container";
import { RunDiagnosticButton } from "@/components/run-diagnostic-button";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";
import { Badge } from "@/components/ui/badge";
import { fetchAssessmentDetail, fetchMe } from "@/lib/api";
import type { AssessmentStatus } from "@/lib/types";

const STATUS_LABEL: Record<AssessmentStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AssessmentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [user, detail] = await Promise.all([
    fetchMe(),
    fetchAssessmentDetail(id),
  ]);
  if (!user) redirect("/sign-in");
  if (!detail) notFound();

  return (
    <AppShell orgName={user.organization?.name}>
      <PageContainer className="max-w-[800px]">
        <SectionEyebrow>Assessment</SectionEyebrow>
        <div className="mt-4 mb-2 flex items-baseline justify-between">
          <SerifHeadline level="page" as="h1">
            {detail.student_name}
          </SerifHeadline>
          <DeleteAssessmentButton id={detail.id} redirectTo="/dashboard" />
        </div>
        <div className="mb-10 flex flex-wrap items-center gap-x-2 font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
          <span>Uploaded {timeAgo(detail.uploaded_at)}</span>
          <span aria-hidden="true">·</span>
          <Badge
            variant="secondary"
            className="font-mono uppercase tracking-[0.12em]"
          >
            {STATUS_LABEL[detail.status]}
          </Badge>
          <span aria-hidden="true">·</span>
          <span>
            {detail.pages.length}{" "}
            {detail.pages.length === 1 ? "page" : "pages"}
          </span>
          {detail.diagnosis && (
            <>
              <span aria-hidden="true">·</span>
              <ModeBadge
                mode={detail.diagnosis.analysis_mode}
                answerKey={detail.answer_key}
              />
            </>
          )}
        </div>

        {/* Diagnostic section */}
        {detail.status === "pending" && (
          <div className="my-12 rounded-[var(--radius-sm)] border border-rule bg-paper-soft p-8 text-center">
            <SerifHeadline level="section" as="h2">
              Run diagnostic
            </SerifHeadline>
            <p className="mt-2 text-base text-ink-soft">
              Grade-Sight will analyze each problem on this assessment,
              identify error patterns, and provide step-by-step solutions.
            </p>
            <p className="mt-1 font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
              Takes about 30 seconds
            </p>
            <div className="mt-6 flex justify-center">
              <RunDiagnosticButton id={detail.id} />
            </div>
          </div>
        )}
        {detail.status === "processing" && (
          <div className="my-12 rounded-[var(--radius-sm)] border border-rule bg-paper-soft p-8 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
              Analyzing — about 30 seconds…
            </p>
          </div>
        )}
        {detail.status === "completed" && detail.diagnosis && (
          <DiagnosisDisplay diagnosis={detail.diagnosis} />
        )}
        {detail.status === "failed" && (
          <div className="my-12 rounded-[var(--radius-sm)] border border-mark bg-paper-soft p-8 text-center">
            <p className="text-base text-mark">
              Something went wrong analyzing this assessment.
            </p>
            <div className="mt-4 flex justify-center">
              <RunDiagnosticButton id={detail.id} />
            </div>
          </div>
        )}

        <ul className="space-y-6">
          {detail.pages.map((p) => (
            <li
              key={p.page_number}
              className="rounded-[var(--radius-sm)] border border-rule bg-paper p-4"
            >
              <p className="mb-2 font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
                Page {p.page_number} · {p.original_filename}
              </p>
              <a
                href={p.view_url}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- presigned R2 URL, not optimizable */}
                <img
                  src={p.view_url}
                  alt={`Page ${p.page_number}: ${p.original_filename}`}
                  className="w-full rounded-[var(--radius-sm)] border border-rule-soft"
                />
              </a>
            </li>
          ))}
        </ul>
      </PageContainer>
    </AppShell>
  );
}

function ModeBadge({
  mode,
  answerKey,
}: {
  mode: "auto_grade" | "with_key" | "already_graded";
  answerKey: { id: string; name: string; page_count: number } | null;
}) {
  const label =
    mode === "auto_grade"
      ? "Auto-graded"
      : mode === "already_graded"
        ? "Reading teacher markings"
        : answerKey
          ? `Graded with ${answerKey.name}`
          : "Graded with answer key";

  return (
    <Badge
      variant="secondary"
      className="font-mono uppercase tracking-[0.12em]"
    >
      {label}
    </Badge>
  );
}
