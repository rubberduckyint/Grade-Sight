import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionEyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono text-xs uppercase tracking-[0.14em] text-ink-mute",
        className,
      )}
    >
      {children}
    </span>
  );
}
