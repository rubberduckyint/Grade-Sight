"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateClass } from "@/lib/actions";

export function ArchiveClassButton({ classId }: { classId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onClick() {
    if (!window.confirm("Archive this class? You can restore it later.")) return;
    startTransition(async () => {
      try {
        await updateClass(classId, { archived: true });
        router.push("/classes");
      } catch {
        toast.error("Couldn't archive the class — try again.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded-[var(--radius-sm)] border border-mark px-4 py-2 text-sm text-mark hover:bg-mark hover:text-paper disabled:opacity-50"
    >
      {pending ? "Archiving…" : "Archive"}
    </button>
  );
}
