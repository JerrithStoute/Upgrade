import { cn, titleCase } from "@/lib/utils";
import { STATUS_STYLES } from "@/lib/constants";

export function Badge({
  status,
  children,
  className,
}: {
  status?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const style = status ? STATUS_STYLES[status] : undefined;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        style ?? "bg-slate-100 text-slate-700 ring-slate-200",
        className,
      )}
    >
      {children ?? (status ? titleCase(status) : "")}
    </span>
  );
}
