import { Suspense } from "react";
import Link from "@/components/link";
import { RememberList } from "@/components/list-return";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { cn, dateInput, fmtDate, money } from "@/lib/utils";
import { BILL_STATUS_LABEL, billTotal, canApproveBills } from "@/lib/purchasing";
import { Badge, Button } from "@/components/ui";
import { Tile } from "@/components/ui/tile";
import { FilterChip } from "@/components/ui/filter-chip";
import { ListFind } from "@/components/list-find";
import { decideBill } from "../projects/[id]/purchasing/actions";
import { companyClock } from "@/lib/company-zone";

export const metadata = { title: "Bills" };

const small = "!h-7 !px-2.5 !text-xs";

const VIEWS = [
  { key: "", label: "To approve", statuses: ["PENDING"] },
  { key: "unpaid", label: "To pay", statuses: ["APPROVED"] },
  { key: "paid", label: "Paid", statuses: ["PAID"] },
  { key: "rejected", label: "Rejected", statuses: ["REJECTED"] },
];

/** Every job's sub and vendor bills: approve the waiting ones, pay the approved ones. */
export default async function BillsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireView("purchasing");
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
  const today = (await companyClock()).now; // today, on the company's clock
  const mayDecide = canApproveBills(user);
  const back = `/bills${view.key ? `?view=${view.key}` : ""}`;

  return (
    <div className="space-y-4">
      <Suspense>
        <RememberList kind="bills" listId="bill-list" />
      </Suspense>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold text-slate-900">Bills</h1>
        <p className="text-xs text-slate-500">What subs and vendors billed you on every job. Approved bills are each job&apos;s actual cost.</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Tile
          label="Waiting for approval"
          value={money(sum("PENDING"))}
          hint={`${count(["PENDING"])} bill${count(["PENDING"]) === 1 ? "" : "s"}`}
          tone={count(["PENDING"]) ? "warn" : undefined}
        />
        <Tile label="Approved — to pay" value={money(sum("APPROVED"))} hint={`${count(["APPROVED"])} bill${count(["APPROVED"]) === 1 ? "" : "s"}`} />
        <Tile label="Paid" value={money(sum("PAID"))} tone="good" />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
          <ListFind listId="bill-list" placeholder="Find by job, who, or their #…" />
          <nav className="flex flex-wrap gap-1" aria-label="Show">
            {VIEWS.map((x) => (
              <FilterChip key={x.key} href={x.key ? `/bills?view=${x.key}` : "/bills"} active={x.key === view.key} label={x.label} count={count(x.statuses)} />
            ))}
          </nav>
        </header>
        {visible.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">
            Nothing {view.label.toLowerCase()}. Bills are entered on each job&apos;s Purchasing tab, or uploaded by subs and vendors from their portal.
          </p>
        ) : (
          <div id="bill-list">
          <div className="overflow-x-auto" data-find-group>
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="px-4 py-2 font-normal">Job</th>
                  <th className="px-3 py-2 font-normal">From</th>
                  <th className="px-3 py-2 font-normal">Their #</th>
                  <th className="px-3 py-2 font-normal">PO</th>
                  <th className="px-3 py-2 font-normal">Due</th>
                  <th className="px-3 py-2 text-right font-normal">Amount</th>
                  <th className="px-4 py-2 font-normal">{view.key === "" || view.key === "unpaid" ? "" : "Status"}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ b, total }) => {
                  const href = `/projects/${b.project.id}/purchasing/bills/${b.id}`;
                  const late = b.status === "APPROVED" && b.dueDate && b.dueDate < today;
                  const po = b.purchaseOrder ? `PO-${b.purchaseOrder.number}` : null;
                  return (
                    <tr
                      key={b.id}
                      data-href={href}
                      data-find={[`#${b.project.number}`, b.project.name, b.vendorName, b.billNumber, po].filter(Boolean).join(" ").toLowerCase()}
                      className="border-b border-slate-100 align-top last:border-b-0"
                    >
                      <td className="px-4 py-2">
                        <Link href={href} className="hover:underline">
                          #{b.project.number} {b.project.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Link href={href} className="font-medium text-blue-700 hover:underline">
                          {b.vendorName}
                        </Link>
                        {b.fromPortal ? <span className="block text-xs text-slate-500">from their portal</span> : null}
                      </td>
                      <td className="px-3 py-2 text-xs">{b.billNumber ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{po ?? "—"}</td>
                      <td className={cn("whitespace-nowrap px-3 py-2", late && "font-medium text-rose-700")}>
                        {fmtDate(b.dueDate)}
                        {late ? <span className="block text-xs">late</span> : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">{money(total)}</td>
                      <td className="px-4 py-2">
                        {mayDecide && b.status === "PENDING" ? (
                          <form action={decideBill} className="flex justify-end">
                            <input type="hidden" name="projectId" value={b.project.id} />
                            <input type="hidden" name="id" value={b.id} />
                            <input type="hidden" name="decision" value="approve" />
                            <input type="hidden" name="back" value={back} />
                            <Button type="submit" size="sm" variant="success" className={small}>
                              Approve
                            </Button>
                          </form>
                        ) : mayDecide && b.status === "APPROVED" ? (
                          <form action={decideBill} className="flex items-center justify-end gap-1">
                            <input type="hidden" name="projectId" value={b.project.id} />
                            <input type="hidden" name="id" value={b.id} />
                            <input type="hidden" name="decision" value="paid" />
                            <input type="hidden" name="back" value={back} />
                            <input type="hidden" name="paidAt" value={dateInput(today)} />
                            <input name="reference" className="input !h-7 !py-0 w-24 text-xs" placeholder="Check #" aria-label="Check # / reference" />
                            <Button type="submit" size="sm" variant="success" className={cn(small, "whitespace-nowrap")}>
                              Paid today
                            </Button>
                          </form>
                        ) : (
                          <Badge status={b.status}>{BILL_STATUS_LABEL[b.status]}</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 text-sm font-medium text-slate-900">
                  <td className="px-4 py-2" colSpan={5}>
                    {visible.length} bill{visible.length === 1 ? "" : "s"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(visible.reduce((n, r) => n + r.total, 0))}</td>
                  <td />
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
