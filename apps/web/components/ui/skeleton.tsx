import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-[var(--radius-sm)] bg-paper-deep", className)}
      {...props}
    />
  )
}

export { Skeleton }
