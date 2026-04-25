import { redirect } from "next/navigation";
import { createCheckoutSession, fetchEntitlement, fetchMe } from "@/lib/api";
import { PageContainer } from "@/components/page-container";
import { SerifHeadline } from "@/components/serif-headline";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { Button } from "@/components/ui/button";

async function handleCheckout() {
  "use server";
  const url = await createCheckoutSession();
  redirect(url);
}

type Branch = "trial-ended" | "canceled" | "past-due";

function branchFromEntitlement(status: string | null | undefined): Branch {
  if (status === "past_due") return "past-due";
  if (status === "canceled") return "canceled";
  return "trial-ended";
}

const BRANCHES: Record<Branch, { eyebrow: string; headline: string; body: string; cta: string }> = {
  "trial-ended": {
    eyebrow: "Trial ended",
    headline: "Your trial ended yesterday.",
    body: "Add a card and pick up exactly where you left off.",
    cta: "Add a card",
  },
  canceled: {
    eyebrow: "Canceled",
    headline: "You canceled.",
    body: "We kept everything. Resubscribe whenever it's useful — same price, same data.",
    cta: "Resubscribe",
  },
  "past-due": {
    eyebrow: "Payment failed",
    headline: "Your last payment bounced.",
    body: "Update your card and we'll try again.",
    cta: "Update card",
  },
};

export default async function PaywallPage() {
  const [user, entitlement] = await Promise.all([fetchMe(), fetchEntitlement()]);
  if (!user) redirect("/sign-in");
  if (entitlement?.is_entitled) redirect("/dashboard");

  const branch = branchFromEntitlement(entitlement?.status);
  const copy = BRANCHES[branch];

  return (
    <PageContainer className="max-w-[640px] md:py-32">
      <SectionEyebrow>{copy.eyebrow}</SectionEyebrow>
      <div className="mt-4 mb-4">
        <SerifHeadline level="page" as="h1">
          {copy.headline}
        </SerifHeadline>
      </div>
      <p className="mb-10 text-lg leading-snug text-ink-soft">{copy.body}</p>
      <form action={handleCheckout}>
        <Button type="submit" size="lg">{copy.cta}</Button>
      </form>
    </PageContainer>
  );
}
