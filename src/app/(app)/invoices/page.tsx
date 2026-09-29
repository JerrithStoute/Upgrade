import Link from "next/link";
import { subDays } from "date-fns";
import { Receipt } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { INVOICE_STATUSES } from "@/lib/constants";
import { cn, fmtDate, money, titleCase } from "@/lib/utils";
import { invoiceTotal, isOverdue, paymentsTotal } from "@/lib/finance";
import { Badge, EmptyState, PageHeader, Stat, Table, THead, TBody, Tr, Th, Td, TFoot } from "@/components/ui";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireStaff();
  const { status } = await searchParams;
  const statusFilter = (INVOICE_STATUSES as readonly string[]).includes(status ?? "") ? status! : "";

  const invoices = await db.invoice.findMany({
    orderBy: [{ issueDate: "desc" }, { number: "desc" }],
    include: { items: true, payments: true, project: { select: { id: true, number: true, name: true, client: { select: { firstName: true, lastName: true } } } } },
  });
  const now = new Date();
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
    <div className="space-y-6">
      <PageHeader title="Invoices" description="Billing across all projects." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Outstanding" value={money(outstanding)} hint={`${open.length} open invoice${open.length === 1 ? "" : "s"}`} tone={outstanding > 0 ? "warn" : "default"} />
        <Stat label="Overdue" value={money(overdue)} hint={`${overdueRows.length} past due`} tone={overdue > 0 ? "bad" : "default"} />
        <Stat label="Paid, last 30 days" value={money(paidLast30)} tone="good" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</span>
        <FilterChip href="/invoices" active={!statusFilter} label="All" count={rows.length} />
        {INVOICE_STATUSES.map((s) => (
          <FilterChip key={s} href={`/invoices?status=${s}`} active={statusFilter === s} label={titleCase(s)} count={rows.filter((r) => r.status === s).length} />
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={Receipt} title="No invoices" description={statusFilter ? `No ${titleCase(statusFilter).toLowerCase()} invoices.` : "Create invoices from a project's Invoices tab."} />
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>#</Th>
              <Th>Project</Th>
              <Th>Client</Th>
              <Th>Title</Th>
              <Th>Status</Th>
              <Th>Issued</Th>
              <Th>Due</Th>
              <Th right>Total</Th>
              <Th right>Balance</Th>
              <Th />
            </tr>
          </THead>
          <TBody>
            {visible.map((inv) => (
              <Tr key={inv.id}>
                <Td className="font-mono text-xs">#{inv.number}</Td>
                <Td>
                  <Link href={`/projects/${inv.project.id}`} className="text-slate-900 hover:text-blue-700">
                    <span className="font-mono text-xs text-slate-500">#{inv.project.number}</span> {inv.project.name}
                  </Link>
                </Td>
                <Td className="whitespace-nowrap">{inv.project.client ? `${inv.project.client.firstName} ${inv.project.client.lastName}` : "—"}</Td>
                <Td>
                  <Link href={`/projects/${inv.project.id}/invoices/${inv.id}`} className="font-medium text-slate-900 hover:text-blue-700">
                    {inv.title}
                  </Link>
                </Td>
                <Td>
                  <Badge status={inv.status} />
                </Td>
                <Td className="whitespace-nowrap">{fmtDate(inv.issueDate)}</Td>
                <Td className={cn("whitespace-nowrap", inv.overdue && "font-medium text-rose-700")}>
                  {fmtDate(inv.dueDate)}
                  {inv.overdue ? <span className="ml-1 text-xs">(overdue)</span> : null}
                </Td>
                <Td right>{money(inv.total)}</Td>
                <Td right className={cn("font-medium", inv.balance > 0 ? "text-slate-900" : "text-slate-500")}>
                  {money(inv.balance)}
                </Td>
                <Td>
                  <Link href={`/projects/${inv.project.id}/invoices/${inv.id}`} className="text-xs font-medium text-blue-700 hover:underline">
                    Open
                  </Link>
                </Td>
              </Tr>
            ))}
          </TBody>
          <TFoot>
            <tr>
              <td className="px-4 py-2.5" colSpan={7}>
                {visible.length} invoice{visible.length === 1 ? "" : "s"}
              </td>
              <Td right>{money(visible.filter((r) => r.status !== "VOID").reduce((s, r) => s + r.total, 0))}</Td>
              <Td right className="font-semibold text-slate-900">
                {money(visible.reduce((s, r) => s + r.balance, 0))}
              </Td>
              <td />
            </tr>
          </TFoot>
        </Table>
      )}
    </div>
  );
}

function FilterChip({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        active ? "border-blue-700 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
      )}
    >
      {label}
      <span className={cn("rounded-full px-1.5 text-[10px]", active ? "bg-blue-100" : "bg-slate-100")}>{count}</span>
    </Link>
  );
}
