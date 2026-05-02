import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-container";
import { fetchClasses, fetchMe } from "@/lib/api";
import { TEACHER_TABS } from "@/lib/nav";
import { ClassListHeader } from "@/components/classes/class-list-header";
import { ClassList } from "@/components/classes/class-list";
import { EmptyClassList } from "@/components/classes/empty-class-list";

interface PageProps {
  searchParams: Promise<{ include_archived?: string }>;
}

export default async function ClassesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const includeArchived = params.include_archived === "true";

  const [user, list] = await Promise.all([
    fetchMe(),
    fetchClasses({ includeArchived }),
  ]);
  if (!user) redirect("/sign-in");
  if (user.role !== "teacher") notFound();

  const isFirstRunEmpty = !includeArchived && list.classes.length === 0;

  return (
    <AppShell
      userId={user.id}
      organizationId={user.organization?.id ?? null}
      tabs={TEACHER_TABS}
      activeHref="/classes"
      uploadHref="/upload"
    >
      <PageContainer>
        <ClassListHeader hasArchived={list.has_archived} includeArchived={includeArchived} />
        {isFirstRunEmpty ? <EmptyClassList /> : <ClassList classes={list.classes} />}
      </PageContainer>
    </AppShell>
  );
}
