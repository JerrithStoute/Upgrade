import Link from "next/link";
import { FileInput } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { cn, dateInput, fmtDate, money } from "@/lib/utils";
import { BILL_STATUS_LABEL, billTotal, canApproveBills } from "@/lib/purchasing";
import { Badge, Button, EmptyState, PageHeader, Stat, Table, THead, TBody, Tr, Th, Td } from "@/components/ui";
import { decideBill } from "../projects/[id]/purchasing/actions";

export const metadata = { title: "Bills" };

const VIEWS = [
  { key: "", label: "To approve", statuses: ["PENDING"] },
  { key: "unpaid", label: "Approved — to pay", statuses: ["APPROVED"] },
  { key: "paid", label: "Paid", statuses: ["PAID"] },
  { key: "rejected", label: "Rejected", statuses: ["REJECTED"] },
];

/** Every job's sub and vendor bills: approve the waiting ones, pay the approved ones. */
export default async function BillsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireStaff();
  const { view: v } = await searchParams;
  const view = VIEWS.find((x) => x.key === (v ?? "")) ?? VIEWS[0];
  const bills = await db.vendorBill.findMany({
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { billDate: "asc" }],
    include: { lines: true, project: { select: { id: true, name: true, number: true } }, purchaseOrder: { select: { id: true, number: true } } },
  });
  const rows = bills.map((b) => ({ b, total: billTotal(b.lines) }));
  const sum = (s: string) => rows.filter((r) => r.b.status === s).reduce((n, r) => n + r.total, 0);
  const count = (s: string[]) => rows.filter((r) => s.includes(r.b.status)).length;
  const visible = rows.filter((r) => view.statuses.includes(r.b.status));
  const today = new Date();
  const mayDecide = canApproveBills(user);
  const back = `/bills${view.key ? `?view=${view.key}` : ""}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Bills" description="What subs and vendors billed you on every job. Approved bills are each job's actual cost." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="Waiting for approval"
          value={money(sum("PENDING"))}
          hint={`${count(["PENDING"])} bill${count(["PENDING"]) === 1 ? "" : "s"}`}
          tone={count(["PENDING"]) ? "warn" : "default"}
        />
        <Stat label="Approved — to pay" value={money(sum("APPROVED"))} hint={`${count(["APPROVED"])} bill${count(["APPROVED"]) === 1 ? "" : "s"}`} />
        <Stat label="Paid" value={money(sum("PAID"))} tone="good" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {VIEWS.map((x) => (
          <Link
            key={x.key}
            href={x.key ? `/bills?view=${x.key}` : "/bills"}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset",
              x.key === view.key ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
            )}
          >
            {x.label} <span className="ml-1 opacity-70">{count(x.statuses)}</span>
          </Link>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={FileInput}
          title={`Nothing ${view.label.toLowerCase()}`}
          description="Bills are entered on each job's Purchasing tab, or uploaded by subs and vendors from their portal."
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>Job</Th>
              <Th>From</Th>
              <Th>Their #</Th>
              <Th>PO</Th>
              <Th>Dated</Th>
              <Th>Due</Th>
              <Th right>Amount</Th>
              <Th>{view.key === "" || view.key === "unpaid" ? "" : "Status"}</Th>
            </tr>
          </THead>
          <TBody>
            {visible.map(({ b, total }) => {
              const href = `/projects/${b.project.id}/purchasing/bills/${b.id}`;
              const late = b.status === "APPROVED" && b.dueDate && b.dueDate < today;
              return (
                <Tr key={b.id}>
                  <Td className="text-xs">
                    <Link href={`/projects/${b.project.id}/purchasing`} className="hover:text-blue-700">
                      {b.project.name}
                    </Link>
                  </Td>
                  <Td>
                    <Link href={href} className="font-medium text-slate-900 hover:text-blue-700">
                      {b.vendorName}
                    </Link>
                    {b.fromPortal ? <span className="ml-1.5 text-xs text-slate-500">(portal)</span> : null}
                  </Td>
                  <Td className="text-xs">{b.billNumber ?? "—"}</Td>
                  <Td className="whitespace-nowrap font-mono text-xs">{b.purchaseOrder ? `PO-${b.purchaseOrder.number}` : "—"}</Td>
                  <Td className="whitespace-nowrap">{fmtDate(b.billDate)}</Td>
                  <Td className={cn("whitespace-nowrap", late && "font-semibold text-rose-700")}>{fmtDate(b.dueDate)}</Td>
                  <Td right className="font-medium tabular-nums">
                    {money(total)}
                  </Td>
                  <Td>
                    {mayDecide && b.status === "PENDING" ? (
                      <form action={decideBill}>
                        <input type="hidden" name="projectId" value={b.project.id} />
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="decision" value="approve" />
                        <input type="hidden" name="back" value={back} />
                        <Button type="submit" size="sm" variant="success">
                          Approve
                        </Button>
                      </form>
                    ) : mayDecide && b.status === "APPROVED" ? (
                      <form action={decideBill} className="flex items-center gap-1">
                        <input type="hidden" name="projectId" value={b.project.id} />
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="decision" value="paid" />
                        <input type="hidden" name="back" value={back} />
                        <input type="hidden" name="paidAt" value={dateInput(today)} />
                        <input name="reference" className="input !h-8 w-24 text-xs" placeholder="Check #" aria-label="Check # / reference" />
                        <Button type="submit" size="sm" variant="success">
                          Paid today
                        </Button>
                      </form>
                    ) : (
                      <Badge status={b.status}>{BILL_STATUS_LABEL[b.status]}</Badge>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
