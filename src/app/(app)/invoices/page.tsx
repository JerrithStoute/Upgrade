import Link from "@/components/link";
import { subDays } from "date-fns";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { INVOICE_STATUSES } from "@/lib/constants";
import { cn, fmtDate, money, titleCase } from "@/lib/utils";
import { invoiceTotal, isOverdue, paymentsTotal } from "@/lib/finance";
import { Badge } from "@/components/ui";
import { Tile } from "@/components/ui/tile";
import { ListFind } from "@/components/list-find";
import { FilterChip } from "@/components/ui/filter-chip";
import { companyClock } from "@/lib/company-zone";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireView("invoices");
  const { status } = await searchParams;
  const statusFilter = (INVOICE_STATUSES as readonly string[]).includes(status ?? "") ? status! : "";

  const invoices = await db.invoice.findMany({
    orderBy: [{ issueDate: "desc" }, { number: "desc" }],
    include: { items: true, payments: true, project: { select: { id: true, number: true, name: true, client: { select: { firstName: true, lastName: true } } } } },
  });
  const now = (await companyClock()).now; // now, on the company's clock (for due / overdue)
  const rows = invoices.map((inv) => {
    const total = invoiceTotal(inv.items);
    const paid = paymentsTotal(inv.payments);
    return { ...inv, total, paid, balance: inv.status === "VOID" ? 0 : total - paid, overdue: isOverdue(inv, now) };
  });
  const open = rows.filter((r) => r.status === "SENT" || r.status === "PARTIAL");
  const outstanding = open.reduce((s, r) => s + r.balance, 0);
  const overdueRows = open.filter((r) => r.overdue);
  const overdue = overdueRows.reduce((s, r) => s + r.balance, 0);
  const since = subDays(now, 30);
  const paidLast30 = invoices
    .filter((i) => i.status !== "VOID")
    .reduce((s, i) => s + i.payments.filter((p) => p.date >= since).reduce((t, p) => t + p.amount, 0), 0);
  const visible = statusFilter ? rows.filter((r) => r.status === statusFilter) : rows;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold text-slate-900">Invoices</h1>
        <p className="text-xs text-slate-500">Billing across all jobs. Make one from a job&apos;s Invoices tab.</p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Tile label="Outstanding" value={money(outstanding)} hint={`${open.length} open`} tone={outstanding > 0 ? "warn" : undefined} />
        <Tile label="Overdue" value={money(overdue)} hint={`${overdueRows.length} past due`} tone={overdue > 0 ? "bad" : undefined} />
        <Tile label="Paid, last 30 days" value={money(paidLast30)} tone="good" />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
          <ListFind listId="invoice-list" placeholder="Find by job, client, or title…" />
          <nav className="flex flex-wrap gap-1" aria-label="Status">
            <FilterChip href="/invoices" active={!statusFilter} label="All" count={rows.length} />
            {INVOICE_STATUSES.map((s) => (
              <FilterChip key={s} href={`/invoices?status=${s}`} active={statusFilter === s} label={titleCase(s)} count={rows.filter((r) => r.status === s).length} />
            ))}
          </nav>
        </header>
        {visible.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">
            {statusFilter ? `No ${titleCase(statusFilter).toLowerCase()} invoices.` : "No invoices yet. Make one from a job's Invoices tab."}
          </p>
        ) : (
          <div id="invoice-list">
          <div className="overflow-x-auto" data-find-group>
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="px-4 py-2 font-normal">#</th>
                  <th className="px-3 py-2 font-normal">Job</th>
                  <th className="px-3 py-2 font-normal">Title</th>
                  <th className="px-3 py-2 font-normal">Status</th>
                  <th className="px-3 py-2 font-normal">Due</th>
                  <th className="px-3 py-2 text-right font-normal">Total</th>
                  <th className="px-4 py-2 text-right font-normal">Balance</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((inv) => {
                  const client = inv.project.client ? `${inv.project.client.firstName} ${inv.project.client.lastName}` : null;
                  return (
                    <tr
                      key={inv.id}
                      data-find={[`#${inv.number}`, `#${inv.project.number}`, inv.project.name, client, inv.title].filter(Boolean).join(" ").toLowerCase()}
                      className={cn("border-b border-slate-100 align-top last:border-b-0", inv.status === "VOID" && "text-slate-400")}
                    >
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-400">#{inv.number}</td>
                      <td className="px-3 py-2">
                        <Link href={`/projects/${inv.project.id}`} className="hover:underline">
                          #{inv.project.number} {inv.project.name}
                        </Link>
                        {client ? <span className="block text-xs text-slate-500">{client}</span> : null}
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/projects/${inv.project.id}/invoices/${inv.id}`} className="font-medium text-blue-700 hover:underline">
                          {inv.title}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Badge status={inv.status} />
                      </td>
                      <td className={cn("whitespace-nowrap px-3 py-2", inv.overdue && "font-medium text-rose-700")}>
                        {fmtDate(inv.dueDate)}
                        {inv.overdue ? <span className="block text-xs">overdue</span> : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(inv.total)}</td>
                      <td className={cn("whitespace-nowrap px-4 py-2 text-right tabular-nums", inv.balance > 0 ? "font-medium text-slate-900" : "text-slate-400")}>
                        {money(inv.balance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 text-sm font-medium text-slate-900">
                  <td className="px-4 py-2" colSpan={5}>
                    {visible.length} invoice{visible.length === 1 ? "" : "s"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(visible.filter((r) => r.status !== "VOID").reduce((s, r) => s + r.total, 0))}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{money(visible.reduce((s, r) => s + r.balance, 0))}</td>
                </tr>
              </tfoot>
            </table>
            <p data-find-none hidden className="px-4 py-3 text-sm text-slate-500">
              None match.
            </p>
          </div>
          </div>
        )}
      </section>
    </div>
  );
}
