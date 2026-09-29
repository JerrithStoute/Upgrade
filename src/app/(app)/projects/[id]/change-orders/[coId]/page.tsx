import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject, activeCostCodes } from "@/lib/projects";
import { fmtDate, money, pct } from "@/lib/utils";
import { CHANGE_ORDER_REASONS, lineTotals } from "@/lib/finance";
import { Badge, Card, CardBody, CardHeader, Collapsible, ConfirmForm, Field, FormGrid, Stat, SubmitButton, buttonClasses } from "@/components/ui";
import { LineItemsEditor } from "../../_components/line-items";
import {
  updateChangeOrder,
  sendChangeOrder,
  approveChangeOrder,
  declineChangeOrder,
  voidChangeOrder,
  deleteChangeOrder,
  createChangeOrderItem,
  updateChangeOrderItem,
  deleteChangeOrderItem,
} from "../actions";

export default async function ChangeOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; coId: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const user = await requireStaff();
  const { id, coId } = await params;
  const { edit } = await searchParams;
  const project = await getProject(id);
  const [co, costCodes] = await Promise.all([
    db.changeOrder.findFirst({
      where: { id: coId, projectId: project.id },
      include: { items: { include: { costCode: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
    }),
    activeCostCodes(),
  ]);
  if (!co) notFound();

  const isDraft = co.status === "DRAFT";
  const totals = lineTotals(co.items);
  const base = `/projects/${project.id}/change-orders/${co.id}`;
  const hidden = { projectId: project.id, changeOrderId: co.id };
  const ids = { projectId: project.id, id: co.id };

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
              {co.reason ?? "No reason given"} · Schedule impact {co.scheduleImpactDays} day{co.scheduleImpactDays === 1 ? "" : "s"} · Created {fmtDate(co.createdAt)}
              {co.sentAt ? ` · Sent ${fmtDate(co.sentAt)}` : ""}
              {co.decidedAt ? ` · ${co.status === "DECLINED" ? "Declined" : "Approved"} ${fmtDate(co.decidedAt)}${co.decidedBy ? ` by ${co.decidedBy}` : ""}` : ""}
            </>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
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
        <CardBody className="space-y-4">
          {co.description ? <p className="whitespace-pre-line text-sm text-slate-700">{co.description}</p> : null}
          {co.decisionNote ? (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <span className="font-medium">Decision note:</span> {co.decisionNote}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Cost" value={money(totals.cost)} />
            <Stat label="Markup" value={money(totals.markup)} hint={totals.cost > 0 ? pct((totals.markup / totals.cost) * 100, 1) + " of cost" : undefined} />
            <Stat label="Price" value={money(totals.price)} tone="good" />
            <Stat label="Schedule impact" value={`${co.scheduleImpactDays} d`} />
          </div>
        </CardBody>
      </Card>

      {co.status === "PENDING_APPROVAL" ? (
        <Card>
          <CardHeader title="Record client decision" description="Capture who approved or declined this change order." />
          <CardBody>
            <form className="space-y-4">
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="id" value={co.id} />
              <FormGrid>
                <Field label="Decided by" htmlFor="co-decidedBy">
                  <input id="co-decidedBy" name="decidedBy" className="input" defaultValue={project.client ? `${project.client.firstName} ${project.client.lastName}` : user.name} />
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

      <LineItemsEditor
        items={co.items}
        costCodes={costCodes}
        editable={isDraft}
        readOnlyHint={`This change order is ${co.status.toLowerCase().replace("_", " ")} and its items are locked.`}
        editingId={edit ?? null}
        baseHref={base}
        hidden={hidden}
        actions={{ create: createChangeOrderItem, update: updateChangeOrderItem, remove: deleteChangeOrderItem }}
        defaultMarkup={co.items[0]?.markupPct ?? 20}
      />

      <Collapsible summary="Edit details">
        <form action={updateChangeOrder} className="space-y-4">
          <input type="hidden" name="projectId" value={project.id} />
          <input type="hidden" name="id" value={co.id} />
          <FormGrid>
            <Field label="Title" htmlFor="co-title" className="md:col-span-2">
              <input id="co-title" name="title" className="input" defaultValue={co.title} required />
            </Field>
            <Field label="Description" htmlFor="co-description" className="md:col-span-2">
              <textarea id="co-description" name="description" rows={3} className="input" defaultValue={co.description ?? ""} />
            </Field>
            <Field label="Reason" htmlFor="co-reason">
              <select id="co-reason" name="reason" className="input" defaultValue={co.reason ?? ""}>
                <option value="">—</option>
                {CHANGE_ORDER_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Schedule impact (days)" htmlFor="co-days">
              <input id="co-days" name="scheduleImpactDays" type="number" step="1" className="input" defaultValue={co.scheduleImpactDays} />
            </Field>
          </FormGrid>
          <div className="flex items-center gap-2">
            <SubmitButton size="sm">Save</SubmitButton>
            <Link href={base} className={buttonClasses("secondary", "sm")}>
              Cancel
            </Link>
          </div>
        </form>
      </Collapsible>
    </div>
  );
}
