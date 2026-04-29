import { SignUp } from "@clerk/nextjs";
import { PageContainer } from "@/components/page-container";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";
import { gradeSightClerk } from "@/lib/clerk-appearance";

export default function TeacherSignUpPage() {
  return (
    <PageContainer className="max-w-[480px] md:py-24">
      <SectionEyebrow>For teachers</SectionEyebrow>
      <div className="mt-4 mb-3">
        <SerifHeadline level="page" as="h1">
          Diagnostic grading for your whole class.
        </SerifHeadline>
      </div>
      <p className="mb-8 text-base leading-snug text-ink-soft">
        Upload assessments. Grade Sight categorizes each error by kind, so
        you can see which students need re-teaching versus practice.
      </p>
      <SignUp
        appearance={gradeSightClerk}
        unsafeMetadata={{ role: "teacher" }}
        signInUrl="/sign-in"
      />
    </PageContainer>
  );
}
