import Link from "@/components/link";
import { Receipt } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { portalContext, invoiceTotals } from "@/lib/portal";
import { cn, fmtDate, money, sum } from "@/lib/utils";
import { isOverdue } from "@/lib/finance";
import { EmptyState, Progress } from "@/components/ui";
import { PortalPageHeader } from "@/components/portal/page-header";

export const metadata = { title: "Invoices" };

export default async function PortalInvoicesPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const user = await requireClient();
  const { project: projectParam } = await searchParams;
  const { projects, project } = await portalContext(user.clientId, projectParam);

  if (!project) {
    return (
      <>
        <PortalPageHeader title="Invoices" projects={projects} project={null} />
        <EmptyState icon={Receipt} title="No projects yet" description="Invoices will appear here once your project is set up." />
      </>
    );
  }

  const invoices = await db.invoice.findMany({
    where: { projectId: project.id, status: { not: "DRAFT" } },
    orderBy: { number: "desc" },
    include: { items: true, payments: true },
  });
  const rows = invoices.map((inv) => ({ ...inv, ...invoiceTotals(inv) }));
  const live = rows.filter((r) => r.status !== "VOID");
  const totalInvoiced = sum(live.map((r) => r.total));
  const totalPaid = sum(live.map((r) => r.paid));
  const balance = totalInvoiced - totalPaid;
  // Still owed first (oldest due first), then the rest newest first.
  const owes = (r: (typeof rows)[number]) => r.status !== "VOID" && r.balance > 0.005;
  const ordered = [...rows.filter(owes).reverse(), ...rows.filter((r) => !owes(r))];

  return (
    <>
      <PortalPageHeader title="Invoices" description="What you've been billed and what's still due." projects={projects} project={project} />
      <div className="space-y-4">
        {rows.length === 0 ? (
          <EmptyState icon={Receipt} title="No invoices yet" description="You haven't been invoiced on this project." />
        ) : (
          <>
            <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs text-slate-500">Balance due</p>
              <p className={cn("text-2xl font-semibold tabular-nums", balance > 0.005 ? "text-amber-700" : "text-emerald-700")}>{money(balance)}</p>
              <p className="text-xs text-slate-500">
                Paid {money(totalPaid)} of {money(totalInvoiced)} billed
              </p>
              <Progress value={totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 100) : 0} className="mt-2" />
            </section>
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {ordered.map((inv) => {
                const owed = inv.status !== "VOID" && inv.balance > 0.005;
                const late = owed && isOverdue(inv);
                return (
                  <li key={inv.id}>
                    <Link
                      href={`/portal/invoices/${inv.id}`}
                      className={cn("flex items-center justify-between gap-3 px-4 py-2.5", owed ? "bg-amber-50/70 hover:bg-amber-50" : "hover:bg-slate-50", inv.status === "VOID" && "opacity-60")}
                    >
                      <span className="min-w-0">
                        <span className={cn("block truncate text-sm", owed ? "font-medium text-amber-900" : "text-slate-900")}>
                          #{inv.number} {inv.title}
                        </span>
                        <span className={cn("block text-xs", late ? "text-rose-700" : "text-slate-500")}>
                          {owed && inv.dueDate ? `Due ${fmtDate(inv.dueDate, "MMM d")}${late ? " · overdue" : ""}` : fmtDate(inv.issueDate, "MMM d, yyyy")}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={cn("block text-sm tabular-nums", owed ? "font-semibold text-amber-900" : "text-slate-900")}>{money(owed ? inv.balance : inv.total)}</span>
                        <span className={cn("block text-xs", owed ? "text-amber-800" : inv.status === "VOID" ? "text-slate-500" : "text-emerald-700")}>
                          {inv.status === "VOID" ? "Void" : owed ? (inv.paid > 0.005 ? "still due" : "due") : "Paid"}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
