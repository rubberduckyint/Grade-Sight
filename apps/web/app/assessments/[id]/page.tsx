import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { DeleteAssessmentButton } from "@/components/delete-assessment-button";
import { PageContainer } from "@/components/page-container";
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
        <p className="mb-10 font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
          Uploaded {timeAgo(detail.uploaded_at)} ·{" "}
          <Badge
            variant="secondary"
            className="font-mono uppercase tracking-[0.12em]"
          >
            {STATUS_LABEL[detail.status]}
          </Badge>{" "}
          · {detail.pages.length}{" "}
          {detail.pages.length === 1 ? "page" : "pages"}
        </p>

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
