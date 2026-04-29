// Dashboard-specific skeleton. Mirrors the Step 05 layout structure
// (eyebrow → greeting → step grid) so the loading state doesn't shift
// the page when the real content arrives.

import { PageContainer } from "@/components/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <PageContainer>
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-5 h-12 w-3/4 max-w-[640px]" />
      <Skeleton className="mt-3 h-12 w-2/3 max-w-[560px]" />
      <Skeleton className="mt-6 h-4 w-full max-w-[580px]" />
      <Skeleton className="mt-2 h-4 w-5/6 max-w-[520px]" />

      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Skeleton className="h-[200px]" />
        <Skeleton className="h-[200px]" />
        <Skeleton className="h-[200px]" />
      </div>
    </PageContainer>
  );
}
