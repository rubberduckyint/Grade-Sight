import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-container";
import { BiographySentence } from "@/components/student/biography-sentence";
import { PatternTimeline } from "@/components/student/pattern-timeline";
import { RecentAssessmentsTable } from "@/components/student/recent-assessments-table";
import { StatsStrip } from "@/components/student/stats-strip";
import { StudentHeader } from "@/components/student/student-header";
import { fetchMe, fetchStudentBiography } from "@/lib/api";
import type { Role } from "@/lib/diagnosis-sentence";
import { PARENT_TABS, TEACHER_TABS } from "@/lib/nav";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function StudentBiographyPage({ params }: PageProps) {
  const { id } = await params;
  const [user, biography] = await Promise.all([
    fetchMe(),
    fetchStudentBiography(id),
  ]);

  if (!user) redirect("/sign-in");
  if (!biography) notFound();

  const role: Role = user.role === "teacher" ? "teacher" : "parent";
  const tabs = user.role === "teacher" ? TEACHER_TABS : PARENT_TABS;

  return (
    <AppShell
      orgName={user.organization?.name}
      userId={user.id}
      organizationId={user.organization?.id ?? null}
      tabs={tabs}
      activeHref="/students"
      uploadHref="/upload"
    >
      <PageContainer className="max-w-[1180px]">
        <div className="flex flex-col gap-12">
          <StudentHeader student={biography.student} />
          <BiographySentence sentence={biography.sentence} />
          <StatsStrip stats={biography.stats} weeksInWindow={biography.weeks.length} />
          <PatternTimeline rows={biography.pattern_timeline} weeks={biography.weeks} />
          <RecentAssessmentsTable assessments={biography.recent_assessments} role={role} />
        </div>
      </PageContainer>
    </AppShell>
  );
}
