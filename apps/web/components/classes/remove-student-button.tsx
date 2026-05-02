"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { removeStudentFromClass } from "@/lib/actions";

export function RemoveStudentButton({
  classId,
  studentId,
  studentName,
}: {
  classId: string;
  studentId: string;
  studentName: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onClick() {
    if (!window.confirm(`Remove ${studentName} from this class?`)) return;
    startTransition(async () => {
      try {
        await removeStudentFromClass(classId, studentId);
        router.refresh();
      } catch {
        toast.error("Couldn't remove the student — try again.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute hover:text-mark disabled:opacity-50"
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}
