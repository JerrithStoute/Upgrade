import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Printer, ShieldAlert } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject, activeCostCodes } from "@/lib/projects";
import { costCodeLabel, dateInput, fmtDate, fmtDateTime, money } from "@/lib/utils";
import { BILL_STATUS_LABEL, PO_STATUS_LABEL, billTotal, coverageWarning, poBilling, vendorCoverage } from "@/lib/purchasing";
import { Badge, Button, ButtonLink, Card, CardBody, CardHeader, ConfirmForm, Table, THead, TBody, Tr, Th, Td, buttonClasses } from "@/components/ui";
import { PoEditor } from "../../_components/po-editor";
import { deletePurchaseOrder, setPurchaseOrderStatus } from "../../actions";

/** The status buttons each PO status offers (to → label). */
const MOVES: Record<string, { to: string; label: string; variant?: "primary" | "secondary" | "danger" | "success"; confirm?: string; note?: boolean }[]> = {
  DRAFT: [
    { to: "SENT", label: "Mark sent" },
    { to: "VOID", label: "Void", variant: "danger", confirm: "Void this PO?" },
  ],
  SENT: [
    { to: "ACCEPTED", label: "Mark accepted", variant: "success" },
    { to: "DECLINED", label: "Mark declined", variant: "secondary", note: true },
    { to: "DRAFT", label: "Back to draft", variant: "secondary" },
    { to: "VOID", label: "Void", variant: "danger", confirm: "Void this PO?" },
  ],
  ACCEPTED: [
    { to: "CLOSED", label: "Close (all done)", variant: "secondary" },
    { to: "VOID", label: "Void", variant: "danger", confirm: "Void this PO? Its bills stay." },
  ],
  DECLINED: [
    { to: "SENT", label: "Send again" },
    { to: "VOID", label: "Void", variant: "danger", confirm: "Void this PO?" },
  ],
  CLOSED: [{ to: "ACCEPTED", label: "Reopen", variant: "secondary" }],
  VOID: [{ to: "DRAFT", label: "Reopen as draft", variant: "secondary" }],
};

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string; poId: string }> }) {
  await requireStaff();
  const { id, poId } = await params;
  const project = await getProject(id);
  const base = `/projects/${project.id}/purchasing`;
  const [po, codes, vendors] = await Promise.all([
    db.purchaseOrder.findFirst({
      where: { id: poId, projectId: project.id },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        bills: { orderBy: { billDate: "asc" }, include: { lines: true } },
      },
    }),
    activeCostCodes(),
    db.vendor.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!po) notFound();
  const [billing, coverage, createdBy] = await Promise.all([
    poBilling(po.id),
    vendorCoverage(po.vendorId),
    po.createdById ? db.user.findUnique({ where: { id: po.createdById }, select: { name: true } }) : null,
  ]);
  // A line's cost code may since have been turned off — keep it choosable here.
  const codeOptions = codes.map((c) => ({ id: c.id, label: costCodeLabel(c) }));
  for (const l of po.lines)
    if (l.costCodeId && !codeOptions.some((c) => c.id === l.costCodeId)) {
      const cc = await db.costCode.findUnique({ where: { id: l.costCodeId } });
      if (cc) codeOptions.push({ id: cc.id, label: costCodeLabel(cc) });
    }
  const readOnly = po.status === "CLOSED" || po.status === "VOID";
  const canBill = po.status !== "VOID" && po.status !== "DECLINED" && po.status !== "DRAFT";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={base} className="text-xs text-slate-500 hover:text-slate-800">
            ← Purchasing
          </Link>
          <h2 className="mt-1 flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-900">
            <span className="font-mono">PO-{po.number}</span>
            <span>{po.title}</span>
            <Badge status={po.status}>{PO_STATUS_LABEL[po.status]}</Badge>
          </h2>
          <p className="text-xs text-slate-500">
            To {po.vendorName} · created {fmtDate(po.createdAt)}
            {createdBy ? ` by ${createdBy.name}` : ""}
            {po.sentAt ? ` · sent ${fmtDate(po.sentAt)}` : ""}
            {po.respondedAt ? ` · ${po.status === "DECLINED" ? "declined" : "accepted"} ${fmtDateTime(po.respondedAt)}` : ""}
            {po.bidId ? " · from a bid you took" : ""}
          </p>
          {po.responseNote ? <p className="mt-1 text-sm text-slate-700">Their note: “{po.responseNote}”</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`${base}/po/${po.id}/print`} className={buttonClasses("secondary", "sm")}>
            <Printer className="h-3.5 w-3.5" /> Print / PDF
          </Link>
          {MOVES[po.status]?.map((m) =>
            m.confirm ? (
              <ConfirmForm
                key={m.to}
                action={setPurchaseOrderStatus}
                message={m.confirm}
                variant={m.variant ?? "primary"}
                hidden={{ projectId: project.id, id: po.id, status: m.to }}
              >
                {m.label}
              </ConfirmForm>
            ) : (
              <form key={m.to} action={setPurchaseOrderStatus} className="flex items-center gap-1">
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="id" value={po.id} />
                <input type="hidden" name="status" value={m.to} />
                {m.note ? <input name="note" className="input !h-8 w-40 text-xs" placeholder="Why (optional)" /> : null}
                <Button type="submit" size="sm" variant={m.variant ?? "primary"}>
                  {m.label}
                </Button>
              </form>
            ),
          )}
          {po.status === "DRAFT" && po.bills.length === 0 ? (
            <ConfirmForm action={deletePurchaseOrder} message={`Delete PO-${po.number}?`} variant="ghost" hidden={{ projectId: project.id, id: po.id }}>
              Delete
            </ConfirmForm>
          ) : null}
        </div>
      </div>

      {coverage && !coverage.ok ? (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>{po.vendorName}&apos;s insurance:</strong> {coverageWarning(coverage, (d) => fmtDate(d))}.{" "}
            {po.vendorId ? (
              <Link href={`/settings/vendors/${po.vendorId}`} className="font-medium underline">
                Update their certificates
              </Link>
            ) : null}
          </span>
        </p>
      ) : null}
      {po.status === "DRAFT" ? (
        <p className="text-xs text-slate-500">Print it or let them see it in their portal, then mark it sent. They can accept it in their portal, or you can mark it accepted.</p>
      ) : null}

      <Card>
        <CardBody>
          <PoEditor
            key={po.updatedAt.getTime()}
            projectId={project.id}
            poId={po.id}
            codes={codeOptions}
            vendors={vendors.map((v) => v.name)}
            readOnly={readOnly}
            initial={{
              title: po.title,
              vendor: po.vendorName,
              scope: po.scope ?? "",
              deliveryDate: dateInput(po.deliveryDate),
              lines: po.lines.map((l) => ({ description: l.description, costCodeId: l.costCodeId, quantity: l.quantity, unit: l.unit, unitCost: l.unitCost })),
            }}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Bills on this PO"
          description={
            billing ? (
              <>
                {money(billing.billed)} billed of {money(billing.total)} ·{" "}
                <span className={billing.over ? "font-semibold text-rose-700" : ""}>{billing.over ? `${money(-billing.left)} over the PO` : `${money(billing.left)} left`}</span>
              </>
            ) : null
          }
          actions={
            canBill ? (
              <ButtonLink href={`${base}/bills/new?po=${po.id}`} size="sm" variant="secondary">
                <Plus className="h-3.5 w-3.5" /> Enter a bill for this PO
              </ButtonLink>
            ) : null
          }
        />
        {po.bills.length === 0 ? (
          <CardBody>
            <p className="text-sm text-slate-500">{canBill ? "No bills yet." : po.status === "DRAFT" ? "Bills come in once the PO is sent." : "No bills."}</p>
          </CardBody>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Date</Th>
                <Th>Their #</Th>
                <Th>Status</Th>
                <Th right>Amount</Th>
              </tr>
            </THead>
            <TBody>
              {po.bills.map((b) => (
                <Tr key={b.id}>
                  <Td>
                    <Link href={`${base}/bills/${b.id}`} className="text-blue-700 hover:underline">
                      {fmtDate(b.billDate)}
                    </Link>
                  </Td>
                  <Td className="text-xs">{b.billNumber ?? "—"}</Td>
                  <Td>
                    <Badge status={b.status}>{BILL_STATUS_LABEL[b.status]}</Badge>
                  </Td>
                  <Td right className={b.status === "REJECTED" ? "text-slate-400 line-through tabular-nums" : "font-medium tabular-nums"}>
                    {money(billTotal(b.lines))}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
