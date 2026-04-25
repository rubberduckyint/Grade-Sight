import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/page-container";

export default function Loading() {
  return (
    <PageContainer>
      <Skeleton className="h-4 w-32 bg-paper-deep" />
      <Skeleton className="mt-6 h-12 w-2/3 bg-paper-deep" />
      <Skeleton className="mt-10 h-4 w-full bg-paper-deep" />
      <Skeleton className="mt-3 h-4 w-5/6 bg-paper-deep" />
      <Skeleton className="mt-3 h-4 w-3/4 bg-paper-deep" />
    </PageContainer>
  );
}
