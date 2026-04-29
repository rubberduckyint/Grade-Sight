import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionEyebrow } from "./section-eyebrow";
import { SerifHeadline } from "./serif-headline";

export interface PaywallInlineProps {
  feature: string;
  body?: string;
  onAddCard: () => Promise<void>;
  onDismiss?: () => void;
  children?: ReactNode;
}

export function PaywallInline({
  feature,
  body,
  onAddCard,
  onDismiss,
  children,
}: PaywallInlineProps) {
  return (
    <div className="space-y-6">
      {children && (
        <div aria-hidden={true} className="pointer-events-none opacity-60">
          {children}
        </div>
      )}
      <Card className="border-rule bg-paper-soft shadow-none">
        <CardContent className="p-8">
          <SectionEyebrow>Trial feature</SectionEyebrow>
          <div className="mt-3 mb-3">
            <SerifHeadline level="card" as="h3">
              {feature} is part of the full plan.
            </SerifHeadline>
          </div>
          <p className="mb-6 text-base text-ink-soft">
            {body ??
              "Add a card to keep using diagnostic features. We won't charge you until your trial ends."}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <form action={onAddCard}>
              <Button type="submit">Add card</Button>
            </form>
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="text-base text-ink-soft hover:text-ink"
              >
                Not now
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
