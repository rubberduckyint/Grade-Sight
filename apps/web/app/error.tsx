"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/page-container";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";
import { SUPPORT_EMAIL } from "@/lib/support";

function shortCodeFromDigest(digest: string | undefined): string {
  if (!digest) return "ERR-UNKNOWN";
  return `ERR-${digest.slice(0, 4).toUpperCase()}`;
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const code = shortCodeFromDigest(error.digest);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Sentry.captureException(error);
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await navigator.clipboard.writeText(code);
        if (!cancelled) setCopied(true);
      } catch {
        // Clipboard API throws in non-secure contexts and when the page
        // lacks user activation. The code stays visible and the mailto
        // body still includes it, so silent degradation is fine.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const subject = encodeURIComponent(code);
  const body = encodeURIComponent(
    `What were you doing when this happened?\n\n[your answer here]\n\n---\nError: ${code}\nPath: ${pathname ?? "/"}`,
  );
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;

  return (
    <PageContainer className="max-w-[640px]">
      <SectionEyebrow className="text-mark tracking-[0.12em]">
        Something&apos;s off
      </SectionEyebrow>
      <div className="mt-4 mb-4">
        <SerifHeadline level="page" as="h1">
          We couldn&apos;t load this page.
        </SerifHeadline>
      </div>
      <p className="mb-8 text-base text-ink-soft">
        It&apos;s on us — not your connection. Try again, and if it keeps
        happening, tell us.
      </p>
      <div className="mb-10 flex flex-wrap gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="secondary">
          <a href={mailto}>Tell us</a>
        </Button>
      </div>
      <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-mute">
        {code}
      </p>
      {copied && (
        <p className="mt-1 font-mono text-xs uppercase tracking-[0.08em] text-ink-mute">
          Copied to clipboard.
        </p>
      )}
    </PageContainer>
  );
}
