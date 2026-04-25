import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[1000px] px-6 py-12 md:px-10 md:py-20", className)}>
      {children}
    </div>
  );
}
