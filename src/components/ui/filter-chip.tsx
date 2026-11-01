import Link from "@/components/link";
import { cn } from "@/lib/utils";

/** A status pill in the list's header — the same blue pills on Invoices and Bills. */
export function FilterChip({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        active ? "border-blue-700 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
      )}
    >
      {label}
      <span className={cn("rounded-full px-1.5 text-[10px]", active ? "bg-blue-100" : "bg-slate-100")}>{count}</span>
    </Link>
  );
}
