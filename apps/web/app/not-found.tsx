import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/page-container";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";

export default function NotFound() {
  return (
    <PageContainer className="max-w-[640px]">
      <SectionEyebrow>404 · Not here</SectionEyebrow>
      <div className="mt-4 mb-4">
        <SerifHeadline level="page" as="h1">
          That page doesn&apos;t exist.
        </SerifHeadline>
      </div>
      <p className="mb-8 text-base text-ink-soft">
        Maybe the link is old, maybe we moved it. Your data is safe either way.
      </p>
      <Button asChild>
        <Link href="/">Go home</Link>
      </Button>
    </PageContainer>
  );
}
