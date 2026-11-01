import Link from "@/components/link";
import { BackToList } from "@/components/list-return";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { cn, costCodeLabel, dateInput, fmtDate, money } from "@/lib/utils";
import { BILL_STATUS_LABEL, billTotal, canApproveBills, poBilling } from "@/lib/purchasing";
import { PaperworkNote } from "@/components/vendors/paperwork-note";
import { Badge, Button, ConfirmForm } from "@/components/ui";
import { Tile } from "@/components/ui/tile";
import { BillForm } from "../../_components/bill-form";
import { billChoices } from "../../_data";
import { decideBill, deleteBill, updateBill } from "../../actions";
import { companyClock } from "@/lib/company-zone";

const small = "!h-7 !px-2.5 !text-xs";
const card = "rounded-xl border border-slate-200 bg-white shadow-sm";
const head = "flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5";
const editLink = "inline-flex shrink-0 items-center gap-1 text-xs font-medium text-blue-700 hover:underline";
const plainBtn = "inline-flex h-7 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50";
const box = "input !h-7 !py-0 text-xs";
// The bill form, at the size of the rest of the page.
const compact = "[&_.input]:!h-8 [&_.input]:!py-0 [&_.input]:text-sm [&_.label]:!normal-case [&_.label]:!tracking-normal";

/** A label and its value, like a sub's or client's page. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 border-t border-slate-100 py-1.5 text-sm first:border-t-0">
      <span className="text-slate-500">{label}</span>
      <span className="min-w-0 break-words text-slate-900">{children || <span className="text-slate-300">—</span>}</span>
    </div>
  );
}

/** One bill. Change, Reject… and Mark paid… open in place (?edit=1, ?act=reject|paid); the actions come back here, which closes them. */
export default async function BillPage({ params, searchParams }: { params: Promise<{ id: string; billId: string }>; searchParams: Promise<{ edit?: string; act?: string }> }) {
  const user = await requireView("purchasing");
  const { dateTime } = await companyClock();
  const { id, billId } = await params;
  const { edit, act } = await searchParams;
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
  const [billing, file, { codes }] = await Promise.all([
    bill.purchaseOrderId ? poBilling(bill.purchaseOrderId) : null,
    bill.fileId ? db.fileAsset.findUnique({ where: { id: bill.fileId }, select: { id: true, name: true } }) : null,
    billChoices(project.id),
  ]);
  const total = billTotal(bill.lines);
  const mayDecide = canApproveBills(user);
  // From QuickBooks Online: kept there, followed here — nothing to approve, pay or change on this side.
  const fromQb = !!bill.qbTxnId;
  const editable = !fromQb && (bill.status === "PENDING" || bill.status === "REJECTED");
  const decides = mayDecide && !fromQb;
  const here = `${base}/bills/${bill.id}`;
  const editing = editable && edit === "1";
  const hidden = (decision: string) => (
    <>
      <input type="hidden" name="projectId" value={project.id} />
      <input type="hidden" name="id" value={bill.id} />
      <input type="hidden" name="decision" value={decision} />
    </>
  );
  // The top of a box that's open: what it is, and a way out.
  const formHead = (title: string) => (
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="text-sm font-semibold text-slate-900">{title}</span>
      <Link href={here} scroll={false} className={editLink}>
        Cancel
      </Link>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <BackToList kind="bills" href={base} label={`#${project.number} ${project.name} purchasing`} listLabel="All bills" />
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-900">
            Bill from {bill.vendorName}
            {bill.billNumber ? <span className="text-base font-normal text-slate-500">#{bill.billNumber}</span> : null}
            <Badge status={bill.status}>{BILL_STATUS_LABEL[bill.status]}</Badge>
          </h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {decides && editable ? (
              <form action={decideBill}>
                {hidden("approve")}
                <Button type="submit" size="sm" variant="success" className={small}>
                  Approve
                </Button>
              </form>
            ) : null}
            {decides && bill.status === "PENDING" && act !== "reject" ? (
              <Link href={`${here}?act=reject`} scroll={false} className={plainBtn}>
                Reject…
              </Link>
            ) : null}
            {decides && bill.status === "APPROVED" && act !== "paid" ? (
              <Link href={`${here}?act=paid`} scroll={false} className={cn(plainBtn, "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700")}>
                Mark paid…
              </Link>
            ) : null}
            {decides && (bill.status === "APPROVED" || bill.status === "PAID") ? (
              <ConfirmForm
                action={decideBill}
                variant="secondary"
                className="[&_button]:!h-7 [&_button]:!px-2.5 [&_button]:!text-xs"
                message="Set this bill back to waiting for approval? Its cost comes off the job's actuals (and it's no longer marked paid)."
                hidden={{ projectId: project.id, id: bill.id, decision: "unapprove" }}
              >
                Un-approve…
              </ConfirmForm>
            ) : null}
            {file ? (
              <a href={`/api/files/${file.id}`} target="_blank" rel="noreferrer" className={plainBtn}>
                <FileText className="h-3.5 w-3.5" /> Their bill
              </a>
            ) : null}
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Dated {fmtDate(bill.billDate)}
          {bill.dueDate ? ` · due ${fmtDate(bill.dueDate)}` : ""}
          {bill.fromPortal ? " · uploaded from their portal" : ""}
          {fromQb ? " · from QuickBooks" : ""}
        </p>
      </div>

      {decides && editable && billing?.over ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">This bill puts the PO over. Approve only if the extra was agreed.</p> : null}

      {decides && bill.status === "PENDING" && act === "reject" ? (
        <div className={cn(card, "px-4 py-2.5")}>
          {formHead("Reject this bill")}
          <form action={decideBill} className="flex flex-wrap items-center gap-1.5">
            {hidden("reject")}
            <input name="note" autoFocus className={cn(box, "min-w-[14rem] flex-1")} placeholder="Why (optional)" aria-label="Why reject" />
            <Button type="submit" size="sm" variant="danger" className={small}>
              Reject
            </Button>
          </form>
        </div>
      ) : null}

      {decides && bill.status === "APPROVED" && act === "paid" ? (
        <div className={cn(card, "px-4 py-2.5")}>
          {formHead("Mark paid")}
          <form action={decideBill} className="flex flex-wrap items-center gap-1.5">
            {hidden("paid")}
            <input name="paidAt" type="date" className={cn(box, "w-36")} defaultValue={dateInput(new Date())} aria-label="Paid on" />
            <select name="method" className={cn(box, "w-24")} defaultValue="Check" aria-label="How">
              {["Check", "ACH", "Card", "Cash", "Other"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <input name="reference" className={cn(box, "w-36")} placeholder="Check # / reference" aria-label="Check # / reference" />
            <Button type="submit" size="sm" variant="success" className={small}>
              Mark paid
            </Button>
          </form>
        </div>
      ) : null}

      {bill.status === "REJECTED" ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">
          Rejected{bill.rejectedNote ? `: ${bill.rejectedNote}` : "."} Change it and approve, or delete it.
        </p>
      ) : null}
      {fromQb ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          This bill comes from QuickBooks, where it&apos;s kept. Change it, pay it or delete it there — this follows on the next update (every 15 minutes).
        </p>
      ) : !mayDecide ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {bill.status === "PENDING" ? "Waiting for someone who can approve bills (an admin can allow it in Directory → Team)." : "Only people who can approve bills change its status."}
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <Tile label="This bill" value={money(total)} />
        {billing ? (
          <>
            <Tile label={`PO-${bill.purchaseOrder?.number} billed so far`} value={money(billing.billed)} hint={`of ${money(billing.total)}${bill.status === "REJECTED" ? ", not counting this one" : ""}`} />
            <Tile label={billing.over ? "Over the PO" : "Left on the PO"} value={money(Math.abs(billing.left))} tone={billing.over ? "bad" : "good"} />
          </>
        ) : (
          <>
            <Tile label="Dated" value={fmtDate(bill.billDate)} />
            <Tile label="Due" value={bill.dueDate ? fmtDate(bill.dueDate) : "—"} />
          </>
        )}
      </div>

      {editing ? (
        <section className={cn(card, "px-4 py-2.5", compact)}>
          {formHead("Change this bill")}
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
        </section>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className={card}>
            <header className={head}>
              <h3 className="text-sm font-semibold text-slate-900">Lines</h3>
              {editable ? (
                <Link href={`${here}?edit=1`} scroll={false} className={editLink}>
                  Edit
                </Link>
              ) : null}
            </header>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[26rem] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                    <th className="px-4 py-2 font-normal">For</th>
                    <th className="px-3 py-2 font-normal">Cost code</th>
                    <th className="px-4 py-2 text-right font-normal">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {bill.lines.map((l) => (
                    <tr key={l.id} className="border-b border-slate-100 align-top">
                      <td className="px-4 py-2">{l.description}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{l.costCode ? costCodeLabel(l.costCode) : "No cost code"}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{money(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="text-sm font-medium text-slate-900">
                    <td colSpan={2} className="px-4 py-2">
                      Total
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{money(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <div className="space-y-3">
            <section className={card}>
              <header className={head}>
                <h3 className="text-sm font-semibold text-slate-900">Details</h3>
                {editable ? (
                  <Link href={`${here}?edit=1`} scroll={false} className={editLink}>
                    Edit
                  </Link>
                ) : null}
              </header>
              <div className="px-4 py-1.5">
                <Row label="From">
                  {bill.vendorId ? (
                    <Link href={`/vendors/${bill.vendorId}`} className="text-blue-700 hover:underline">
                      {bill.vendorName}
                    </Link>
                  ) : (
                    bill.vendorName
                  )}
                </Row>
                <Row label="Their #">{bill.billNumber}</Row>
                <Row label="PO">
                  {bill.purchaseOrder ? (
                    <Link href={`${base}/po/${bill.purchaseOrder.id}`} className="text-blue-700 hover:underline">
                      PO-{bill.purchaseOrder.number} · {bill.purchaseOrder.title}
                    </Link>
                  ) : (
                    <span className="text-slate-400">Not on a PO</span>
                  )}
                </Row>
                <Row label="Dated">{fmtDate(bill.billDate, "MMM d, yyyy")}</Row>
                <Row label="Due">{bill.dueDate ? fmtDate(bill.dueDate, "MMM d, yyyy") : null}</Row>
                <Row label="Notes">{bill.notes ? <span className="whitespace-pre-line">{bill.notes}</span> : null}</Row>
                {bill.approvedAt && !fromQb ? (
                  <Row label="Approved">
                    {dateTime(bill.approvedAt)}
                    {bill.approvedBy ? ` by ${bill.approvedBy.name}` : ""}
                  </Row>
                ) : null}
                {bill.paidAt ? (
                  <Row label="Paid">
                    {fmtDate(bill.paidAt, "MMM d, yyyy")}
                    {bill.paidMethod ? ` · ${bill.paidMethod}` : ""}
                    {bill.paidReference ? ` · ${bill.paidReference}` : ""}
                  </Row>
                ) : null}
              </div>
            </section>
            <PaperworkNote vendorId={bill.vendorId} name={bill.vendorName} />
            {editable ? (
              <ConfirmForm action={deleteBill} variant="ghost" message="Delete this bill?" hidden={{ projectId: project.id, id: bill.id }}>
                <span className="text-xs text-rose-600">Delete bill…</span>
              </ConfirmForm>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
