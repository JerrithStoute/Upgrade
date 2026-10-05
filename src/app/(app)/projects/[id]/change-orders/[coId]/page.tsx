import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { approvedEstimateTotal, getProject, activeCostCodes } from "@/lib/projects";
import { fmtDate } from "@/lib/utils";
import { changeOrderTotals, effectOnContract, parseApprovals, parseCoDefaults, parseIds } from "@/lib/change-orders";
import { unaddedChoices } from "@/lib/change-orders-server";
import { Badge, Card, CardBody, CardHeader, ConfirmForm, Field, FormGrid, SubmitButton, buttonClasses } from "@/components/ui";
import { approveChangeOrder, declineChangeOrder, deleteChangeOrder, sendChangeOrder, voidChangeOrder } from "../actions";
import { ChangeOrderEditor } from "./change-order-editor";

/**
 * A change order, laid out like your CoConstruct change orders: intro text, line
 * items (client choices with Client Price / Allowance / Difference, items, extra
 * charges), profit your way, tax, Effect on Contract, terms and completion dates,
 * files, closing text and approvals.
 */
export default async function ChangeOrderDetailPage({ params }: { params: Promise<{ id: string; coId: string }> }) {
  const user = await requireStaff();
  const { id, coId } = await params;
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
    <div className="space-y-6">
      <Link href={`/projects/${project.id}/change-orders`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-3.5 w-3.5" /> All change orders
      </Link>

      <Card>
        <CardHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-slate-500">CO #{co.number}</span>
              {co.title}
              <Badge status={co.status} />
            </span>
          }
          description={
            <>
              Created {fmtDate(co.createdAt)}
              {co.sentAt ? ` · Sent ${fmtDate(co.sentAt)}` : ""}
              {co.clientApprovedAt ? ` · Client approved ${fmtDate(co.clientApprovedAt)}${co.decidedBy ? ` (${co.decidedBy})` : ""}` : ""}
              {co.decidedAt ? ` · ${co.status === "DECLINED" ? "Declined" : "Approved"} ${fmtDate(co.decidedAt)}` : ""}
            </>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/projects/${project.id}/change-orders/${co.id}/print`} className={buttonClasses("secondary", "sm")}>
                <Printer className="h-3.5 w-3.5" /> Print / PDF
              </Link>
              {co.status === "DRAFT" ? (
                <>
                  <form action={sendChangeOrder}>
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="id" value={co.id} />
                    <SubmitButton size="sm">Send for approval</SubmitButton>
                  </form>
                  <ConfirmForm action={deleteChangeOrder} hidden={ids} message={`Delete change order #${co.number}? This cannot be undone.`}>
                    Delete
                  </ConfirmForm>
                </>
              ) : null}
              {co.status === "APPROVED" || co.status === "DECLINED" ? (
                <ConfirmForm action={voidChangeOrder} hidden={ids} message={`Void change order #${co.number}? It will no longer count toward the contract.`} variant="secondary">
                  Void
                </ConfirmForm>
              ) : null}
            </div>
          }
        />
        {co.decisionNote ? (
          <CardBody>
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <span className="font-medium">Decision note:</span> {co.decisionNote}
            </p>
          </CardBody>
        ) : null}
      </Card>

      {co.status === "PENDING_APPROVAL" && co.clientApproval && !co.clientApprovedAt ? (
        <Card>
          <CardHeader title="Record the client's decision" description="If the client approved or declined outside the portal (signed on paper, by email…)." />
          <CardBody>
            <form className="space-y-4">
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="id" value={co.id} />
              <FormGrid>
                <Field label="Decided by" htmlFor="co-decidedBy">
                  <input id="co-decidedBy" name="decidedBy" className="input" defaultValue={clientName ?? user.name} />
                </Field>
                <Field label="Note" htmlFor="co-note">
                  <input id="co-note" name="decisionNote" className="input" placeholder="Optional" />
                </Field>
              </FormGrid>
              <div className="flex items-center gap-2">
                <SubmitButton formAction={approveChangeOrder} variant="success" size="sm">
                  Record approval
                </SubmitButton>
                <SubmitButton formAction={declineChangeOrder} variant="danger" size="sm">
                  Record decline
                </SubmitButton>
              </div>
            </form>
          </CardBody>
        </Card>
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
