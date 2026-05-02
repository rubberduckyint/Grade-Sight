import { SectionEyebrow } from "@/components/section-eyebrow";
import { SerifHeadline } from "@/components/serif-headline";
import { AddKeyButton } from "./add-key-button";

export function KeyLibraryHeader() {
  return (
    <header className="mb-10 flex items-end justify-between">
      <div>
        <SectionEyebrow>Library</SectionEyebrow>
        <div className="mt-3">
          <SerifHeadline level="page" as="h1">Keys</SerifHeadline>
        </div>
        <p className="mt-2 text-base text-ink-soft max-w-[640px]">
          Upload a key once, reuse it across periods.
        </p>
      </div>
      <AddKeyButton />
    </header>
  );
}
