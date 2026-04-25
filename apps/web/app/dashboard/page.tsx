import { redirect } from "next/navigation";
import { createCheckoutSession, fetchEntitlement, fetchMe } from "@/lib/api";
import { TrialBanner } from "@/components/TrialBanner";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-container";
import { SerifHeadline } from "@/components/serif-headline";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { EmptyState } from "@/components/empty-state";

async function handleCheckout() {
  "use server";
  return await createCheckoutSession();
}

function daysUntil(iso: string, now: number): number {
  return Math.max(
    0,
    Math.ceil((new Date(iso).getTime() - now) / (1000 * 60 * 60 * 24)),
  );
}

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const [user, entitlement] = await Promise.all([fetchMe(), fetchEntitlement()]);
  if (!user) redirect("/sign-in");

  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;

  // eslint-disable-next-line react-hooks/purity -- server component, runs per request
  const now = new Date();
  const nowMs = now.getTime();
  const daysRemaining =
    entitlement?.trial_ends_at != null
      ? daysUntil(entitlement.trial_ends_at, nowMs)
      : null;
  const showBanner =
    entitlement?.status === "trialing" &&
    daysRemaining !== null &&
    daysRemaining <= 7;

  return (
    <AppShell orgName={user.organization?.name}>
      <PageContainer>
        {showBanner && daysRemaining !== null && (
          <div className="mb-10">
            <TrialBanner
              daysRemaining={daysRemaining}
              onCheckout={handleCheckout}
            />
          </div>
        )}
        <SectionEyebrow>Dashboard</SectionEyebrow>
        <div className="mt-4">
          <SerifHeadline level="greeting">
            {greeting(now)}, {user.first_name || displayName}.
          </SerifHeadline>
        </div>
        <div className="mt-12">
          <EmptyState
            eyebrow={<SectionEyebrow>Coming soon</SectionEyebrow>}
            title="No assessments yet."
            body="When you're ready, upload a photo of your student's quiz or test and we'll tell you what we saw."
          />
        </div>
      </PageContainer>
    </AppShell>
  );
}
