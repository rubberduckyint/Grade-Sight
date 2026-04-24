import Link from "next/link";
import { redirect } from "next/navigation";
import { createPortalSession, fetchEntitlement } from "@/lib/api";

const PLAN_LABELS: Record<string, string> = {
  parent_monthly: "Parent Monthly — $15/month",
  teacher_monthly: "Teacher Monthly — $25/month",
};

const STATUS_LABELS: Record<string, string> = {
  trialing: "Trial",
  active: "Active",
  past_due: "Payment overdue",
  canceled: "Canceled",
  incomplete: "Incomplete setup",
};

export default async function BillingSettingsPage() {
  const entitlement = await fetchEntitlement();

  if (!entitlement || entitlement.status === null) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="mt-4 text-gray-600">No subscription found.</p>
      </main>
    );
  }

  const planLabel = entitlement.plan ? PLAN_LABELS[entitlement.plan] ?? entitlement.plan : "—";
  const statusLabel = STATUS_LABELS[entitlement.status] ?? entitlement.status;
  const nextBilling =
    entitlement.current_period_end !== null
      ? new Date(entitlement.current_period_end).toLocaleDateString()
      : entitlement.trial_ends_at !== null
        ? `${new Date(entitlement.trial_ends_at).toLocaleDateString()} (trial end)`
        : "—";

  async function openPortal() {
    "use server";
    const url = await createPortalSession();
    redirect(url);
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">Billing</h1>
      <dl className="mt-6 divide-y divide-gray-200 border-y border-gray-200">
        <div className="flex justify-between py-3">
          <dt className="text-sm text-gray-600">Plan</dt>
          <dd className="text-sm font-medium">{planLabel}</dd>
        </div>
        <div className="flex justify-between py-3">
          <dt className="text-sm text-gray-600">Status</dt>
          <dd className="text-sm font-medium">{statusLabel}</dd>
        </div>
        <div className="flex justify-between py-3">
          <dt className="text-sm text-gray-600">Next billing date</dt>
          <dd className="text-sm font-medium">{nextBilling}</dd>
        </div>
      </dl>
      <form action={openPortal}>
        <button
          type="submit"
          className="mt-6 rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          Manage billing (Stripe Customer Portal)
        </button>
      </form>
      <p className="mt-4 text-sm text-gray-500">
        <Link href="/dashboard" className="underline">
          ← Back to dashboard
        </Link>
      </p>
    </main>
  );
}
