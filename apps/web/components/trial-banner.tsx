"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface TrialBannerProps {
  daysRemaining: number;
  role: "parent" | "teacher";
  priceLabel: string;
  dismissable?: boolean;
  onAddCard: () => Promise<string> | void;
  onDismiss?: () => void;
}

type Tone = "calm" | "insight" | "urgent";

function pickTone(days: number): Tone | null {
  if (days > 7) return null;
  if (days >= 4) return "calm";
  if (days >= 2) return "insight";
  return "urgent";
}

const toneStyles: Record<Tone, { wrap: string; eyebrow: string }> = {
  calm: {
    wrap: "bg-paper-soft border-b-rule",
    eyebrow: "text-ink-mute",
  },
  insight: {
    wrap: "bg-insight-soft border-b-rule",
    eyebrow: "text-ink-mute",
  },
  urgent: {
    wrap: "bg-paper-deep border-b-insight",
    eyebrow: "text-mark",
  },
};

function eyebrowLabel(tone: Tone, role: "parent" | "teacher"): string {
  const core = tone === "urgent" ? "LAST DAY" : tone === "insight" ? "≤ 3 DAYS" : "≤ 7 DAYS";
  return role === "teacher" ? `TEACHER · ${core}` : core;
}

function bodyCopy(
  tone: Tone,
  role: "parent" | "teacher",
  days: number,
  priceLabel: string,
): { daysPhrase: string; tail: string } {
  if (tone === "urgent") {
    return {
      daysPhrase: "Your trial ends today.",
      tail: "Add a card now and nothing changes. Otherwise you'll lose access tomorrow.",
    };
  }
  if (tone === "insight") {
    const noun = role === "parent" ? "your diagnoses and interventions" : "your class pulse";
    return {
      daysPhrase: `Your trial ends in ${days} days.`,
      tail: `Keep ${noun} going for ${priceLabel}.`,
    };
  }
  if (role === "teacher") {
    return {
      daysPhrase: `Trial ends in ${days} days.`,
      tail: `${priceLabel} keeps your seat and your class pulse. Cancel anytime.`,
    };
  }
  return {
    daysPhrase: `Your trial ends in ${days} days.`,
    tail: `Add a card whenever you're ready — ${priceLabel}, cancel anytime.`,
  };
}

export function TrialBanner({
  daysRemaining,
  role,
  priceLabel,
  dismissable = true,
  onAddCard,
  onDismiss,
}: TrialBannerProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const tone = pickTone(daysRemaining);
  if (tone === null) return null;

  const styles = toneStyles[tone];
  const label = eyebrowLabel(tone, role);
  const { daysPhrase, tail } = bodyCopy(tone, role, daysRemaining, priceLabel);
  const canDismiss = dismissable && tone !== "urgent" && Boolean(onDismiss);

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      try {
        const url = await onAddCard();
        if (typeof url === "string") window.location.assign(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start checkout");
      }
    });
  };

  return (
    <div
      className={cn(
        "flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-b border-t-rule-soft px-7 py-4",
        styles.wrap,
      )}
      role={tone === "urgent" ? "alert" : "status"}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
        <span
          className={cn(
            "font-mono text-xs uppercase tracking-[0.12em]",
            styles.eyebrow,
          )}
        >
          {label}
        </span>
        <p className="text-base leading-snug text-ink">
          <span className="font-serif italic">{daysPhrase}</span>{" "}
          {tail}
        </p>
        {error && (
          <p className="basis-full font-mono text-xs uppercase tracking-[0.12em] text-mark">
            {error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {canDismiss && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-base text-ink-soft hover:text-ink"
          >
            Dismiss
          </button>
        )}
        <Button onClick={handleClick} disabled={isPending}>
          {isPending ? "Redirecting…" : "Add card"}
        </Button>
      </div>
    </div>
  );
}
