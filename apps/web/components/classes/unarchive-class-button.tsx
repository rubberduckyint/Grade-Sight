"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateClass } from "@/lib/actions";

export function UnarchiveClassButton({ classId }: { classId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onClick() {
    startTransition(async () => {
      try {
        await updateClass(classId, { archived: false });
        router.refresh();
      } catch {
        toast.error("Couldn't unarchive — try again.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded-[var(--radius-sm)] bg-ink px-4 py-2 text-sm text-paper disabled:opacity-50"
    >
      {pending ? "Restoring…" : "Unarchive"}
    </button>
  );
}
