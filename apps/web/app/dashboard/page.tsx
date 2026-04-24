import { SignOutButton } from "@clerk/nextjs";
import { createCheckoutSession, fetchEntitlement, fetchMe } from "@/lib/api";
import { TrialBanner } from "@/components/TrialBanner";

async function handleCheckout() {
  "use server";
  return await createCheckoutSession();
}

export default async function DashboardPage() {
  const [user, entitlement] = await Promise.all([fetchMe(), fetchEntitlement()]);

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p>Loading…</p>
      </main>
    );
  }

  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;

  const showBanner =
    entitlement?.status === "trialing" &&
    entitlement.trial_ends_at !== null &&
    (new Date(entitlement.trial_ends_at).getTime() - Date.now()) /
      (1000 * 60 * 60 * 24) <=
      7;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      {showBanner && entitlement?.trial_ends_at && (
        <div className="w-full max-w-xl">
          <TrialBanner
            trialEndsAt={entitlement.trial_ends_at}
            onCheckout={handleCheckout}
          />
        </div>
      )}
      <div className="text-center">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="mt-2 text-lg">
          Logged in as <strong>{displayName}</strong> ({user.role})
        </p>
        {user.organization && (
          <p className="text-sm text-gray-600">
            Organization: {user.organization.name}
          </p>
        )}
      </div>
      <SignOutButton />
    </main>
  );
}
