import Link from "@/components/link";
import { cn, money } from "@/lib/utils";

/** A percent, or a dash when there's nothing to divide by. */
export function pctText(v: number | null | undefined, digits = 1) {
  return v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(digits)}%`;
}

/** Money that's red below zero. */
export function Signed({ value, whole = true, className }: { value: number; whole?: boolean; className?: string }) {
  return <span className={cn("tabular-nums", value < -0.004 && "text-rose-700", className)}>{money(value, whole)}</span>;
}

/** Little pill links for a report's filters (?key=value). */
export function Chips({
  base,
  param,
  value,
  options,
  keep,
}: {
  base: string;
  param: string;
  value: string;
  options: { value: string; label: string }[];
  keep?: Record<string, string | undefined>;
}) {
  const href = (v: string) => {
    const q = new URLSearchParams();
    for (const [k, x] of Object.entries(keep ?? {})) if (x) q.set(k, x);
    if (v) q.set(param, v);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  return (
    <span className="no-print inline-flex flex-wrap gap-1">
      {options.map((o) => (
        <Link
          key={o.value}
          href={href(o.value)}
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
            o.value === value ? "border-blue-700 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
          )}
        >
          {o.label}
        </Link>
      ))}
    </span>
  );
}

/** A short explanation under a report's controls. */
export function Explain({ children }: { children: React.ReactNode }) {
  return <p className="max-w-4xl text-xs leading-relaxed text-slate-500">{children}</p>;
}

/** A report's card: its controls across the top, its explanation under them, then the table. */
export const reportCard = "rounded-xl border border-slate-200 bg-white shadow-sm print:border-0 print:shadow-none";
export const reportHead = "no-print flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5";
export const reportNote = "border-b border-slate-100 px-4 py-2";
