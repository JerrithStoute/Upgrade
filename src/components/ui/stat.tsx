import { cn } from "@/lib/utils";

export function Stat({
  label,
  value,
  hint,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "good" | "bad" | "warn";
  className?: string;
}) {
  const tones = {
    default: "text-slate-900",
    good: "text-emerald-700",
    bad: "text-rose-700",
    warn: "text-amber-700",
  };
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums tracking-tight", tones[tone])}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
