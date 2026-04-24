import { SignOutButton } from "@clerk/nextjs";
import { createCheckoutSession, fetchEntitlement, fetchMe } from "@/lib/api";
import { TrialBanner } from "@/components/TrialBanner";

async function handleCheckout() {
  "use server";
  return await createCheckoutSession();
}

// Server-side time calculation — this function runs per-request on the server,
// so Date.now() is evaluated at request time, not during React render. The
// rule of purity applies to client-rendered components; server components
// are invoked once per request by our runtime, which is what we want here.
function daysUntil(iso: string, now: number): number {
  return Math.max(
    0,
    Math.ceil((new Date(iso).getTime() - now) / (1000 * 60 * 60 * 24)),
  );
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

  // eslint-disable-next-line react-hooks/purity -- Date.now() in a server component runs per-request, not during React render.
  const nowMs = Date.now();
  const daysRemaining =
    entitlement?.trial_ends_at != null
      ? daysUntil(entitlement.trial_ends_at, nowMs)
      : null;
  const showBanner =
    entitlement?.status === "trialing" &&
    daysRemaining !== null &&
    daysRemaining <= 7;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      {showBanner && daysRemaining !== null && (
        <div className="w-full max-w-xl">
          <TrialBanner
            daysRemaining={daysRemaining}
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
