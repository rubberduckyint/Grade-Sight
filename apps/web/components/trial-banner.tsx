"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SectionEyebrow } from "./section-eyebrow";
import { cn } from "@/lib/utils";

export interface TrialBannerProps {
  daysRemaining: number;
  role: "parent" | "teacher";
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

const toneStyles: Record<Tone, { wrap: string; eyebrow: string; rule: string }> = {
  calm: {
    wrap: "bg-paper-soft border-rule-soft",
    eyebrow: "text-ink-mute",
    rule: "border-l-2 border-rule",
  },
  insight: {
    wrap: "bg-insight-soft border-rule-soft",
    eyebrow: "text-insight-text",
    rule: "border-l-2 border-insight",
  },
  urgent: {
    wrap: "bg-paper-deep border-rule",
    eyebrow: "text-mark",
    rule: "border-l-2 border-mark",
  },
};

function bannerCopy(role: "parent" | "teacher", days: number): { eyebrow: string; line: string } {
  const eyebrow =
    days <= 1 ? "Trial ends tomorrow" : days <= 3 ? "Trial ending soon" : "Trial reminder";
  const noun = role === "parent" ? "your diagnoses" : "your class diagnostics";
  const line =
    days <= 0
      ? `Your trial ended. Add a card to keep ${noun} going.`
      : days === 1
        ? `Your trial ends tomorrow. Add a card to keep ${noun} going.`
        : `Your trial ends in ${days} days. Keep ${noun} going for $${role === "parent" ? "15" : "29"}/month.`;
  return { eyebrow, line };
}

export function TrialBanner({
  daysRemaining,
  role,
  dismissable = true,
  onAddCard,
  onDismiss,
}: TrialBannerProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const tone = pickTone(daysRemaining);
  if (tone === null) return null;

  const styles = toneStyles[tone];
  const copy = bannerCopy(role, daysRemaining);
  const canDismiss = dismissable && daysRemaining > 1;

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
        "flex w-full items-start justify-between gap-6 rounded-[var(--radius-sm)] border px-5 py-4",
        styles.wrap,
        styles.rule,
      )}
      role={tone === "urgent" ? "alert" : "status"}
    >
      <div className="min-w-0 flex-1">
        <SectionEyebrow className={styles.eyebrow}>{copy.eyebrow}</SectionEyebrow>
        <p className="mt-2 text-base leading-snug text-ink">{copy.line}</p>
        {error && (
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.12em] text-mark">
            {error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canDismiss && onDismiss && (
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Not now
          </Button>
        )}
        <Button onClick={handleClick} disabled={isPending}>
          {isPending ? "Redirecting…" : "Add card"}
        </Button>
      </div>
    </div>
  );
}
