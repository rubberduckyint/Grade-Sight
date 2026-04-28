"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/page-container";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <PageContainer className="max-w-[640px]">
      <SectionEyebrow>Something went wrong</SectionEyebrow>
      <div className="mt-4 mb-4">
        <SerifHeadline level="page" as="h1">
          We couldn&apos;t load that.
        </SerifHeadline>
      </div>
      <p className="mb-8 text-base text-ink-soft">
        The error has been logged. Try once more — if it sticks, let us know
        and include the reference below.
      </p>
      {error.digest && (
        <p className="mb-8 font-mono text-xs uppercase tracking-[0.12em] text-ink-mute">
          Reference: {error.digest}
        </p>
      )}
      <Button onClick={reset}>Try again</Button>
    </PageContainer>
  );
}
