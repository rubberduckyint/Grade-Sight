import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-container";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";
import { fetchAnswerKeyDetail, fetchMe } from "@/lib/api";
import { TEACHER_TABS } from "@/lib/nav";
import { DeleteKeyButton } from "@/components/keys/delete-key-button";

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

export default async function KeyDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [user, key] = await Promise.all([fetchMe(), fetchAnswerKeyDetail(id)]);
  if (!user) redirect("/sign-in");
  if (user.role !== "teacher") notFound();
  if (key === null) notFound();

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
        <Link
          href="/keys"
          className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute hover:text-ink"
        >
          ← Answer keys
        </Link>
        <header className="mt-6 mb-10">
          <SectionEyebrow>Answer key</SectionEyebrow>
          <div className="mt-3">
            <SerifHeadline level="page" as="h1">{key.name}</SerifHeadline>
          </div>
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.06em] text-ink-mute">
            {key.pages.length} {key.pages.length === 1 ? "page" : "pages"} · uploaded {formatDate(key.created_at)}
          </p>
        </header>

        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {key.pages.map((p) => (
            <figure key={p.page_number} className="overflow-hidden rounded-[var(--radius-md)] border border-rule bg-paper">
              <div className="relative aspect-[3/4] bg-paper-soft border-b border-rule-soft">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.view_url}
                  alt={`Page ${p.page_number}`}
                  className="absolute inset-0 h-full w-full object-contain"
                />
              </div>
              <figcaption className="px-4 py-3 font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
                Page {p.page_number}
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="mt-16 border-t border-rule-soft pt-8">
          <DeleteKeyButton id={key.id} />
        </div>
      </PageContainer>
    </AppShell>
  );
}
