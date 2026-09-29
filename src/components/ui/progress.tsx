import { cn } from "@/lib/utils";

export function Progress({ value, className, color }: { value: number; className?: string; color?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-100", className)}>
      <div className="h-full rounded-full bg-blue-600" style={{ width: `${v}%`, backgroundColor: color }} />
    </div>
  );
}
