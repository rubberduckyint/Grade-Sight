import { redirect } from "next/navigation";
import {
  createPortalSession,
  fetchEntitlement,
  fetchMe,
  fetchPrices,
} from "@/lib/api";
import type { PriceInfo } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { cn } from "@/lib/utils";

async function handlePortal() {
  "use server";
  const url = await createPortalSession();
  redirect(url);
}

const PLAN_LABEL: Record<string, string> = {
  parent_monthly: "Parent · monthly",
  teacher_monthly: "Teacher · monthly",
};

const STATUS_LABEL: Record<string, string> = {
  trialing: "Trialing",
  active: "Active",
  past_due: "Past due",
  canceled: "Canceled",
  incomplete: "Incomplete",
};

function formatPrice(price: PriceInfo): string {
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: price.currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(price.unit_amount / 100);
  return `${amount} / ${price.interval}, billed ${price.interval}ly`;
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function BillingSettingsPage() {
  const [user, entitlement, prices] = await Promise.all([
    fetchMe(),
    fetchEntitlement(),
    fetchPrices(),
  ]);
  if (!user) redirect("/sign-in");

  const planKey = entitlement?.plan ?? null;
  const planLabel = planKey ? PLAN_LABEL[planKey] : "No active plan";
  const planPrice = planKey ? formatPrice(prices.prices[planKey]) : null;
  const statusLabel = entitlement?.status
    ? (STATUS_LABEL[entitlement.status] ?? "—")
    : "—";
  const isActive =
    entitlement?.status === "active" || entitlement?.status === "trialing";
  const renews = formatDate(entitlement?.current_period_end);
  const trialEnds = formatDate(entitlement?.trial_ends_at);

  const supportMailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Billing question")}`;

  return (
    <>
      <SectionEyebrow>Settings · Billing</SectionEyebrow>
      <div className="mt-3 mb-10">
        <SerifHeadline level="page" as="h1">
          Billing &amp; plan
        </SerifHeadline>
      </div>

      <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <Card className="border-rule bg-paper shadow-none">
          <CardContent className="p-7">
            <div className="flex items-start justify-between gap-6">
              <div>
                <SectionEyebrow>Current plan</SectionEyebrow>
                <p className="mt-3 font-serif text-2xl text-ink">{planLabel}</p>
                {planPrice && (
                  <p className="mt-1 text-base text-ink-soft">{planPrice}</p>
                )}
              </div>
              <Badge
                variant="secondary"
                className={cn(
                  "font-mono uppercase tracking-[0.12em]",
                  isActive && "bg-accent-soft text-accent",
                )}
              >
                {statusLabel}
              </Badge>
            </div>

            <Separator className="my-6 bg-rule-soft" />

            <dl className="grid gap-6 md:grid-cols-3">
              {entitlement?.status === "trialing" && trialEnds && (
                <div>
                  <dt className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
                    Trial ends
                  </dt>
                  <dd className="mt-1 text-base text-ink">{trialEnds}</dd>
                </div>
              )}
              {entitlement?.status !== "trialing" && renews && (
                <div>
                  <dt className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
                    Renews
                  </dt>
                  <dd className="mt-1 text-base text-ink">{renews}</dd>
                </div>
              )}
              <div>
                <dt className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
                  Card on file
                </dt>
                {/* TODO(billing-card-summary): expose default_payment_method
                    on the entitlement response (Stripe .subscription expand).
                    No v2 step covers this — opportunistic pickup.
                    See docs/superpowers/plans/followups.md. */}
                <dd className="mt-1 text-base text-ink-soft">—</dd>
              </div>
            </dl>

            <Separator className="my-6 bg-rule-soft" />

            <form action={handlePortal}>
              <Button type="submit">Manage billing in Stripe</Button>
            </form>
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
              Invoices, payment methods, and receipts open in Stripe portal
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-rule-soft bg-paper-soft shadow-none">
            <CardContent className="p-6">
              <p className="font-serif text-lg text-ink">Change plan</p>
              <p className="mt-2 text-base text-ink-soft">
                Switch between monthly and annual, or upgrade to teacher.
                Changes take effect at the next billing cycle.
              </p>
            </CardContent>
          </Card>
          <Card className="border-rule-soft bg-paper shadow-none">
            <CardContent className="p-6">
              <p className="font-serif text-lg text-ink">Questions?</p>
              <p className="mt-2 text-base text-ink-soft">
                Billing is handled by Stripe. We never see your card number.
              </p>
              <p className="mt-3">
                <a
                  href={supportMailto}
                  className="text-base text-accent underline-offset-2 hover:underline"
                >
                  Email support →
                </a>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
