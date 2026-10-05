import Link from "next/link";
import { FileDiff, Plus } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { fmtDate, money } from "@/lib/utils";
import { changeOrderTotals } from "@/lib/change-orders";
import { Badge, ButtonLink, EmptyState, Stat, Table, THead, TBody, Tr, Th, Td, TFoot } from "@/components/ui";

export default async function ChangeOrdersPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Change orders</h2>
          <p className="text-sm text-slate-500">Scope changes priced and approved by the client.</p>
        </div>
        <span className="flex flex-wrap items-center gap-2">
          <ButtonLink href={newHref} size="sm">
            <Plus className="h-4 w-4" /> New change order
          </ButtonLink>
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={FileDiff}
          title="No change orders"
          description="Track scope additions and unforeseen conditions as priced change orders for client approval."
          action={
            <ButtonLink href={newHref} size="sm">
              <Plus className="h-4 w-4" /> New change order
            </ButtonLink>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Approved" value={money(approvedPrice)} hint={`${approved.length} change order${approved.length === 1 ? "" : "s"}`} tone="good" />
            <Stat label="Pending approval" value={money(pendingPrice)} hint={`${pending.length} awaiting decision`} tone={pending.length ? "warn" : "default"} />
            <Stat label="Schedule impact" value={`${approvedDays} day${approvedDays === 1 ? "" : "s"}`} hint="Approved change orders" />
            <Stat label="Total" value={rows.length} hint="All statuses" />
          </div>
          <Table>
            <THead>
              <tr>
                <Th>#</Th>
                <Th>Title</Th>
                <Th>Reason</Th>
                <Th>Status</Th>
                <Th right>Price</Th>
                <Th right>Days</Th>
                <Th>Sent</Th>
                <Th>Decided</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {rows.map((co) => (
                <Tr key={co.id}>
                  <Td className="font-mono text-xs">#{co.number}</Td>
                  <Td>
                    <Link href={`/projects/${project.id}/change-orders/${co.id}`} className="font-medium text-slate-900 hover:text-blue-700">
                      {co.title}
                    </Link>
                    {co.description ? <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{co.description}</p> : null}
                  </Td>
                  <Td className="text-xs text-slate-600">{co.reason ?? "—"}</Td>
                  <Td>
                    <Badge status={co.status} />
                  </Td>
                  <Td right className="font-medium text-slate-900">
                    {money(co.totals.price)}
                  </Td>
                  <Td right>{co.scheduleImpactDays}</Td>
                  <Td className="whitespace-nowrap">{fmtDate(co.sentAt)}</Td>
                  <Td className="whitespace-nowrap">
                    {fmtDate(co.decidedAt)}
                    {co.decidedBy ? <span className="block text-xs text-slate-500">{co.decidedBy}</span> : null}
                  </Td>
                  <Td>
                    <Link href={`/projects/${project.id}/change-orders/${co.id}`} className="text-xs font-medium text-blue-700 hover:underline">
                      Open
                    </Link>
                  </Td>
                </Tr>
              ))}
            </TBody>
            <TFoot>
              <tr>
                <td className="px-4 py-2.5" colSpan={4}>
                  Approved total
                </td>
                <Td right className="font-semibold text-slate-900">
                  {money(approvedPrice)}
                </Td>
                <Td right>{approvedDays}</Td>
                <td colSpan={3} />
              </tr>
            </TFoot>
          </Table>
        </>
      )}
    </div>
  );
}
