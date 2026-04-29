"use client";

import { useEffect, useState } from "react";
import { PageContainer } from "@/components/page-container";
import { Skeleton } from "@/components/ui/skeleton";

const DELAY_MS = 200;

export default function Loading() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  return (
    <PageContainer>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-6 h-12 w-2/3" />
      <Skeleton className="mt-10 h-4 w-full" />
      <Skeleton className="mt-3 h-4 w-5/6" />
      <Skeleton className="mt-3 h-4 w-3/4" />
    </PageContainer>
  );
}
