import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Level = "display" | "page" | "greeting" | "section" | "card";
const sizeMap: Record<Level, string> = {
  display: "text-7xl leading-[1.02] tracking-[-0.025em]",
  greeting: "text-5xl leading-tight tracking-[-0.02em]",
  page: "text-3xl leading-tight tracking-[-0.02em]",
  section: "text-2xl leading-snug tracking-[-0.02em]",
  card: "text-xl leading-snug",
};

export function SerifHeadline({
  level = "page",
  children,
  className,
  as: As = "h1",
}: {
  level?: Level;
  children: ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3" | "h4";
}) {
  return (
    <As className={cn("font-serif font-normal text-ink", sizeMap[level], className)}>
      {children}
    </As>
  );
}
