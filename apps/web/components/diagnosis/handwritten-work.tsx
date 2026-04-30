import { cn } from "@/lib/utils";

export function HandwrittenWork({
  lines,
  className,
}: {
  lines: string[];
  className?: string;
}) {
  const flat = lines.join(" ");
  return (
    <div
      aria-label={`Student work: ${flat}`}
      className={cn(
        "font-hand text-[1.667rem] leading-[1.4] tracking-[0.01em] text-ink-soft",
        className,
      )}
    >
      {lines.map((line, i) => (
        <div key={i} className="whitespace-pre">
          {line}
        </div>
      ))}
    </div>
  );
}
