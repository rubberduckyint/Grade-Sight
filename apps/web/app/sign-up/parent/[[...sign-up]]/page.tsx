import { SignUp } from "@clerk/nextjs";
import { PageContainer } from "@/components/page-container";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";
import { gradeSightClerk } from "@/lib/clerk-appearance";

export default function ParentSignUpPage() {
  return (
    <PageContainer className="max-w-[480px] md:py-24">
      <SectionEyebrow>For parents</SectionEyebrow>
      <div className="mt-4 mb-3">
        <SerifHeadline level="page" as="h1">
          See exactly where your kid is getting stuck.
        </SerifHeadline>
      </div>
      <p className="mb-8 text-lg leading-snug text-ink-soft">
        Snap a photo of any quiz or assignment. Grade Sight tells you which
        kind of mistake they made — so your next conversation is about the
        right thing.
      </p>
      <SignUp
        appearance={gradeSightClerk}
        unsafeMetadata={{ role: "parent" }}
        signInUrl="/sign-in"
      />
    </PageContainer>
  );
}
