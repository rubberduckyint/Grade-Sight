import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-container";
import { fetchAnswerKeys, fetchMe } from "@/lib/api";
import { TEACHER_TABS } from "@/lib/nav";
import { KeyList } from "@/components/keys/key-list";
import { EmptyKeyLibrary } from "@/components/keys/empty-key-library";
import { KeyLibraryHeader } from "@/components/keys/key-library-header";
import { WhyKeyLibraryNote } from "@/components/keys/why-key-library-note";

export default async function KeysPage() {
  const [user, keys] = await Promise.all([fetchMe(), fetchAnswerKeys()]);
  if (!user) redirect("/sign-in");
  if (user.role !== "teacher") notFound();

  return (
    <AppShell
      orgName={user.organization?.name}
      userId={user.id}
      organizationId={user.organization?.id ?? null}
      tabs={TEACHER_TABS}
      activeHref="/keys"
      uploadHref="/upload"
    >
      <PageContainer className="max-w-[1200px]">
        <KeyLibraryHeader />
        {keys.length === 0 ? (
          <EmptyKeyLibrary />
        ) : (
          <KeyList keys={keys} />
        )}
        <WhyKeyLibraryNote />
      </PageContainer>
    </AppShell>
  );
}
