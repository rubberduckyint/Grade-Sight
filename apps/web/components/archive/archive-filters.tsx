// apps/web/components/archive/archive-filters.tsx
"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const OPTIONS = [
  { value: "all", label: "All time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "year", label: "This year" },
];

function computeSinceDate(value: string): string | null {
  const today = new Date();
  if (value === "all") return null;
  if (value === "year") return new Date(today.getFullYear(), 0, 1).toISOString().slice(0, 10);
  const days = Number(value);
  const d = new Date(today.getTime() - days * 86400000);
  return d.toISOString().slice(0, 10);
}

function valueFromSince(since: string | null): string {
  if (!since) return "all";
  const today = new Date();
  if (since === new Date(today.getFullYear(), 0, 1).toISOString().slice(0, 10)) return "year";
  const sinceDate = new Date(since + "T00:00:00Z");
  const days = Math.round((today.getTime() - sinceDate.getTime()) / 86400000);
  if (days <= 8) return "7";
  if (days <= 31) return "30";
  return "90";
}

export function ArchiveFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const since = sp.get("since");
  const value = valueFromSince(since);

  function onChange(v: string) {
    const newSince = computeSinceDate(v);
    const params = new URLSearchParams(sp.toString());
    if (newSince) params.set("since", newSince);
    else params.delete("since");
    router.push(`/assessments${params.toString() ? "?" + params.toString() : ""}`);
  }

  return (
    <div className="mb-6 flex items-center gap-3">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Date" />
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
