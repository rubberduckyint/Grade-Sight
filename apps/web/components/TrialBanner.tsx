"use client";

import { useState, useTransition } from "react";

export interface TrialBannerProps {
  daysRemaining: number;
  onCheckout: () => Promise<string>;
}

export function TrialBanner({ daysRemaining, onCheckout }: TrialBannerProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      try {
        const url = await onCheckout();
        window.location.assign(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start checkout");
      }
    });
  };

  return (
    <div className="flex w-full items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
      <div className="text-sm text-amber-900">
        Trial ends in <strong>{daysRemaining}</strong>{" "}
        {daysRemaining === 1 ? "day" : "days"}. Add a card to keep your access.
      </div>
      <div className="flex items-center gap-3">
        {error && <span className="text-xs text-red-700">{error}</span>}
        <button
          type="button"
          onClick={handleClick}
          disabled={isPending}
          className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {isPending ? "Redirecting…" : "Add card"}
        </button>
      </div>
    </div>
  );
}
