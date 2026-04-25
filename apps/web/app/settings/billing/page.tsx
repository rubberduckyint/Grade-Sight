import { redirect } from "next/navigation";
import { createPortalSession, fetchEntitlement, fetchMe } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-container";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

async function handlePortal() {
  "use server";
  const url = await createPortalSession();
  redirect(url);
}

const PLAN_LABEL: Record<string, { name: string; price: string }> = {
  parent_monthly: { name: "Parent Monthly", price: "$15 / month" },
  teacher_monthly: { name: "Teacher Monthly", price: "$29 / month" },
};

const STATUS_LABEL: Record<string, string> = {
  trialing: "Trialing",
  active: "Active",
  past_due: "Past due",
  canceled: "Canceled",
  incomplete: "Incomplete",
};

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BillingSettingsPage() {
  const [user, entitlement] = await Promise.all([fetchMe(), fetchEntitlement()]);
  if (!user) redirect("/sign-in");

  const plan = entitlement?.plan ? PLAN_LABEL[entitlement.plan] : null;
  const statusLabel = entitlement?.status ? STATUS_LABEL[entitlement.status] : "—";
  const periodEnd = formatDate(entitlement?.current_period_end);
  const trialEnd = formatDate(entitlement?.trial_ends_at);

  return (
    <AppShell orgName={user.organization?.name}>
      <PageContainer className="max-w-[720px]">
        <SectionEyebrow>Settings</SectionEyebrow>
        <div className="mt-4 mb-10">
          <SerifHeadline level="page" as="h1">
            Billing &amp; plan
          </SerifHeadline>
        </div>

        <Card className="border-rule bg-paper shadow-none">
          <CardContent className="p-8">
            <div className="flex items-start justify-between gap-6">
              <div>
                <SectionEyebrow>Current plan</SectionEyebrow>
                <p className="mt-3 font-serif text-xl text-ink">
                  {plan ? plan.name : "No active plan"}
                </p>
                {plan && (
                  <p className="mt-1 text-base text-ink-soft">{plan.price}</p>
                )}
              </div>
              <Badge variant="secondary" className="font-mono uppercase tracking-[0.12em]">
                {statusLabel}
              </Badge>
            </div>

            <Separator className="my-8 bg-rule-soft" />

            <dl className="grid gap-6 md:grid-cols-2">
              {entitlement?.status === "trialing" && trialEnd && (
                <div>
                  <SectionEyebrow>Trial ends</SectionEyebrow>
                  <dd className="mt-2 text-base text-ink">{trialEnd}</dd>
                </div>
              )}
              {entitlement?.status !== "trialing" && periodEnd && (
                <div>
                  <SectionEyebrow>Next billing date</SectionEyebrow>
                  <dd className="mt-2 text-base text-ink">{periodEnd}</dd>
                </div>
              )}
            </dl>

            <Separator className="my-8 bg-rule-soft" />

            <form action={handlePortal}>
              <Button type="submit">Manage billing in Stripe</Button>
              <p className="mt-3 font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
                Opens Stripe Customer Portal
              </p>
            </form>
          </CardContent>
        </Card>
      </PageContainer>
    </AppShell>
  );
}
