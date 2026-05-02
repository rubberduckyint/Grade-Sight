import Link from "next/link";

import { PageContainer } from "@/components/page-container";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";

export default function AccountDeletedPage() {
  return (
    <PageContainer className="py-24">
      <SectionEyebrow>Account deleted</SectionEyebrow>
      <div className="mt-3 mb-6">
        <SerifHeadline level="page" as="h1">Your account is gone.</SerifHeadline>
      </div>
      <p className="max-w-[640px] text-base text-ink-soft">
        Your data will be permanently removed within 30 days. If this was a
        mistake, email support@gradesight.com within that window to restore
        the account.
      </p>
      <div className="mt-10">
        <Link
          href="/"
          className="font-mono text-xs uppercase tracking-[0.12em] text-accent"
        >
          Back to home →
        </Link>
      </div>
    </PageContainer>
  );
}
