import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Server-friendly disclosure built on <details>. */
export function Collapsible({
  summary,
  children,
  defaultOpen,
  className,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details className={cn("group rounded-xl border border-slate-200 bg-white shadow-sm", className)} open={defaultOpen}>
      <summary className="flex cursor-pointer select-none items-center justify-between px-5 py-3 text-sm font-medium text-slate-800 [&::-webkit-details-marker]:hidden">
        <span>{summary}</span>
        <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-slate-100 px-5 py-4">{children}</div>
    </details>
  );
}
