import Link from "next/link";
import { ClipboardList, Plus, ShieldAlert } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject, activeCostCodes } from "@/lib/projects";
import { costCodeLabel, fmtDate, lineCost, money } from "@/lib/utils";
import { BILL_STATUS_LABEL, PO_STATUS_LABEL, billTotal, coverageWarning, poTotal, vendorsCoverage } from "@/lib/purchasing";
import { Badge, ButtonLink, Collapsible, EmptyState, Stat, Table, THead, TBody, Tr, Th, Td } from "@/components/ui";
import { NewPoForm } from "./_components/new-po-form";

export default async function PurchasingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const project = await getProject(id);
  const base = `/projects/${project.id}/purchasing`;

  const [pos, bills, estimate, awards, vendors, codes, coverage] = await Promise.all([
    db.purchaseOrder.findMany({
      where: { projectId: project.id },
      orderBy: { number: "desc" },
      include: { lines: true, bills: { where: { status: { not: "REJECTED" } }, include: { lines: true } } },
    }),
    db.vendorBill.findMany({
      where: { projectId: project.id },
      orderBy: [{ billDate: "desc" }, { createdAt: "desc" }],
      include: { lines: true, purchaseOrder: { select: { number: true } } },
    }),
    db.estimate.findFirst({
      where: { projectId: project.id },
      orderBy: [{ approvedAt: { sort: "desc", nulls: "last" } }, { version: "desc" }],
      include: { items: { where: { isOptional: false } } },
    }),
    db.bidAward.findMany({ where: { projectId: project.id }, include: { bid: { include: { lines: true } } } }),
    db.vendor.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
    activeCostCodes(),
    vendorsCoverage(),
  ]);
  const coverageOf = new Map(coverage.map((c) => [c.vendor.id, c.state]));
  const codeName = (k: string) => {
    const c = codes.find((x) => x.id === k);
    return c ? costCodeLabel(c) : "No cost code";
  };

  // The budget by cost code — what "From the budget" can put on a PO.
  const byCode = new Map<string, { cost: number; lines: number }>();
  for (const i of estimate?.items ?? []) {
    const k = i.costCodeId ?? "none";
    const row = byCode.get(k) ?? { cost: 0, lines: 0 };
    row.cost += lineCost(i);
    row.lines += 1;
    byCode.set(k, row);
  }
  const budget = [...byCode.entries()]
    .map(([codeKey, r]) => ({ codeKey, label: codeName(codeKey), ...r }))
    .sort((a, b) => (codes.findIndex((c) => c.id === a.codeKey) + 1 || 1e9) - (codes.findIndex((c) => c.id === b.codeKey) + 1 || 1e9));
  const awardOptions = awards.map((a) => {
    const lines = a.bid.lines.filter((l) => l.codeKey === a.codeKey && l.unitPrice != null);
    return {
      value: `${a.bidId}|${a.codeKey}`,
      label: `${a.bid.vendorName} · ${lines[0]?.codeLabel ?? codeName(a.codeKey)} (Bid #${a.bid.number})`,
      total: lines.reduce((n, l) => n + l.quantity * (l.unitPrice ?? 0), 0),
    };
  });

  const rows = pos.map((po) => {
    const total = poTotal(po.lines);
    const billed = po.bills.reduce((n, b) => n + billTotal(b.lines), 0);
    const cov = po.vendorId ? coverageOf.get(po.vendorId) : null;
    return { po, total, billed, warn: cov && !cov.ok ? coverageWarning(cov, (d) => fmtDate(d, "MMM d")) : null };
  });
  const live = rows.filter((r) => r.po.status !== "VOID" && r.po.status !== "DECLINED");
  const committed = live.reduce((n, r) => n + r.total, 0);
  const billRows = bills.map((b) => ({ b, total: billTotal(b.lines) }));
  const sumBy = (s: string) => billRows.filter((r) => r.b.status === s).reduce((n, r) => n + r.total, 0);
  const waiting = billRows.filter((r) => r.b.status === "PENDING");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Purchasing</h2>
          <p className="text-sm text-slate-500">Purchase orders to subs and vendors, and the bills they send. Approved bills are the job&apos;s actual cost on the Budget.</p>
        </div>
        <ButtonLink href={`${base}/bills/new`} size="sm" variant="secondary">
          <Plus className="h-4 w-4" /> Enter a bill
        </ButtonLink>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="On POs" value={money(committed)} hint={`${live.length} PO${live.length === 1 ? "" : "s"} (not void or declined)`} />
        <Stat
          label="Waiting for approval"
          value={money(sumBy("PENDING"))}
          hint={`${waiting.length} bill${waiting.length === 1 ? "" : "s"}`}
          tone={waiting.length ? "warn" : "default"}
        />
        <Stat label="Approved — not paid" value={money(sumBy("APPROVED"))} />
        <Stat label="Paid" value={money(sumBy("PAID"))} tone="good" />
      </div>

      <Collapsible summary="New purchase order" defaultOpen={pos.length === 0}>
        <NewPoForm projectId={project.id} vendors={vendors.map((v) => v.name)} budget={budget} awards={awardOptions} />
      </Collapsible>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">Purchase orders</h3>
        {rows.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No purchase orders yet" description="Start one above — from a bid you took, from the budget, or blank." />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>PO</Th>
                <Th>To</Th>
                <Th>Title</Th>
                <Th>Status</Th>
                <Th right>Total</Th>
                <Th right>Billed</Th>
                <Th right>Left</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map(({ po, total, billed, warn }) => (
                <Tr key={po.id}>
                  <Td className="whitespace-nowrap font-mono text-xs">
                    <Link href={`${base}/po/${po.id}`} className="text-blue-700 hover:underline">
                      PO-{po.number}
                    </Link>
                  </Td>
                  <Td>
                    {po.vendorName}
                    {warn ? (
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-amber-700" title="Insurance">
                        <ShieldAlert className="h-3 w-3 shrink-0" /> {warn}
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    <Link href={`${base}/po/${po.id}`} className="font-medium text-slate-900 hover:text-blue-700">
                      {po.title}
                    </Link>
                  </Td>
                  <Td>
                    <Badge status={po.status}>{PO_STATUS_LABEL[po.status]}</Badge>
                  </Td>
                  <Td right className="font-medium tabular-nums">
                    {money(total)}
                  </Td>
                  <Td right className="tabular-nums">
                    {money(billed)}
                  </Td>
                  <Td right className={billed > total + 0.004 ? "font-semibold tabular-nums text-rose-700" : "tabular-nums"}>
                    {money(total - billed)}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">Bills</h3>
        {billRows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
            No bills yet. Enter one when a sub or vendor bills you — or they can upload it from their portal.
          </p>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Date</Th>
                <Th>From</Th>
                <Th>Their #</Th>
                <Th>PO</Th>
                <Th>Status</Th>
                <Th right>Amount</Th>
              </tr>
            </THead>
            <TBody>
              {billRows.map(({ b, total }) => (
                <Tr key={b.id}>
                  <Td className="whitespace-nowrap">
                    <Link href={`${base}/bills/${b.id}`} className="text-blue-700 hover:underline">
                      {fmtDate(b.billDate)}
                    </Link>
                  </Td>
                  <Td>
                    <Link href={`${base}/bills/${b.id}`} className="font-medium text-slate-900 hover:text-blue-700">
                      {b.vendorName}
                    </Link>
                    {b.fromPortal ? <span className="ml-1.5 text-xs text-slate-500">(from their portal)</span> : null}
                  </Td>
                  <Td className="text-xs">{b.billNumber ?? "—"}</Td>
                  <Td className="whitespace-nowrap font-mono text-xs">{b.purchaseOrder ? `PO-${b.purchaseOrder.number}` : "—"}</Td>
                  <Td>
                    <Badge status={b.status}>{BILL_STATUS_LABEL[b.status]}</Badge>
                  </Td>
                  <Td right className="font-medium tabular-nums">
                    {money(total)}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}
