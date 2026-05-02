// apps/web/components/privacy/what-we-keep-section.tsx
export function WhatWeKeepSection({
  eyebrow,
  title,
  body,
  divider,
}: {
  eyebrow: string;
  title: string;
  body: string;
  divider: boolean;
}) {
  return (
    <div className={`grid grid-cols-1 gap-6 py-8 md:grid-cols-[180px_1fr] md:gap-12 ${divider ? "border-b border-rule-soft" : ""}`}>
      <div className="pt-1 font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
        {eyebrow}
      </div>
      <div>
        <p className="font-serif text-2xl font-medium leading-tight tracking-[-0.012em] text-ink">
          {title}
        </p>
        <p className="mt-3 max-w-[600px] font-serif text-lg leading-relaxed text-ink-soft">
          {body}
        </p>
      </div>
    </div>
  );
}
