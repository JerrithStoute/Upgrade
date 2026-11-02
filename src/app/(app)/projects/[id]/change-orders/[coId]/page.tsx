import Link from "@/components/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { approvedEstimateTotal, getProject, activeCostCodes } from "@/lib/projects";
import { fmtDate, money } from "@/lib/utils";
import { changeOrderTotals, effectOnContract, parseApprovals, parseCoDefaults, parseIds } from "@/lib/change-orders";
import { unaddedChoices } from "@/lib/change-orders-server";
import { Badge, ConfirmForm, SubmitButton, buttonClasses } from "@/components/ui";
import { approveChangeOrder, declineChangeOrder, deleteChangeOrder, sendChangeOrder, voidChangeOrder } from "../actions";
import { ChangeOrderEditor } from "./change-order-editor";
import { ClientEmailNote } from "@/components/client-email-note";

/**
 * A change order, laid out like your CoConstruct change orders: intro text, line
 * items (client choices with Client Price / Allowance / Difference, items, extra
 * charges), profit your way, tax, Effect on Contract, terms and completion dates,
 * files, closing text and approvals.
 */
export default async function ChangeOrderDetailPage({ params }: { params: Promise<{ id: string; coId: string }> }) {
  const { id, coId } = await params;
  // Someone who doesn't see costs and profit gets the change order as the client sees it.
  const user = await requireView("selections", { costs: `/projects/${id}/change-orders/${coId}/print` });
  const project = await getProject(id);
  const [co, open, team, files, company, others, base, costCodes] = await Promise.all([
    db.changeOrder.findFirst({ where: { id: coId, projectId: project.id }, include: { items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } } }),
    unaddedChoices(project.id),
    db.user.findMany({ where: { role: { in: ["ADMIN", "STAFF"] }, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.fileAsset.findMany({ where: { changeOrderId: coId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, mimeType: true, uploadedById: true } }),
    db.company.findFirst({ select: { changeOrderDefaults: true } }),
    db.changeOrder.findMany({ where: { projectId: project.id, status: "APPROVED", id: { not: coId } }, include: { items: true } }),
    approvedEstimateTotal(project.id),
    activeCostCodes(),
  ]);
  if (!co) notFound();

  const totals = changeOrderTotals(co, co.items);
  const previous = others.reduce((n, o) => n + changeOrderTotals(o, o.items).total, 0);
  const effect = effectOnContract(base || project.contractAmount, previous, totals.total);
  const approvals = parseApprovals(co.teamApprovals);
  const approvers = parseIds(co.approverIds);
  const ids = { projectId: project.id, id: co.id };
  const clientName = project.client ? `${project.client.firstName} ${project.client.lastName}`.trim() : null;

  return (
    <div className="space-y-3">
      <Link href={`/projects/${project.id}/change-orders`} className="text-xs text-slate-500 hover:text-slate-800">
        ← Change orders
      </Link>

      {/* Which change order and where it stands, with the money big on the right. */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-500">CO #{co.number}</span>
            <h1 className="text-xl font-semibold text-slate-900">{co.title}</h1>
            <Badge status={co.status} />
          </div>
          <p className="text-xs text-slate-500">
            Created {fmtDate(co.createdAt)}
            {co.sentAt ? ` · Sent ${fmtDate(co.sentAt)}` : ""}
            {co.clientApprovedAt ? ` · Client approved ${fmtDate(co.clientApprovedAt)}${co.decidedBy ? ` (${co.decidedBy})` : ""}` : ""}
            {co.decidedAt ? ` · ${co.status === "DECLINED" ? "Declined" : "Approved"} ${fmtDate(co.decidedAt)}` : ""}
            {co.status === "DRAFT" && co.clientApproval ? (
              <>
                {" · "}
                <ClientEmailNote clientId={project.clientId} button="Send for approval" className="text-xs text-slate-500" />
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-end gap-6">
          <div>
            <span className="block text-xs text-slate-500">This change order</span>
            <span className="text-xl font-semibold tabular-nums text-slate-900">
              {totals.total > 0.004 ? "+" : ""}
              {money(totals.total)}
            </span>
          </div>
          <div>
            <span className="block text-xs text-slate-500">New contract total</span>
            <span className="text-xl font-semibold tabular-nums text-slate-900">{money(effect.total)}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Link href={`/projects/${project.id}/change-orders/${co.id}/print`} className={buttonClasses("secondary", "xs")}>
          <Printer className="h-3.5 w-3.5" /> Print / PDF
        </Link>
        {co.status === "DRAFT" ? (
          <>
            <form action={sendChangeOrder}>
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="id" value={co.id} />
              <SubmitButton size="xs">Send for approval</SubmitButton>
            </form>
            <ConfirmForm action={deleteChangeOrder} hidden={ids} variant="ghost" size="xs" message={`Delete change order #${co.number}? This cannot be undone.`}>
              <span className="text-rose-600">Delete…</span>
            </ConfirmForm>
          </>
        ) : null}
        {co.status === "APPROVED" || co.status === "DECLINED" ? (
          <ConfirmForm
            action={voidChangeOrder}
            hidden={ids}
            message={`Void change order #${co.number}? It will no longer count toward the contract.`}
            variant="ghost"
            size="xs"
          >
            <span className="text-rose-600">Void…</span>
          </ConfirmForm>
        ) : null}
      </div>
      {co.decisionNote ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
          <span className="font-medium">Decision note:</span> {co.decisionNote}
        </p>
      ) : null}

      {co.status === "PENDING_APPROVAL" && co.clientApproval && !co.clientApprovedAt ? (
        // Signed on paper or said yes by email: one line to record it.
        <form className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
          <input type="hidden" name="projectId" value={project.id} />
          <input type="hidden" name="id" value={co.id} />
          <span className="text-sm font-semibold text-slate-900">Record the client&apos;s decision</span>
          <span className="text-xs text-slate-500">(decided outside the portal)</span>
          <input name="decidedBy" aria-label="Decided by" className="input !h-7 !w-44 !py-0 text-xs" defaultValue={clientName ?? user.name} />
          <input name="decisionNote" aria-label="Note" className="input !h-7 !w-auto min-w-0 flex-1 !py-0 text-xs" placeholder="Note (optional)" />
          <SubmitButton formAction={approveChangeOrder} variant="success" size="xs">
            Record approval
          </SubmitButton>
          <SubmitButton formAction={declineChangeOrder} variant="danger" size="xs">
            Record decline
          </SubmitButton>
        </form>
      ) : null}

      <ChangeOrderEditor
        projectId={project.id}
        me={user.id}
        co={{
          id: co.id,
          number: co.number,
          status: co.status,
          title: co.title,
          description: co.description ?? "",
          introText: co.introText ?? "",
          closingText: co.closingText ?? "",
          terms: co.terms ?? "",
          profitMode: co.profitMode,
          profitValue: co.profitValue,
          profitLabel: co.profitLabel,
          profitShown: co.profitShown,
          taxPct: co.taxPct,
          taxLabel: co.taxLabel,
          taxShown: co.taxShown,
          scheduleImpactDays: co.scheduleImpactDays,
          priorCompletion: co.priorCompletion ? co.priorCompletion.toISOString().slice(0, 10) : "",
          newCompletion: co.newCompletion ? co.newCompletion.toISOString().slice(0, 10) : "",
          approverIds: approvers,
          approvals,
          clientApproval: co.clientApproval,
          clientApprovedAt: co.clientApprovedAt,
          ifDeclined: co.ifDeclined,
          showItems: co.showItems,
          showPrices: co.showPrices,
        }}
        items={co.items.map((i) => ({
          id: i.id,
          kind: i.kind,
          category: i.category,
          description: i.description,
          choiceName: i.choiceName,
          clientPrice: i.clientPrice,
          allowance: i.allowance,
          quantity: i.quantity,
          unitCost: i.unitCost,
          markupPct: i.markupPct,
          costCodeId: i.costCodeId,
          profitMode: i.profitMode,
          profitValue: i.profitValue,
          taxed: i.taxed,
        }))}
        costCodes={costCodes.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
        open={open}
        team={team}
        clientName={clientName}
        effect={effect}
        files={files.map((f) => ({ id: f.id, name: f.name, isImage: f.mimeType.startsWith("image/"), mine: f.uploadedById === user.id }))}
        defaults={parseCoDefaults(company?.changeOrderDefaults)}
      />
    </div>
  );
}
