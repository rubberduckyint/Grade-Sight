"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { runDiagnostic } from "@/lib/actions";

export interface RunDiagnosticButtonProps {
  id: string;
  variant?: "initial" | "rerun";
  size?: "default" | "lg";
}

export function RunDiagnosticButton({
  id,
  variant = "initial",
  size = "lg",
}: RunDiagnosticButtonProps) {
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

  const idleLabel = variant === "rerun" ? "Re-run" : "Run diagnostic";
  const pendingLabel =
    variant === "rerun" ? "Re-running — about 30 seconds…" : "Diagnosing — about 30 seconds…";

  return (
    <div>
      <Button
        type="button"
        size={size}
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? pendingLabel : idleLabel}
      </Button>
      {error && (
        <p className="mt-3 font-mono text-xs uppercase tracking-[0.12em] text-mark">
          {error}
        </p>
      )}
    </div>
  );
}
