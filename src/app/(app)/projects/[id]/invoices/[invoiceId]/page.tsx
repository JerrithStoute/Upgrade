import { ClientEmailNote } from "@/components/client-email-note";
import Link from "@/components/link";
import { BackToList } from "@/components/list-return";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, Printer } from "lucide-react";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { PAYMENT_METHODS } from "@/lib/constants";
import { cn, dateInput, fmtDate, money, num } from "@/lib/utils";
import { invoiceLineTotal, invoiceTotal, isOverdue, paymentsTotal } from "@/lib/finance";
import { Badge, ConfirmForm, SubmitButton } from "@/components/ui";
import { Tile } from "@/components/ui/tile";
import {
  updateInvoice,
  markInvoiceSent,
  voidInvoice,
  deleteInvoice,
  createInvoiceItem,
  updateInvoiceItem,
  deleteInvoiceItem,
  recordPayment,
  deletePayment,
  setInvoiceTax,
  resendToQuickBooks,
} from "../actions";

const small = "!h-7 !px-2.5 !text-xs";
const card = "rounded-xl border border-slate-200 bg-white shadow-sm";
const head = "flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5";
const editLink = "inline-flex shrink-0 items-center gap-1 text-xs font-medium text-blue-700 hover:underline";
const plainBtn = "inline-flex h-7 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50";
const box = "input !h-7 !py-0 text-xs";

/** A label and its value, like a sub's or client's page. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 border-t border-slate-100 py-1.5 text-sm first:border-t-0">
      <span className="text-slate-500">{label}</span>
      <span className="min-w-0 break-words text-slate-900">{children || <span className="text-slate-300">—</span>}</span>
    </div>
  );
}

/** The same row while editing: the value becomes its box. */
function EditRow({ label, top, children }: { label: string; top?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 border-t border-slate-100 py-1 text-sm first:border-t-0", top ? "items-start" : "items-center")}>
      <span className={cn("text-slate-500", top && "pt-1.5")}>{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/**
 * One invoice. Every box opens in place through ?edit= — details, tax, pay, new (a line), or a line's id — and
 * the actions come back to the plain page, which closes it.
 */
export default async function InvoiceDetailPage({ params, searchParams }: { params: Promise<{ id: string; invoiceId: string }>; searchParams: Promise<{ edit?: string }> }) {
  await requireView("invoices");
  const { id, invoiceId } = await params;
  const { edit } = await searchParams;
  const project = await getProject(id);
  const inv = await db.invoice.findFirst({
    where: { id: invoiceId, projectId: project.id },
    include: { items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }, payments: { orderBy: { date: "desc" } } },
  });
  if (!inv) notFound();
  const qbo = await db.qboConnection.findFirst({ select: { id: true } });
  // Payments for an invoice in QuickBooks Online come from there (recorded there, they show up here).
  const qbPayments = !!qbo && !!inv.qbTxnId;

  const isDraft = inv.status === "DRAFT";
  const isVoid = inv.status === "VOID";
  const total = invoiceTotal(inv.items);
  const paid = paymentsTotal(inv.payments);
  const balance = total - paid;
  const overdue = isOverdue(inv);
  const base = `/projects/${project.id}/invoices/${inv.id}`;
  const ids = { projectId: project.id, id: inv.id };
  const itemHidden = { projectId: project.id, invoiceId: inv.id };
  const canPay = !qbPayments && !isVoid && balance > 0;
  const taxLine = inv.items.find((i) => i.isTax);
  const client = project.client ? `${project.client.firstName} ${project.client.lastName}` : null;

  // The top of a box that's open: what it is, and a way out.
  const formHead = (title: string) => (
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="text-sm font-semibold text-slate-900">{title}</span>
      <Link href={base} scroll={false} className={editLink}>
        Cancel
      </Link>
    </div>
  );
  // A line's three boxes, for adding one or changing one.
  const lineBoxes = (item?: { id: string; description: string; quantity: number; unitPrice: number }) => (
    <>
      <input type="hidden" name="projectId" value={project.id} />
      <input type="hidden" name="invoiceId" value={inv.id} />
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <input name="description" required autoFocus className={cn(box, "min-w-[12rem] flex-1")} defaultValue={item?.description} placeholder="Description" aria-label="Description" />
      <input name="quantity" type="number" step="any" min="0" required className={cn(box, "w-16 text-right")} defaultValue={item?.quantity ?? 1} aria-label="Qty" />
      <input name="unitPrice" type="number" step="0.01" required className={cn(box, "w-28 text-right")} defaultValue={item?.unitPrice} placeholder="Price" aria-label="Unit price" />
    </>
  );

  return (
    <div className="space-y-4">
      <div>
        <BackToList kind="invoices" href={`/projects/${project.id}/invoices`} label={`#${project.number} ${project.name} invoices`} listLabel="All invoices" />
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-900">
            Invoice #{inv.number} · {inv.title}
            <Badge status={inv.status} />
            {overdue ? <Badge className="bg-rose-50 text-rose-800 ring-rose-200">Overdue</Badge> : null}
          </h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {isDraft ? (
              <form action={markInvoiceSent}>
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="id" value={inv.id} />
                <SubmitButton size="sm" className={small}>
                  Mark sent
                </SubmitButton>
              </form>
            ) : canPay && edit !== "pay" ? (
              <Link href={`${base}?edit=pay`} scroll={false} className={cn(plainBtn, "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700")}>
                Record a payment
              </Link>
            ) : null}
            <Link href={`${base}/print`} className={plainBtn}>
              <Printer className="h-3.5 w-3.5" /> Print / PDF
            </Link>
            {!isVoid ? (
              <ConfirmForm action={voidInvoice} hidden={ids} message={`Void invoice #${inv.number}? It will no longer count toward invoiced totals.`} variant="secondary" className="[&_button]:!h-7 [&_button]:!px-2.5 [&_button]:!text-xs">
                Void…
              </ConfirmForm>
            ) : null}
            {isDraft ? (
              <ConfirmForm action={deleteInvoice} hidden={ids} message={`Delete invoice #${inv.number}? This cannot be undone.`} variant="secondary" className="[&_button]:!h-7 [&_button]:!px-2.5 [&_button]:!text-xs [&_button]:!text-rose-700">
                Delete…
              </ConfirmForm>
            ) : null}
          </div>
        </div>
        <p className="text-xs text-slate-500">
          {client ? `Bill to ${client} · ` : ""}issued {fmtDate(inv.issueDate)} · due {fmtDate(inv.dueDate)}
        </p>
        {isDraft ? <ClientEmailNote clientId={project.clientId} button="Mark sent" /> : null}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Tile label="Total" value={money(total)} />
        <Tile label="Paid" value={money(paid)} tone="good" />
        <Tile label="Balance due" value={money(isVoid ? 0 : balance)} tone={!isVoid && balance > 0 ? (overdue ? "bad" : "warn") : undefined} />
      </div>

      {qbo && !isDraft && inv.qbError ? (
        <div className="space-y-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <b>Not in QuickBooks.</b> {inv.qbError}
            </span>
          </p>
          <form action={resendToQuickBooks} className="pl-6">
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="id" value={inv.id} />
            <SubmitButton size="sm" variant="secondary" pendingText="Sending…" className={small}>
              Send to QuickBooks again
            </SubmitButton>
          </form>
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Lines */}
        <section className={card}>
          <header className={head}>
            <h3 className="text-sm font-semibold text-slate-900">Lines</h3>
            {isDraft && edit !== "new" ? (
              <Link href={`${base}?edit=new`} scroll={false} className={editLink}>
                + Add a line
              </Link>
            ) : !isDraft ? (
              <span className="text-xs text-slate-500">Locked once it&apos;s sent</span>
            ) : null}
          </header>
          {isDraft && edit === "new" ? (
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
              {formHead("Add a line")}
              <form action={createInvoiceItem} className="flex flex-wrap items-center gap-1.5">
                {lineBoxes()}
                <SubmitButton size="sm" className={small}>
                  Add
                </SubmitButton>
              </form>
            </div>
          ) : null}
          <div className="@container overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="px-4 py-2 font-normal">Description</th>
                  <th className="px-3 py-2 text-right font-normal">Qty</th>
                  <th className="px-3 py-2 text-right font-normal">Price</th>
                  <th className="px-3 py-2 text-right font-normal">Amount</th>
                  {isDraft ? <th className="px-4 py-2" /> : null}
                </tr>
              </thead>
              <tbody>
                {inv.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                      No lines yet.{" "}
                      {isDraft && edit !== "new" ? (
                        <Link href={`${base}?edit=new`} scroll={false} className="font-medium text-blue-700 hover:underline">
                          Add the first one
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                ) : null}
                {inv.items.map((item) =>
                  isDraft && edit === item.id && !item.isTax ? (
                    <tr key={item.id} className="border-b border-slate-100 bg-slate-50">
                      <td colSpan={5} className="p-0">
                        <div className="sticky left-0 w-[100cqw] max-w-full px-4 py-2.5">
                          {formHead("Change this line")}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <form action={updateInvoiceItem} className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                              {lineBoxes(item)}
                              <SubmitButton size="sm" className={small}>
                                Save
                              </SubmitButton>
                            </form>
                            <ConfirmForm action={deleteInvoiceItem} hidden={{ ...itemHidden, id: item.id }} message="Delete this line?" variant="ghost">
                              <span className="text-xs text-rose-600">Delete line…</span>
                            </ConfirmForm>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={item.id} className="border-b border-slate-100 align-top">
                      <td className="px-4 py-2 text-slate-900">
                        {item.description}
                        {item.isTax ? <span className="ml-2 text-xs text-slate-400">follows the lines above</span> : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{num(item.quantity)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(item.unitPrice)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(invoiceLineTotal(item))}</td>
                      {isDraft ? (
                        <td className="px-4 py-2 text-right">
                          {item.isTax ? (
                            <Link href={`${base}?edit=tax`} scroll={false} className={editLink}>
                              Edit
                            </Link>
                          ) : (
                            <Link href={`${base}?edit=${item.id}`} scroll={false} className={editLink}>
                              Edit
                            </Link>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ),
                )}
                {isDraft && edit === "tax" ? (
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <td colSpan={5} className="p-0">
                      <div className="sticky left-0 w-[100cqw] max-w-full px-4 py-2.5">
                        {formHead("Tax")}
                        <form action={setInvoiceTax} className="flex flex-wrap items-center gap-1.5">
                          <input type="hidden" name="projectId" value={project.id} />
                          <input type="hidden" name="invoiceId" value={inv.id} />
                          <label className="flex items-center gap-1.5 text-xs text-slate-700">
                            <input type="checkbox" name="on" defaultChecked className="h-3.5 w-3.5 rounded border-slate-300" />
                            Add tax
                          </label>
                          <input name="taxLabel" className={cn(box, "w-40")} defaultValue={inv.taxLabel} aria-label="Label" />
                          <input name="taxPct" type="number" step="any" min="0" max="100" className={cn(box, "w-20 text-right")} defaultValue={inv.taxPct ?? ""} placeholder="Rate" aria-label="Rate %" />
                          <span className="text-xs text-slate-500">%</span>
                          <SubmitButton size="sm" className={small}>
                            Apply
                          </SubmitButton>
                        </form>
                        <p className="mt-1.5 text-xs text-slate-500">
                          {taxLine
                            ? "Tax is a line on this invoice and follows the other lines when they change. Untick it to take it off."
                            : "The sales tax you pay is already in your estimate's prices — only add tax here for something billed without it."}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot>
                <tr className="text-sm font-medium text-slate-900">
                  <td className="px-4 py-2" colSpan={3}>
                    Total
                    {isDraft && !taxLine && edit !== "tax" ? (
                      <span className="font-normal text-slate-500">
                        {" · "}no tax ·{" "}
                        <Link href={`${base}?edit=tax`} scroll={false} className="font-medium text-blue-700 hover:underline">
                          Add tax
                        </Link>
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(total)}</td>
                  {isDraft ? <td /> : null}
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <div className="space-y-4">
          {/* Details */}
          <section className={card}>
            <header className={head}>
              <h3 className="text-sm font-semibold text-slate-900">Details</h3>
              {edit !== "details" ? (
                <Link href={`${base}?edit=details`} scroll={false} className={editLink}>
                  Edit
                </Link>
              ) : null}
            </header>
            {edit === "details" ? (
              <form action={updateInvoice} className="px-4 py-2.5">
                {formHead("Change the details")}
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="id" value={inv.id} />
                <EditRow label="Number">
                  <input name="number" type="number" min={1} step={1} className={cn(box, "w-24")} defaultValue={inv.number} disabled={!isDraft} aria-label="Invoice number" />
                  {!isDraft ? <span className="ml-2 text-xs text-slate-500">Set once it&apos;s sent</span> : null}
                </EditRow>
                <EditRow label="Title">
                  <input name="title" required className={box} defaultValue={inv.title} aria-label="Title" />
                </EditRow>
                <EditRow label="Issued">
                  <input name="issueDate" type="date" required className={box} defaultValue={dateInput(inv.issueDate)} aria-label="Issue date" />
                </EditRow>
                <EditRow label="Due">
                  <input name="dueDate" type="date" className={box} defaultValue={dateInput(inv.dueDate)} aria-label="Due date" />
                </EditRow>
                <EditRow label="Notes" top>
                  <textarea name="notes" rows={3} className="input py-1 text-xs" defaultValue={inv.notes ?? ""} placeholder="Shown on the invoice" aria-label="Notes (shown on invoice)" />
                </EditRow>
                <div className="flex gap-1.5 pt-2">
                  <SubmitButton size="sm" className={small}>
                    Save
                  </SubmitButton>
                  <Link href={base} scroll={false} className={plainBtn}>
                    Cancel
                  </Link>
                </div>
              </form>
            ) : (
              <div className="px-4 py-1.5">
                <Row label="Number">#{inv.number}</Row>
                <Row label="Title">{inv.title}</Row>
                <Row label="Issued">{fmtDate(inv.issueDate, "MMM d, yyyy")}</Row>
                <Row label="Due">{inv.dueDate ? fmtDate(inv.dueDate, "MMM d, yyyy") : null}</Row>
                <Row label="Notes">{inv.notes ? <span className="whitespace-pre-line">{inv.notes}</span> : <span className="text-slate-400">Shown on the invoice — none</span>}</Row>
              </div>
            )}
            {qbo && inv.qbTxnId && !inv.qbError ? (
              <p className="flex items-center gap-1.5 border-t border-slate-100 px-4 py-2 text-xs text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> In QuickBooks{inv.qbSentAt ? ` since ${fmtDate(inv.qbSentAt)}` : ""} — payments received there show up here.
              </p>
            ) : qbo && isDraft ? (
              <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Goes to QuickBooks when you mark it sent.</p>
            ) : null}
          </section>

          {/* Payments */}
          <section className={card}>
            <header className={head}>
              <h3 className="text-sm font-semibold text-slate-900">Payments</h3>
              {canPay && edit !== "pay" ? (
                <Link href={`${base}?edit=pay`} scroll={false} className={editLink}>
                  + Record a payment
                </Link>
              ) : null}
            </header>
            {canPay && edit === "pay" ? (
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                {formHead("Record a payment")}
                <form action={recordPayment} className="flex flex-wrap items-center gap-1.5">
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="invoiceId" value={inv.id} />
                  <input name="amount" type="number" step="0.01" min="0.01" required autoFocus className={cn(box, "w-28 text-right")} defaultValue={Math.round(balance * 100) / 100} aria-label="Amount" />
                  <input name="date" type="date" required className={cn(box, "w-36")} defaultValue={dateInput(new Date())} aria-label="Date" />
                  <select name="method" className={cn(box, "w-24")} defaultValue="CHECK" aria-label="Method">
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <input name="reference" className={cn(box, "w-32")} placeholder="Check # / ref" aria-label="Reference" />
                  <SubmitButton size="sm" variant="success" className={small}>
                    Record payment
                  </SubmitButton>
                </form>
              </div>
            ) : null}
            {inv.payments.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500">No payments yet.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {inv.payments.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 align-top">
                      <td className="whitespace-nowrap px-4 py-2">{fmtDate(p.date)}</td>
                      <td className="px-2 py-2 text-xs text-slate-500">
                        {p.method}
                        {p.reference ? ` · ${p.reference}` : ""}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{money(p.amount)}</td>
                      <td className="px-4 py-2 text-right">
                        {p.qbTxnId && qbPayments ? (
                          <span className="text-xs text-slate-500">From QuickBooks</span>
                        ) : (
                          <ConfirmForm action={deletePayment} hidden={{ ...itemHidden, id: p.id }} message="Remove this payment?" variant="ghost">
                            <span className="text-xs text-rose-600">Remove…</span>
                          </ConfirmForm>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="text-sm font-medium text-slate-900">
                    <td className="px-4 py-2" colSpan={2}>
                      Paid to date
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{money(paid)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
            {qbPayments && !isVoid && balance > 0 ? (
              <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Record payments for this invoice in QuickBooks — they show up here on the next update (every 15 minutes).</p>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
