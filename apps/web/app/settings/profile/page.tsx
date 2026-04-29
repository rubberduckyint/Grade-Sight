import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";

export default function ProfilePage() {
  return (
    <>
      <SectionEyebrow>Settings · Profile</SectionEyebrow>
      <div className="mt-3 mb-6">
        <SerifHeadline level="page" as="h1">
          Profile
        </SerifHeadline>
      </div>
      <p className="text-base text-ink-soft">
        Coming soon — this lands in Step 13.
      </p>
    </>
  );
}
