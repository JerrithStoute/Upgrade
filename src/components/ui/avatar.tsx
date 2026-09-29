import { cn, initials } from "@/lib/utils";

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-700",
        className,
      )}
      title={name}
    >
      {initials(name)}
    </span>
  );
}
