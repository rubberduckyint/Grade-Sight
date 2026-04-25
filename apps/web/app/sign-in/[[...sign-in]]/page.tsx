import { SignIn } from "@clerk/nextjs";
import { PageContainer } from "@/components/page-container";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";
import { gradeSightClerk } from "@/lib/clerk-appearance";

export default function SignInPage() {
  return (
    <PageContainer className="max-w-[480px] md:py-24">
      <SectionEyebrow>Welcome back</SectionEyebrow>
      <div className="mt-4 mb-8">
        <SerifHeadline level="page" as="h1">
          Sign in to Grade Sight.
        </SerifHeadline>
      </div>
      <SignIn appearance={gradeSightClerk} />
    </PageContainer>
  );
}
