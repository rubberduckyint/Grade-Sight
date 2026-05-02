import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-container";
import { fetchAssessments, fetchMe } from "@/lib/api";
import { TEACHER_TABS } from "@/lib/nav";
import { ArchiveHeader } from "@/components/archive/archive-header";
import { ArchiveFilters } from "@/components/archive/archive-filters";
import { ArchiveTable } from "@/components/archive/archive-table";
import { LoadEarlierButton } from "@/components/archive/load-earlier-button";
import { buildTopSentence, type Role } from "@/lib/diagnosis-sentence";

interface PageProps {
  searchParams: Promise<{ since?: string; until?: string }>;
}

export default async function AssessmentsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const since = params.since;
  const until = params.until;

  const [user, list] = await Promise.all([
    fetchMe(),
    fetchAssessments({ since, until, limit: 50 }),
  ]);
  if (!user) redirect("/sign-in");
  if (user.role !== "teacher") notFound();

  const role: Role = "teacher";
  const rows = list.assessments.map((a) => ({
    ...a,
    headline: a.headline_inputs ? buildTopSentence(a.headline_inputs, role) : null,
  }));

  const filtersActive = since != null || until != null;
  const isFirstRunEmpty = !filtersActive && rows.length === 0;

  return (
    <AppShell
      userId={user.id}
      organizationId={user.organization?.id ?? null}
      tabs={TEACHER_TABS}
      activeHref="/assessments"
      uploadHref="/upload"
    >
      <PageContainer>
        <ArchiveHeader />
        {isFirstRunEmpty ? (
          <p className="mb-10 text-base text-ink-soft">
            No assessments yet. Upload your first one above.
          </p>
        ) : (
          <>
            <ArchiveFilters />
            <ArchiveTable rows={rows} filtersActive={filtersActive} />
            {list.has_more && list.next_cursor && (
              <LoadEarlierButton
                initialCursor={list.next_cursor}
                role={role}
                since={since ?? null}
                until={until ?? null}
              />
            )}
          </>
        )}
      </PageContainer>
    </AppShell>
  );
}
