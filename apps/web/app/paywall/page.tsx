import { redirect } from "next/navigation";
import { createCheckoutSession, createPortalSession, fetchEntitlement } from "@/lib/api";

export default async function PaywallPage() {
  const entitlement = await fetchEntitlement();

  let title = "Subscription required";
  let body = "Your access has ended.";
  let action: "checkout" | "portal" = "checkout";

  if (entitlement) {
    if (entitlement.status === "canceled") {
      if (entitlement.current_period_end === null && entitlement.trial_ends_at !== null) {
        title = "Your trial has ended";
        body = "Add a card to reactivate your subscription.";
        action = "checkout";
      } else {
        title = "Your subscription was canceled";
        body = "Reactivate through the Customer Portal.";
        action = "portal";
      }
    } else if (entitlement.status === "past_due") {
      title = "Payment issue detected";
      body = "Please update your payment method.";
      action = "portal";
    }
  }

  async function handleAction() {
    "use server";
    const url =
      action === "checkout"
        ? await createCheckoutSession()
        : await createPortalSession();
    redirect(url);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center p-8 text-center">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="mt-3 text-lg text-gray-600">{body}</p>
      <form action={handleAction}>
        <button
          type="submit"
          className="mt-8 rounded-lg bg-black px-6 py-3 text-base font-medium text-white hover:bg-gray-800"
        >
          {action === "checkout" ? "Add card" : "Manage billing"}
        </button>
      </form>
    </main>
  );
}
