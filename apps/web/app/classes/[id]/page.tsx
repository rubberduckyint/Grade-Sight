import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-container";
import { fetchClassDetail, fetchMe, fetchStudents } from "@/lib/api";
import { TEACHER_TABS } from "@/lib/nav";
import { ClassDetailHeader } from "@/components/classes/class-detail-header";
import { RosterSection } from "@/components/classes/roster-section";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClassDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [user, detail, allStudents] = await Promise.all([
    fetchMe(),
    fetchClassDetail(id),
    fetchStudents(),
  ]);
  if (!user) redirect("/sign-in");
  if (user.role !== "teacher") notFound();
  if (detail === null) notFound();

  const enrolledIds = new Set(detail.roster.map((m) => m.student_id));
  const candidateStudents = allStudents.filter((s) => !enrolledIds.has(s.id));

  return (
    <AppShell
      orgName={user.organization?.name}
      userId={user.id}
      organizationId={user.organization?.id ?? null}
      tabs={TEACHER_TABS}
      activeHref="/classes"
      uploadHref="/upload"
    >
      <PageContainer className="max-w-[1000px]">
        <ClassDetailHeader klass={detail} />
        <RosterSection klass={detail} candidateStudents={candidateStudents} />
      </PageContainer>
    </AppShell>
  );
}
