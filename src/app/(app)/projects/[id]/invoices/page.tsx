import Link from "next/link";
import { Plus, Receipt } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject, projectFinancials } from "@/lib/projects";
import { cn, fmtDate, money } from "@/lib/utils";
import { invoiceTotal, isOverdue, paymentsTotal } from "@/lib/finance";
import { Badge, ButtonLink, EmptyState, Stat, Table, THead, TBody, Tr, Th, Td, TFoot } from "@/components/ui";

export default async function ProjectInvoicesPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const project = await getProject(id);
  const [invoices, fin] = await Promise.all([
    db.invoice.findMany({ where: { projectId: project.id }, orderBy: { number: "desc" }, include: { items: true, payments: true } }),
    projectFinancials(project.id, project.contractAmount),
  ]);
  const rows = invoices.map((inv) => {
    const total = invoiceTotal(inv.items);
    const paid = paymentsTotal(inv.payments);
    return { ...inv, total, paid, balance: inv.status === "VOID" ? 0 : total - paid, overdue: isOverdue(inv) };
  });
  const newHref = `/projects/${project.id}/invoices/new`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Invoices</h2>
          <p className="text-sm text-slate-500">Contract value {money(fin.contract)} · billed against approved estimate and change orders.</p>
        </div>
        <ButtonLink href={newHref} size="sm">
          <Plus className="h-4 w-4" /> New invoice
        </ButtonLink>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Invoiced" value={money(fin.invoiced)} hint="Excludes void invoices" />
        <Stat label="Paid" value={money(fin.paid)} tone="good" />
        <Stat label="Balance due" value={money(fin.outstanding)} tone={fin.outstanding > 0 ? "warn" : "default"} />
        <Stat label="Remaining to invoice" value={money(fin.remainingToInvoice)} tone={fin.remainingToInvoice < 0 ? "bad" : "default"} hint={`of ${money(fin.contract, true)} contract`} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No invoices yet"
          description="Bill deposits, progress draws and approved change orders."
          action={
            <ButtonLink href={newHref} size="sm">
              <Plus className="h-4 w-4" /> New invoice
            </ButtonLink>
          }
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>#</Th>
              <Th>Title</Th>
              <Th>Status</Th>
              <Th>Issued</Th>
              <Th>Due</Th>
              <Th right>Total</Th>
              <Th right>Paid</Th>
              <Th right>Balance</Th>
              <Th />
            </tr>
          </THead>
          <TBody>
            {rows.map((inv) => (
              <Tr key={inv.id}>
                <Td className="font-mono text-xs">#{inv.number}</Td>
                <Td>
                  <Link href={`/projects/${project.id}/invoices/${inv.id}`} className="font-medium text-slate-900 hover:text-blue-700">
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
                <Td right>{money(inv.paid)}</Td>
                <Td right className={cn("font-medium", inv.balance > 0 ? "text-slate-900" : "text-slate-500")}>
                  {money(inv.balance)}
                </Td>
                <Td>
                  <Link href={`/projects/${project.id}/invoices/${inv.id}`} className="text-xs font-medium text-blue-700 hover:underline">
                    Open
                  </Link>
                </Td>
              </Tr>
            ))}
          </TBody>
          <TFoot>
            <tr>
              <td className="px-4 py-2.5" colSpan={5}>
                Totals (excluding void)
              </td>
              <Td right>{money(rows.filter((r) => r.status !== "VOID").reduce((s, r) => s + r.total, 0))}</Td>
              <Td right>{money(rows.filter((r) => r.status !== "VOID").reduce((s, r) => s + r.paid, 0))}</Td>
              <Td right className="font-semibold text-slate-900">
                {money(rows.reduce((s, r) => s + r.balance, 0))}
              </Td>
              <td />
            </tr>
          </TFoot>
        </Table>
      )}
    </div>
  );
}
