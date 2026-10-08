import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, ShieldAlert } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { costCodeLabel, dateInput, fmtDate, fmtDateTime, money } from "@/lib/utils";
import { BILL_STATUS_LABEL, billTotal, canApproveBills, coverageWarning, poBilling, vendorCoverage } from "@/lib/purchasing";
import { Badge, Button, Card, CardBody, CardHeader, Collapsible, ConfirmForm, Table, THead, TBody, Tr, Th, Td, TFoot } from "@/components/ui";
import { BillForm } from "../../_components/bill-form";
import { billChoices } from "../../_data";
import { decideBill, deleteBill, updateBill } from "../../actions";

export default async function BillPage({ params }: { params: Promise<{ id: string; billId: string }> }) {
  const user = await requireStaff();
  const { id, billId } = await params;
  const project = await getProject(id);
  const base = `/projects/${project.id}/purchasing`;
  const bill = await db.vendorBill.findFirst({
    where: { id: billId, projectId: project.id },
    include: {
      lines: { orderBy: { sortOrder: "asc" }, include: { costCode: true } },
      purchaseOrder: { select: { id: true, number: true, title: true } },
      approvedBy: { select: { name: true } },
    },
  });
  if (!bill) notFound();
  const [billing, coverage, file, { codes }] = await Promise.all([
    bill.purchaseOrderId ? poBilling(bill.purchaseOrderId) : null,
    vendorCoverage(bill.vendorId),
    bill.fileId ? db.fileAsset.findUnique({ where: { id: bill.fileId }, select: { id: true, name: true } }) : null,
    billChoices(project.id),
  ]);
  const total = billTotal(bill.lines);
  const mayDecide = canApproveBills(user);
  const editable = bill.status === "PENDING" || bill.status === "REJECTED";
  const hidden = (decision: string) => (
    <>
      <input type="hidden" name="projectId" value={project.id} />
      <input type="hidden" name="id" value={bill.id} />
      <input type="hidden" name="decision" value={decision} />
    </>
  );
  const covText = coverage && !coverage.ok ? coverageWarning(coverage, (d) => fmtDate(d)) : null;

  return (
    <div className="space-y-5">
      <div>
        <Link href={base} className="text-xs text-slate-500 hover:text-slate-800">
          ← Purchasing
        </Link>
        <h2 className="mt-1 flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-900">
          Bill from {bill.vendorName}
          {bill.billNumber ? <span className="font-mono text-base text-slate-600">#{bill.billNumber}</span> : null}
          <Badge status={bill.status}>{BILL_STATUS_LABEL[bill.status]}</Badge>
        </h2>
        <p className="text-xs text-slate-500">
          Dated {fmtDate(bill.billDate)}
          {bill.dueDate ? ` · due ${fmtDate(bill.dueDate)}` : ""}
          {bill.fromPortal ? " · uploaded from their portal" : ""}
          {bill.approvedAt ? ` · approved ${fmtDateTime(bill.approvedAt)}${bill.approvedBy ? ` by ${bill.approvedBy.name}` : ""}` : ""}
          {bill.paidAt ? ` · paid ${fmtDate(bill.paidAt)}${bill.paidMethod ? ` by ${bill.paidMethod}` : ""}${bill.paidReference ? ` (${bill.paidReference})` : ""}` : ""}
        </p>
        {bill.notes ? <p className="mt-1 text-sm text-slate-700">{bill.notes}</p> : null}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader
            title={money(total)}
            description={
              bill.purchaseOrder ? (
                <>
                  For{" "}
                  <Link href={`${base}/po/${bill.purchaseOrder.id}`} className="font-medium text-blue-700 hover:underline">
                    PO-{bill.purchaseOrder.number} · {bill.purchaseOrder.title}
                  </Link>
                </>
              ) : (
                "Not on a PO"
              )
            }
            actions={
              file ? (
                <a href={`/api/files/${file.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline">
                  <FileText className="h-4 w-4" /> Their bill
                </a>
              ) : null
            }
          />
          <Table>
            <THead>
              <tr>
                <Th>For</Th>
                <Th>Cost code</Th>
                <Th right>Amount</Th>
              </tr>
            </THead>
            <TBody>
              {bill.lines.map((l) => (
                <Tr key={l.id}>
                  <Td>{l.description}</Td>
                  <Td className="text-xs text-slate-600">{l.costCode ? costCodeLabel(l.costCode) : "No cost code"}</Td>
                  <Td right className="tabular-nums">
                    {money(l.amount)}
                  </Td>
                </Tr>
              ))}
            </TBody>
            <TFoot>
              <tr>
                <td colSpan={2} className="px-4 py-2.5 text-right font-semibold">
                  Total
                </td>
                <Td right className="font-semibold tabular-nums">
                  {money(total)}
                </Td>
              </tr>
            </TFoot>
          </Table>
          {billing ? (
            <CardBody className="border-t border-slate-100 text-sm">
              PO total {money(billing.total)} · billed so far {money(billing.billed)}
              {bill.status === "REJECTED" ? " (not counting this rejected bill)" : ""} ·{" "}
              {billing.over ? <strong className="text-rose-700">{money(-billing.left)} over the PO</strong> : <span>{money(billing.left)} left</span>}
            </CardBody>
          ) : null}
        </Card>

        <div className="space-y-3">
          {covText ? (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>Insurance:</strong> {covText}.
              </span>
            </p>
          ) : null}
          {bill.status === "REJECTED" ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
              Rejected{bill.rejectedNote ? `: ${bill.rejectedNote}` : "."} Change it and approve, or delete it.
            </p>
          ) : null}

          {!mayDecide ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {bill.status === "PENDING"
                ? "Waiting for someone who can approve bills (an admin can allow it in Settings → Team)."
                : "Only people who can approve bills change its status."}
            </p>
          ) : (
            <Card>
              <CardBody className="space-y-3">
                {editable ? (
                  <>
                    <form action={decideBill}>
                      {hidden("approve")}
                      <Button type="submit" variant="success" className="w-full">
                        Approve — add {money(total)} to the job&apos;s cost
                      </Button>
                    </form>
                    {billing?.over ? <p className="text-xs text-rose-700">This puts the PO over. Approve only if the extra was agreed.</p> : null}
                    {bill.status === "PENDING" ? (
                      <form action={decideBill} className="flex gap-2">
                        {hidden("reject")}
                        <input name="note" className="input !h-9 min-w-0 flex-1 text-sm" placeholder="Why reject (optional)" />
                        <Button type="submit" variant="secondary">
                          Reject
                        </Button>
                      </form>
                    ) : null}
                  </>
                ) : null}
                {bill.status === "APPROVED" ? (
                  <form action={decideBill} className="space-y-2">
                    {hidden("paid")}
                    <p className="text-sm font-medium text-slate-800">Mark paid</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input name="paidAt" type="date" className="input" defaultValue={dateInput(new Date())} aria-label="Paid on" />
                      <select name="method" className="input" defaultValue="Check" aria-label="How">
                        {["Check", "ACH", "Card", "Cash", "Other"].map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <input name="reference" className="input" placeholder="Check # / reference" />
                    <Button type="submit" variant="success" className="w-full">
                      Mark paid
                    </Button>
                  </form>
                ) : null}
                {bill.status === "APPROVED" || bill.status === "PAID" ? (
                  <ConfirmForm
                    action={decideBill}
                    variant="ghost"
                    message="Set this bill back to waiting for approval? Its cost comes off the job's actuals (and it's no longer marked paid)."
                    hidden={{ projectId: project.id, id: bill.id, decision: "unapprove" }}
                  >
                    Un-approve
                  </ConfirmForm>
                ) : null}
              </CardBody>
            </Card>
          )}
          {editable ? (
            <ConfirmForm action={deleteBill} variant="ghost" message="Delete this bill?" hidden={{ projectId: project.id, id: bill.id }}>
              Delete bill
            </ConfirmForm>
          ) : null}
        </div>
      </div>

      {editable ? (
        <Collapsible summary="Change this bill">
          <BillForm
            action={updateBill}
            projectId={project.id}
            billId={bill.id}
            codes={codes}
            vendors={[]}
            pos={[]}
            submitLabel="Save changes"
            initial={{
              purchaseOrderId: bill.purchaseOrderId ?? "",
              vendor: bill.vendorName,
              billNumber: bill.billNumber ?? "",
              billDate: dateInput(bill.billDate),
              dueDate: dateInput(bill.dueDate),
              notes: bill.notes ?? "",
              lines: bill.lines.map((l) => ({ description: l.description, costCodeId: l.costCodeId, amount: l.amount })),
            }}
          />
        </Collapsible>
      ) : null}
    </div>
  );
}
