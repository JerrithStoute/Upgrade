import Link from "@/components/link";
import { FileDiff } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { changeOrderTotals, parseDocOptions } from "@/lib/change-orders";
import { db } from "@/lib/db";
import { portalContext } from "@/lib/portal";
import { cn, fmtDate, money, sum } from "@/lib/utils";
import { EmptyState } from "@/components/ui";
import { PortalPageHeader } from "@/components/portal/page-header";

export const metadata = { title: "Change Orders" };

export default async function PortalChangeOrdersPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const user = await requireClient();
  const { project: projectParam } = await searchParams;
  const { projects, project } = await portalContext(user.clientId, projectParam);

  if (!project) {
    return (
      <>
        <PortalPageHeader title="Change Orders" projects={projects} project={null} />
        <EmptyState icon={FileDiff} title="No projects yet" description="Change orders will appear here once your project is set up." />
      </>
    );
  }

  const changeOrders = await db.changeOrder.findMany({
    where: { projectId: project.id, status: { not: "DRAFT" } },
    orderBy: { number: "desc" },
    include: { items: true },
  });
  // Days only where the paper shows them (your "What the client sees" settings).
  const rows = changeOrders.map((co) => ({ ...co, total: changeOrderTotals(co, co.items).total, days: parseDocOptions(co.docOptions).schedule ? co.scheduleImpactDays : 0 }));
  const pending = rows.filter((r) => r.status === "PENDING_APPROVAL");
  const approved = rows.filter((r) => r.status === "APPROVED");
  const days = sum(approved.map((r) => r.days));
  const ordered = [...pending, ...rows.filter((r) => r.status !== "PENDING_APPROVAL")];
  const dayText = (n: number) => (n ? ` · ${n > 0 ? "+" : ""}${n} day${Math.abs(n) === 1 ? "" : "s"}` : "");

  return (
    <>
      <PortalPageHeader title="Change orders" description="Changes to the original work." projects={projects} project={project} />
      {rows.length === 0 ? (
        <EmptyState icon={FileDiff} title="No change orders" description="There are no change orders on this project." />
      ) : (
        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex gap-6">
              <div>
                <p className="text-xs text-slate-500">Approved changes</p>
                <p className="text-xl font-semibold tabular-nums text-slate-900">{signed(sum(approved.map((r) => r.total)))}</p>
              </div>
              {days ? (
                <div>
                  <p className="text-xs text-slate-500">Schedule</p>
                  <p className="text-xl font-semibold tabular-nums text-slate-900">
                    {days > 0 ? "+" : ""}
                    {days} day{Math.abs(days) === 1 ? "" : "s"}
                  </p>
                </div>
              ) : null}
            </div>
            {pending.length ? (
              <p className="mt-1.5 text-xs font-medium text-amber-700">
                {pending.length} waiting on you · {money(sum(pending.map((r) => r.total)))}
              </p>
            ) : null}
          </section>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {ordered.map((co) => {
              const waiting = co.status === "PENDING_APPROVAL";
              const off = co.status === "DECLINED" || co.status === "VOID";
              const when = waiting
                ? `Sent ${fmtDate(co.sentAt, "MMM d")}`
                : co.status === "APPROVED"
                  ? `Approved ${fmtDate(co.decidedAt ?? co.clientApprovedAt, "MMM d")}`
                  : co.status === "DECLINED"
                    ? `Declined ${fmtDate(co.decidedAt, "MMM d")}`
                    : "Void";
              return (
                <li key={co.id}>
                  <Link
                    href={`/portal/change-orders/${co.id}`}
                    className={cn("flex items-center justify-between gap-3 px-4 py-2.5", waiting ? "bg-amber-50/70 hover:bg-amber-50" : "hover:bg-slate-50", off && "opacity-60")}
                  >
                    <span className="min-w-0">
                      <span className={cn("line-clamp-2 block text-sm", waiting ? "font-medium text-amber-900" : "text-slate-900")}>
                        #{co.number} {co.title}
                      </span>
                      <span className={cn("block text-xs", waiting ? "text-amber-800" : "text-slate-500")}>
                        {when}
                        {off ? "" : dayText(co.days)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2.5">
                      <span className="text-right">
                        <span className={cn("block text-sm tabular-nums", waiting ? "font-semibold text-amber-900" : "text-slate-900")}>{money(co.total)}</span>
                        {waiting ? null : (
                          <span className={cn("block text-xs", co.status === "APPROVED" ? "text-emerald-700" : "text-slate-500")}>
                            {co.status === "APPROVED" ? "Approved" : co.status === "DECLINED" ? "Declined" : "Void"}
                          </span>
                        )}
                      </span>
                      {waiting ? <span className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Review</span> : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

const signed = (n: number) => `${n > 0 ? "+" : ""}${money(n)}`;
