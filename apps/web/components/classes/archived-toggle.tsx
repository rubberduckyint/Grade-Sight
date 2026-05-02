"use client";
import { useRouter, useSearchParams } from "next/navigation";

export function ArchivedToggle({ includeArchived }: { includeArchived: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();

  function toggle() {
    const params = new URLSearchParams(sp.toString());
    if (includeArchived) params.delete("include_archived");
    else params.set("include_archived", "true");
    const qs = params.toString();
    router.push(`/classes${qs ? "?" + qs : ""}`);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="font-mono text-xs uppercase tracking-[0.12em] text-ink-mute hover:text-ink"
    >
      {includeArchived ? "Hide archived" : "Show archived"}
    </button>
  );
}
