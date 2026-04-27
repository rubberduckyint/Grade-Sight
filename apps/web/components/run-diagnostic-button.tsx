"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { runDiagnostic } from "@/lib/actions";

export interface RunDiagnosticButtonProps {
  id: string;
}

export function RunDiagnosticButton({ id }: RunDiagnosticButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick(): void {
    setError(null);
    startTransition(async () => {
      try {
        await runDiagnostic(id);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Diagnostic failed");
      }
    });
  }

  return (
    <div>
      <Button
        type="button"
        size="lg"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? "Diagnosing — about 30 seconds…" : "Run diagnostic"}
      </Button>
      {error && (
        <p className="mt-3 font-mono text-xs uppercase tracking-[0.12em] text-mark">
          {error}
        </p>
      )}
    </div>
  );
}
