import { redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import {
  createCheckoutSession,
  fetchEntitlement,
  fetchMe,
  fetchPrices,
  getTrialStats,
} from "@/lib/api";
import type { PriceInfo, TrialStats } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ShellHeader } from "@/components/shell-header";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { cn } from "@/lib/utils";

async function handleCheckout() {
  "use server";
  const url = await createCheckoutSession();
  redirect(url);
}

type Branch = "trial-ended" | "canceled" | "past-due";

function branchFromStatus(status: string | null | undefined): Branch {
  if (status === "past_due") return "past-due";
  if (status === "canceled") return "canceled";
  return "trial-ended";
}

interface BranchCopy {
  eyebrow: string;
  headline: { lead: string; italic: string; tail: string };
  body: string;
  primaryCta: string;
  reassure: string;
  eyebrowTone: "neutral" | "mark";
}

function copyForBranch(branch: Branch, priceLabel: string): BranchCopy {
  if (branch === "trial-ended") {
    return {
      eyebrow: "Trial ended",
      headline: { lead: "Your trial ended ", italic: "yesterday", tail: "." },
      body: "Add a card and pick up exactly where you left off. Your diagnoses, interventions, and history are still here — we just need a card to keep running them.",
      primaryCta: `Start subscription — ${priceLabel}`,
      reassure:
        "Your data is retained for 30 days whether you subscribe or not.",
      eyebrowTone: "neutral",
    };
  }
  if (branch === "canceled") {
    return {
      eyebrow: "Subscription canceled",
      headline: {
        lead: "You canceled. We kept ",
        italic: "everything",
        tail: ".",
      },
      body: "No hard feelings. Your diagnoses and interventions are still here. Resubscribe whenever it's useful — same price, same data.",
      primaryCta: `Resubscribe — ${priceLabel}`,
      reassure:
        "30-day retention window. After that, all student work is permanently deleted.",
      eyebrowTone: "neutral",
    };
  }
  return {
    eyebrow: "Payment didn't go through",
    headline: { lead: "Your last payment ", italic: "bounced", tail: "." },
    body: "Update your card and we'll try again. Your access stays on until we've retried a few times — no sudden cut-off.",
    primaryCta: "Update card",
    reassure:
      "Stripe retries in 3, 5, and 7 days. You'll get an email each time.",
    eyebrowTone: "mark",
  };
}

function formatPriceLabel(price: PriceInfo): string {
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: price.currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(price.unit_amount / 100);
  return `${amount}/${price.interval}`;
}

function SecondaryCTA({ branch }: { branch: Branch }) {
  if (branch === "trial-ended") {
    return (
      <SignOutButton redirectUrl="/">
        <Button variant="secondary" size="lg">
          Or sign out
        </Button>
      </SignOutButton>
    );
  }
  if (branch === "canceled") {
    return (
      <Button asChild variant="secondary" size="lg">
        <a href="/settings/privacy">Export my data</a>
      </Button>
    );
  }
  return (
    <Button asChild variant="secondary" size="lg">
      <a
        href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Payment issue")}`}
      >
        Contact us
      </a>
    </Button>
  );
}

function StatRow({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="border-t border-rule-soft py-4">
      <p className="font-serif text-xl font-medium text-ink">{title}</p>
      <p className="mt-1 text-base text-ink-soft">{desc}</p>
    </div>
  );
}

function RightColumn({ stats }: { stats: TrialStats }) {
  return (
    <div className="bg-paper-soft px-8 py-16 md:px-12 md:py-24">
      <SectionEyebrow>What&apos;s still here</SectionEyebrow>
      <div className="mt-4">
        <StatRow
          title={`${stats.assessmentCount} ${stats.assessmentCount === 1 ? "assessment" : "assessments"}`}
          desc="All student work, all diagnoses."
        />
        <StatRow
          title={`${stats.interventionCount} ${stats.interventionCount === 1 ? "intervention" : "interventions"} in progress`}
          desc="Saved with their timing and outcomes."
        />
        <StatRow
          title={`${stats.weeksOfHistory} weeks of pattern history`}
          desc="Everything we&apos;ve learned about each kid."
        />
      </div>
      <div className="mt-8 rounded-[var(--radius-sm)] border border-rule bg-paper p-5">
        <span className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
          Not subscribing?
        </span>
        <p className="mt-2 text-base text-ink-soft">
          Export everything, or delete everything. One click, either way — from
          the{" "}
          <a
            href="/settings/privacy"
            className="text-accent underline-offset-2 hover:underline"
          >
            data controls
          </a>{" "}
          page.
        </p>
      </div>
    </div>
  );
}

export default async function PaywallPage() {
  const [user, entitlement, prices] = await Promise.all([
    fetchMe(),
    fetchEntitlement(),
    fetchPrices(),
  ]);
  if (!user) redirect("/sign-in");
  if (entitlement?.is_entitled) redirect("/dashboard");

  const planKey = user.role === "teacher" ? "teacher_monthly" : "parent_monthly";
  const priceLabel = formatPriceLabel(prices.prices[planKey]);
  const branch = branchFromStatus(entitlement?.status);
  const copy = copyForBranch(branch, priceLabel);
  const stats = await getTrialStats(user.id).catch(() => null);

  return (
    <div className="min-h-screen bg-paper">
      <ShellHeader rightLabel={`Signed in as ${user.email}`} />
      <div
        className={cn(
          "mx-auto grid max-w-[1100px] grid-cols-1",
          stats && "md:grid-cols-[1.2fr_1fr]",
        )}
      >
        <div
          className={cn(
            "px-6 py-16 md:px-14 md:py-24",
            stats && "border-rule-soft md:border-r",
          )}
        >
          <span
            className={cn(
              "font-mono text-xs uppercase tracking-[0.14em]",
              copy.eyebrowTone === "mark" ? "text-mark" : "text-ink-mute",
            )}
          >
            {copy.eyebrow}
          </span>
          <h1 className="mt-5 font-serif text-5xl font-normal leading-[1.05] tracking-[-0.022em] text-ink md:text-6xl">
            {copy.headline.lead}
            <em className="font-serif italic">{copy.headline.italic}</em>
            {copy.headline.tail}
          </h1>
          <p className="mt-7 max-w-[520px] font-serif text-xl font-light leading-snug text-ink-soft">
            {copy.body}
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <form action={handleCheckout}>
              <Button type="submit" size="lg">
                {copy.primaryCta}
              </Button>
            </form>
            <SecondaryCTA branch={branch} />
          </div>
          <p className="mt-7 max-w-[520px] text-base text-ink-mute">
            {copy.reassure}
          </p>
        </div>

        {stats && <RightColumn stats={stats} />}
      </div>
    </div>
  );
}
