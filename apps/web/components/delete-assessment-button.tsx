"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { deleteAssessment } from "@/lib/actions";

export interface DeleteAssessmentButtonProps {
  id: string;
  /**
   * Where to navigate after a successful delete. If omitted, the
   * caller relies on router.refresh() to update the surrounding
   * server component (used by the dashboard list).
   */
  redirectTo?: string;
}

export function DeleteAssessmentButton({
  id,
  redirectTo,
}: DeleteAssessmentButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick(e: React.MouseEvent<HTMLButtonElement>): void {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Delete this assessment? This cannot be undone.")) {
      return;
    }
    startTransition(async () => {
      try {
        await deleteAssessment(id);
        if (redirectTo) {
          router.push(redirectTo);
        } else {
          router.refresh();
        }
      } catch {
        window.alert("Could not delete — please try again.");
      }
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      type="button"
      aria-label="Delete assessment"
      onClick={handleClick}
      disabled={isPending}
      className="text-mark hover:bg-paper-soft"
    >
      {isPending ? "Deleting…" : "× Delete"}
    </Button>
  );
}
