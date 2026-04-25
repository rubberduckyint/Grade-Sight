import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/page-container";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";

export default function NotFound() {
  return (
    <PageContainer className="max-w-[640px]">
      <SectionEyebrow>404</SectionEyebrow>
      <div className="mt-4 mb-4">
        <SerifHeadline level="page" as="h1">
          That page doesn&apos;t exist.
        </SerifHeadline>
      </div>
      <p className="mb-8 text-base text-ink-soft">
        Likely an old link or a typo in the address.
      </p>
      <Button asChild>
        <Link href="/">Back to home</Link>
      </Button>
    </PageContainer>
  );
}
