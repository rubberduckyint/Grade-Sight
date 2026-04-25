import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SerifHeadline } from "./serif-headline";

type EmptyStateAction =
  | { actionLabel: string; onAction: () => void }
  | { actionLabel?: never; onAction?: never };

type EmptyStateProps = {
  title: string;
  body: string;
  eyebrow?: ReactNode;
} & EmptyStateAction;

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  eyebrow,
}: EmptyStateProps) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-rule bg-paper px-10 py-16 text-center">
      {eyebrow && <div className="mb-4">{eyebrow}</div>}
      <SerifHeadline level="card" as="h2">
        {title}
      </SerifHeadline>
      <p className="mx-auto mt-4 max-w-[480px] text-base leading-normal text-ink-soft">
        {body}
      </p>
      {actionLabel && onAction && (
        <div className="mt-8">
          <Button onClick={onAction}>{actionLabel}</Button>
        </div>
      )}
    </div>
  );
}
