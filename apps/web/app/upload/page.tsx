import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { AssessmentUploadForm } from "@/components/assessment-upload-form";
import { PageContainer } from "@/components/page-container";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";
import { fetchMe, fetchStudents } from "@/lib/api";

export default async function UploadPage() {
  const [user, students] = await Promise.all([fetchMe(), fetchStudents()]);
  if (!user) redirect("/sign-in");

  return (
    <AppShell orgName={user.organization?.name}>
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
        <AssessmentUploadForm initialStudents={students} />
      </PageContainer>
    </AppShell>
  );
}
