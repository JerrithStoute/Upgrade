import Link from "@/components/link";
import { Plus, Receipt } from "lucide-react";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { approvedEstimateTotal, getProject } from "@/lib/projects";
import { cn, fmtDate, money } from "@/lib/utils";
import { invoiceLineTotal, invoiceTotal, isOverdue, paymentsTotal } from "@/lib/finance";
import { changeOrderTotals } from "@/lib/change-orders";
import { billingSummary, type BillingRow } from "@/lib/billing-summary";
import { BillSummary } from "./bill-summary";
import { Badge, ButtonLink, EmptyState, Table, THead, TBody, Tr, Th, Td, TFoot } from "@/components/ui";

export default async function ProjectInvoicesPage({ params }: { params: Promise<{ id: string }> }) {
  await requireView("invoices");
  const { id } = await params;
  const project = await getProject(id);
  const [invoices, estimate, cos] = await Promise.all([
    db.invoice.findMany({ where: { projectId: project.id }, orderBy: { number: "desc" }, include: { items: true, payments: true } }),
    approvedEstimateTotal(project.id),
    db.changeOrder.findMany({
      where: { projectId: project.id, OR: [{ status: { in: ["APPROVED", "PENDING_APPROVAL"] } }, { status: "DRAFT", autoSelections: true }] },
      orderBy: { number: "asc" },
      include: { items: true },
    }),
  ]);
  const coTotal = (c: (typeof cos)[number]) => changeOrderTotals(c, c.items).total;
  const sum = billingSummary(
    estimate > 0 ? estimate : project.contractAmount,
    cos.filter((c) => c.status === "APPROVED").map((c) => ({ id: c.id, number: c.number, title: c.title, total: coTotal(c) })),
    invoices.map((inv) => ({
      number: inv.number,
      status: inv.status,
      paid: paymentsTotal(inv.payments),
      items: inv.items.map((i) => ({ description: i.description, changeOrderId: i.changeOrderId, isTax: i.isTax, amount: invoiceLineTotal(i) })),
    })),
  );
  // Not in the contract until approved: waiting on the client, and the Selections change order still a draft.
  const waiting = cos.filter((c) => c.status !== "APPROVED").map((c) => `#${c.number} ${c.title} ${money(coTotal(c))} (${c.status === "DRAFT" ? "draft" : "waiting on the client"})`);
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
          <p className="text-sm text-slate-500">Bill draws, deposits and approved change orders.</p>
        </div>
        <ButtonLink href={newHref} size="sm">
          <Plus className="h-4 w-4" /> New invoice
        </ButtonLink>
      </div>

      <BillSummary
        total={money(sum.total.amount + sum.tax)}
        billed={money(sum.total.billed)}
        left={money(sum.total.left)}
        due={money(sum.balance)}
        waiting={waiting.length}
        over={sum.total.left < 0}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-normal" />
                <th className="w-32 px-3 py-2 text-right font-normal">Amount</th>
                <th className="w-32 px-3 py-2 text-right font-normal">Billed</th>
                <th className="w-32 px-4 py-2 text-right font-normal">Left</th>
              </tr>
            </thead>
            <tbody>
              <BillRow r={sum.contract} strong />
              {sum.changeOrders.length ? (
                <tr className="border-t border-slate-100">
                  <td colSpan={4} className="px-4 pb-0.5 pt-2 text-xs text-slate-500">
                    Approved changes
                  </td>
                </tr>
              ) : null}
              {sum.changeOrders.map((r) => (
                <BillRow key={r.key} r={r} indent />
              ))}
              {sum.tax ? (
                <tr className="border-t border-slate-100">
                  <td className="px-4 py-1.5 text-slate-700">Sales tax added on invoices</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{money(sum.tax)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{money(sum.tax)}</td>
                  <td className="px-4 py-1.5 text-right text-slate-400">—</td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-300 font-semibold text-slate-900">
                <td className="px-4 py-2">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(sum.total.amount + sum.tax)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(sum.total.billed)}</td>
                <td className={cn("px-4 py-2 text-right tabular-nums", sum.total.left < 0 && "text-rose-700")}>{money(sum.total.left)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="space-y-0.5 border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
          {waiting.length ? <p>Not counted yet: {waiting.join(" · ")}</p> : null}
          <p>
            Paid <span className="font-medium text-emerald-700">{money(sum.paid)}</span> · Balance due{" "}
            <span className={cn("font-medium", sum.balance > 0 ? "text-amber-700" : "text-slate-700")}>{money(sum.balance)}</span>
            {" · "}billed counts invoices that have gone out (not drafts or void ones)
          </p>
        </div>
      </BillSummary>

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

/** One row of What you can bill: amount, billed (and any draft invoice it's on), left. */
function BillRow({ r, strong, indent }: { r: BillingRow; strong?: boolean; indent?: boolean }) {
  return (
    <tr className={cn(!indent && "border-t border-slate-100")}>
      <td className={cn("px-4 py-1.5", indent && "pl-7", strong ? "font-medium text-slate-900" : "text-slate-700")}>
        {r.label}
        {r.drafts.length ? (
          <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">on draft {r.drafts.map((n) => `#${n}`).join(", ")}</span>
        ) : null}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums">{money(r.amount)}</td>
      <td className={cn("px-3 py-1.5 text-right tabular-nums", !r.billed && "text-slate-400")}>{r.billed ? money(r.billed) : "—"}</td>
      <td className={cn("px-4 py-1.5 text-right tabular-nums", r.left < 0 ? "text-rose-700" : !r.left && "text-slate-400")}>{r.left ? money(r.left) : "—"}</td>
    </tr>
  );
}
