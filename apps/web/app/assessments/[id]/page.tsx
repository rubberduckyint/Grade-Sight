import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { DiagnosisHeader } from "@/components/diagnosis/diagnosis-header";
import { PatternGroup } from "@/components/diagnosis/pattern-group";
import { ProblemGrid } from "@/components/diagnosis/problem-grid";
import { ProcessingCard } from "@/components/diagnosis/processing-card";
import { TopSentence } from "@/components/diagnosis/top-sentence";
import { PageContainer } from "@/components/page-container";
import { RunDiagnosticButton } from "@/components/run-diagnostic-button";
import { SerifHeadline } from "@/components/serif-headline";
import {
  buildTopSentence,
  groupProblemsByPattern,
  type Role,
} from "@/lib/diagnosis-sentence";
import { fetchAssessmentDetail, fetchMe } from "@/lib/api";

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

  const role: Role = user.organization?.id ? "teacher" : "parent";

  return (
    <AppShell
      orgName={user.organization?.name}
      userId={user.id}
      organizationId={user.organization?.id ?? null}
    >
      <PageContainer className="max-w-[1100px]">
        <DiagnosisHeader detail={detail} role={role} />

        {detail.status === "pending" ? (
          <div className="my-12 rounded-[var(--radius-sm)] border border-rule bg-paper-soft p-8 text-center">
            <SerifHeadline level="section" as="h2">
              Run diagnostic
            </SerifHeadline>
            <p className="mt-2 text-base text-ink-soft">
              Grade-Sight will analyze each problem on this assessment, identify
              error patterns, and provide step-by-step solutions.
            </p>
            <p className="mt-1 font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
              Takes about 30 seconds
            </p>
            <div className="mt-6 flex justify-center">
              <RunDiagnosticButton id={detail.id} />
            </div>
          </div>
        ) : null}

        {detail.status === "processing" ? (
          <ProcessingCard
            studentName={detail.student_name}
            pages={detail.pages}
            uploadedAt={detail.uploaded_at}
            mode={detail.diagnosis?.analysis_mode ?? "auto_grade"}
          />
        ) : null}

        {detail.status === "failed" ? (
          <div className="my-12 rounded-[var(--radius-sm)] border border-mark bg-paper-soft p-8 text-center">
            <p className="text-base text-mark">
              Something went wrong analyzing this assessment.
            </p>
            <div className="mt-4 flex justify-center">
              <RunDiagnosticButton id={detail.id} />
            </div>
          </div>
        ) : null}

        {detail.status === "completed" && detail.diagnosis ? (
          <CompletedBody detail={detail} role={role} />
        ) : null}

        <PagesReel detail={detail} />
      </PageContainer>
    </AppShell>
  );
}

function CompletedBody({
  detail,
  role,
}: {
  detail: NonNullable<Awaited<ReturnType<typeof fetchAssessmentDetail>>>;
  role: Role;
}) {
  if (!detail.diagnosis) return null;

  const sentence = buildTopSentence(detail.diagnosis, role);
  const groups = groupProblemsByPattern(detail.diagnosis.problems);
  const totalWrong = detail.diagnosis.problems.filter((p) => !p.is_correct).length;

  return (
    <div className="my-12 flex flex-col gap-12">
      <TopSentence
        studentName={detail.student_name}
        sentence={sentence}
        role={role}
      />

      {groups.length > 0 ? (
        <div className="flex flex-col gap-6">
          {groups.map((g, i) => (
            <PatternGroup
              key={g.slug ?? "other"}
              group={g}
              totalWrong={totalWrong}
              emphasis={i === 0 ? "primary" : "secondary"}
            />
          ))}
        </div>
      ) : null}

      <ProblemGrid problems={detail.diagnosis.problems} />
    </div>
  );
}

function PagesReel({
  detail,
}: {
  detail: NonNullable<Awaited<ReturnType<typeof fetchAssessmentDetail>>>;
}) {
  if (detail.pages.length === 0) return null;
  return (
    <section aria-label="Pages">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
        Pages &middot; {detail.pages.length} photographed
      </p>
      <ul className="mt-5 space-y-6">
        {detail.pages.map((p) => (
          <li
            key={p.page_number}
            className="rounded-[var(--radius-sm)] border border-rule bg-paper p-4"
          >
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
              Page {p.page_number} &middot; {p.original_filename}
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
    </section>
  );
}
