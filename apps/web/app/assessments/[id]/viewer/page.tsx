import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ViewerHeader } from "@/components/diagnosis/viewer-header";
import { ViewerPanel } from "@/components/diagnosis/viewer-panel";
import { PageContainer } from "@/components/page-container";
import {
  fetchAnswerKeyDetail,
  fetchAssessmentDetail,
  fetchMe,
} from "@/lib/api";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AssessmentViewerPage({ params }: PageProps) {
  const { id } = await params;
  const [user, detail] = await Promise.all([
    fetchMe(),
    fetchAssessmentDetail(id),
  ]);

  if (!user) redirect("/sign-in");
  if (!detail) notFound();
  if (!user.organization?.id) notFound();
  if (detail.diagnosis?.analysis_mode !== "with_key") notFound();
  if (!detail.answer_key) notFound();

  const answerKey = await fetchAnswerKeyDetail(detail.answer_key.id);
  if (!answerKey) notFound();

  return (
    <AppShell
      orgName={user.organization?.name}
      userId={user.id}
      organizationId={user.organization?.id ?? null}
    >
      <PageContainer className="max-w-[1400px]">
        <ViewerHeader detail={detail} answerKey={answerKey} />

        <div className="mt-8 grid grid-cols-2 gap-6">
          <ViewerPanel
            label="Student’s paper"
            pages={detail.pages}
          />
          <ViewerPanel
            label={`${answerKey.name} key`}
            pages={answerKey.pages}
          />
        </div>
      </PageContainer>
    </AppShell>
  );
}
