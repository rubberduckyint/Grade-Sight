import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { AssessmentUploadForm } from "@/components/assessment-upload-form";
import { PageContainer } from "@/components/page-container";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";
import { fetchAnswerKeys, fetchMe, fetchStudents } from "@/lib/api";

export default async function UploadPage() {
  const [user, students, answerKeys] = await Promise.all([
    fetchMe(),
    fetchStudents(),
    fetchAnswerKeys(),
  ]);
  if (!user) redirect("/sign-in");

  return (
    <AppShell
      orgName={user.organization?.name}
      userId={user.id}
      organizationId={user.organization?.id ?? null}
    >
      <PageContainer className="max-w-[640px]">
        <SectionEyebrow>Upload assessment</SectionEyebrow>
        <div className="mt-4 mb-8">
          <SerifHeadline level="page" as="h1">
            Add a graded quiz.
          </SerifHeadline>
        </div>
        <p className="mb-8 text-base text-ink-soft">
          Pick a student and upload a photo of their graded work. Grade Sight
          will diagnose the error patterns once the assessment processes.
        </p>
        <AssessmentUploadForm
          initialStudents={students}
          initialAnswerKeys={answerKeys}
          /* admin role gets parent-prominent UI for now; revisit when admin
             features are scoped (Phase 2). */
          userRole={user.role === "teacher" ? "teacher" : "parent"}
        />
      </PageContainer>
    </AppShell>
  );
}
