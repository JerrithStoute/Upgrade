import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  meta,
  actionsClassName,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  meta?: React.ReactNode;
  /** e.g. "hidden md:flex" — buttons only on bigger screens. */
  actionsClassName?: string;
}) {
  return (
    <div className="mb-4 no-print md:mb-6">
      {breadcrumbs?.length ? (
        <nav className="mb-2 flex items-center gap-1 text-xs text-slate-500">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 ? <ChevronRight className="h-3 w-3" /> : null}
              {b.href ? (
                <Link href={b.href} className="hover:text-slate-800">
                  {b.label}
                </Link>
              ) : (
                <span>{b.label}</span>
              )}
            </span>
          ))}
        </nav>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight md:text-2xl text-slate-900">
            {title}
            {meta}
          </h1>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        {actions ? <div className={cn("flex flex-wrap items-center gap-2", actionsClassName)}>{actions}</div> : null}
      </div>
    </div>
  );
}
