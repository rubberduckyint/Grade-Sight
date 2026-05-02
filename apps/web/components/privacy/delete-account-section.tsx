// apps/web/components/privacy/delete-account-section.tsx
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";

import { DeleteAccountButton } from "./delete-account-button";

export function DeleteAccountSection({ email }: { email: string }) {
  return (
    <section className="mt-16 border-t border-rule pt-12">
      <SectionEyebrow>Your data</SectionEyebrow>
      <div className="mt-4 mb-3">
        <SerifHeadline level="section" as="h2">Delete your account.</SerifHeadline>
      </div>
      <p className="mb-8 max-w-[640px] text-base text-ink-soft">
        This removes your account, all student data, and cancels your
        subscription. We keep a 30-day grace window in case you change your
        mind, then permanently purge everything.
      </p>
      <DeleteAccountButton email={email} />
    </section>
  );
}
