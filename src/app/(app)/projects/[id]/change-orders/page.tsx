import Link from "@/components/link";
import { FileDiff, Plus } from "lucide-react";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { fmtDate, money } from "@/lib/utils";
import { changeOrderTotals } from "@/lib/change-orders";
import { Badge, EmptyState } from "@/components/ui";
import { ListFind } from "@/components/list-find";

export default async function ChangeOrdersPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireView("selections");
  const { id } = await params;
  const project = await getProject(id);
  const cos = await db.changeOrder.findMany({
    where: { projectId: project.id },
    orderBy: { number: "desc" },
    include: { items: true },
  });
  const rows = cos.map((co) => ({ ...co, totals: { price: changeOrderTotals(co, co.items).total } }));
  const approved = rows.filter((r) => r.status === "APPROVED");
  const pending = rows.filter((r) => r.status === "PENDING_APPROVAL");
  const approvedPrice = approved.reduce((s, r) => s + r.totals.price, 0);
  const pendingPrice = pending.reduce((s, r) => s + r.totals.price, 0);
  const approvedDays = approved.reduce((s, r) => s + r.scheduleImpactDays, 0);
  const newHref = `/projects/${project.id}/change-orders/new`;
  const cell = "px-3 py-2 align-top";

  return (
    <div className="space-y-3">
      {rows.length ? (
        // Where they stand: the counts, and the money big on the right.
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <p className="flex flex-wrap items-center gap-x-1 text-xs text-slate-500">
            <span>
              {rows.length} change order{rows.length === 1 ? "" : "s"} ·
            </span>
            <span className={pending.length ? "font-medium text-slate-800" : undefined}>{pending.length} waiting on the client</span>
            <span>
              · approved ones add {approvedDays} day{approvedDays === 1 ? "" : "s"}
            </span>
          </p>
          <div className="flex items-end gap-6">
            <div>
              <span className="block text-xs text-slate-500">Approved</span>
              <span className="text-xl font-semibold tabular-nums text-emerald-700">{money(approvedPrice)}</span>
            </div>
            <div>
              <span className="block text-xs text-slate-500">Pending approval</span>
              <span className={pending.length ? "text-xl font-semibold tabular-nums text-amber-700" : "text-xl font-semibold tabular-nums text-slate-900"}>
                {money(pendingPrice)}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
          {rows.length ? <ListFind listId="co-list" placeholder="Find a change order…" /> : <span className="text-sm font-semibold text-slate-900">Change orders</span>}
          {/* Priced from costs: only someone who sees them starts one. */}
          {user.access.costs ? (
            <Link
              href={newHref}
              className="ml-auto inline-flex h-7 items-center gap-1 rounded-md bg-blue-700 px-2.5 text-xs font-medium text-white hover:bg-blue-800"
            >
              <Plus className="h-3.5 w-3.5" /> New change order
            </Link>
          ) : null}
        </header>
        <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
          Scope changes, priced and sent to the client to approve. Approved ones add to the contract and the schedule.
        </p>

        {rows.length === 0 ? (
          <EmptyState icon={FileDiff} title="No change orders" description="Track scope additions and unforeseen conditions as priced change orders for client approval." />
        ) : (
          <div id="co-list">
            <div className="overflow-x-auto" data-find-group>
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-slate-100 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 pl-4 font-normal">#</th>
                    <th className="px-3 py-2 font-normal">Change order</th>
                    <th className="px-3 py-2 font-normal">Reason</th>
                    <th className="px-3 py-2 font-normal">Status</th>
                    <th className="px-3 py-2 text-right font-normal">Price</th>
                    <th className="px-3 py-2 text-right font-normal">Days</th>
                    <th className="px-3 py-2 font-normal">Sent</th>
                    <th className="px-3 py-2 pr-4 font-normal">Decided</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((co) => (
                    <tr
                      key={co.id}
                      data-find={[`#${co.number}`, co.title, co.description, co.reason].filter(Boolean).join(" ").toLowerCase()}
                      className="border-t border-slate-100 first:border-t-0 hover:bg-slate-50"
                    >
                      <td className={`${cell} pl-4 text-xs tabular-nums text-slate-500`}>{co.number}</td>
                      <td className={cell}>
                        <Link href={`/projects/${project.id}/change-orders/${co.id}`} className="font-medium text-blue-700 hover:underline">
                          {co.title}
                        </Link>
                        {co.description ? <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{co.description}</p> : null}
                      </td>
                      <td className={`${cell} text-xs text-slate-600`}>{co.reason ?? "—"}</td>
                      <td className={cell}>
                        <Badge status={co.status} />
                      </td>
                      <td className={`${cell} text-right font-medium tabular-nums text-slate-900`}>{money(co.totals.price)}</td>
                      <td className={`${cell} text-right tabular-nums`}>{co.scheduleImpactDays}</td>
                      <td className={`${cell} whitespace-nowrap text-xs text-slate-500`}>{fmtDate(co.sentAt)}</td>
                      <td className={`${cell} whitespace-nowrap pr-4 text-xs text-slate-500`}>
                        {fmtDate(co.decidedAt)}
                        {co.decidedBy ? <span className="block">{co.decidedBy}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 font-semibold text-slate-900">
                    <td className="px-3 py-2.5 pl-4" colSpan={4}>
                      Approved total
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(approvedPrice)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{approvedDays}</td>
                    <td colSpan={2} />
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
