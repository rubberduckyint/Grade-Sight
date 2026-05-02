"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { deleteAnswerKey } from "@/lib/actions";

export function DeleteKeyButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);
  const router = useRouter();

  function onClick() {
    if (!window.confirm("Delete this answer key? This cannot be undone.")) {
      return;
    }
    setConfirmed(true);
    startTransition(async () => {
      try {
        await deleteAnswerKey(id);
        toast.success("Answer key deleted.");
        router.push("/keys");
      } catch {
        setConfirmed(false);
        toast.error("Couldn't delete the answer key — try again.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending || confirmed}
      className="rounded-[var(--radius-sm)] border border-mark px-5 py-2.5 font-sans text-sm text-mark hover:bg-mark hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mark disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Deleting…" : "Delete answer key"}
    </button>
  );
}
