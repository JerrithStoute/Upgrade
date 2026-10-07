import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Printer } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { PAYMENT_METHODS } from "@/lib/constants";
import { dateInput, fmtDate, money, num } from "@/lib/utils";
import { invoiceLineTotal, invoiceTotal, isOverdue, paymentsTotal } from "@/lib/finance";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  Collapsible,
  ConfirmForm,
  Field,
  FormGrid,
  Stat,
  SubmitButton,
  Table,
  THead,
  TBody,
  Tr,
  Th,
  Td,
  TFoot,
  buttonClasses,
} from "@/components/ui";
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
} from "../actions";

export default async function InvoiceDetailPage({ params, searchParams }: { params: Promise<{ id: string; invoiceId: string }>; searchParams: Promise<{ edit?: string }> }) {
  await requireStaff();
  const { id, invoiceId } = await params;
  const { edit } = await searchParams;
  const project = await getProject(id);
  const inv = await db.invoice.findFirst({
    where: { id: invoiceId, projectId: project.id },
    include: { items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }, payments: { orderBy: { date: "desc" } } },
  });
  if (!inv) notFound();

  const isDraft = inv.status === "DRAFT";
  const isVoid = inv.status === "VOID";
  const total = invoiceTotal(inv.items);
  const paid = paymentsTotal(inv.payments);
  const balance = total - paid;
  const overdue = isOverdue(inv);
  const base = `/projects/${project.id}/invoices/${inv.id}`;
  const ids = { projectId: project.id, id: inv.id };
  const itemHidden = { projectId: project.id, invoiceId: inv.id };
  const colCount = isDraft ? 5 : 4;

  return (
    <div className="space-y-6">
      <Link href={`/projects/${project.id}/invoices`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-3.5 w-3.5" /> All invoices
      </Link>

      <Card>
        <CardHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-slate-500">Invoice #{inv.number}</span>
              {inv.title}
              <Badge status={inv.status} />
              {overdue ? <Badge className="bg-rose-50 text-rose-800 ring-rose-200">Overdue</Badge> : null}
            </span>
          }
          description={
            <>
              Issued {fmtDate(inv.issueDate)} · Due {fmtDate(inv.dueDate)}
              {project.client ? ` · Bill to ${project.client.firstName} ${project.client.lastName}` : ""}
            </>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {isDraft ? (
                <form action={markInvoiceSent}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="id" value={inv.id} />
                  <SubmitButton size="sm">Mark sent</SubmitButton>
                </form>
              ) : null}
              <Link href={`${base}/print`} className={buttonClasses("secondary", "sm")}>
                <Printer className="h-3.5 w-3.5" /> Print / PDF
              </Link>
              {!isVoid ? (
                <ConfirmForm action={voidInvoice} hidden={ids} message={`Void invoice #${inv.number}? It will no longer count toward invoiced totals.`} variant="secondary">
                  Void
                </ConfirmForm>
              ) : null}
              {isDraft ? (
                <ConfirmForm action={deleteInvoice} hidden={ids} message={`Delete invoice #${inv.number}? This cannot be undone.`}>
                  Delete
                </ConfirmForm>
              ) : null}
            </div>
          }
        />
        <CardBody>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Total" value={money(total)} />
            <Stat label="Paid" value={money(paid)} tone="good" />
            <Stat label="Balance due" value={money(isVoid ? 0 : balance)} tone={!isVoid && balance > 0 ? (overdue ? "bad" : "warn") : "default"} />
          </div>
          {inv.notes ? <p className="mt-4 whitespace-pre-line text-sm text-slate-600">{inv.notes}</p> : null}
        </CardBody>
      </Card>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Line items</h3>
        <Table>
          <THead>
            <tr>
              <Th>Description</Th>
              <Th right>Qty</Th>
              <Th right>Unit price</Th>
              <Th right>Amount</Th>
              {isDraft ? <Th className="text-right">Actions</Th> : null}
            </tr>
          </THead>
          <TBody>
            {inv.items.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-sm text-slate-500">
                  No line items yet.
                </td>
              </tr>
            ) : null}
            {inv.items.map((item) =>
              isDraft && edit === item.id ? (
                <tr key={item.id} className="bg-blue-50/40">
                  <td colSpan={colCount} className="px-4 py-3">
                    <form action={updateInvoiceItem} className="space-y-3">
                      <input type="hidden" name="projectId" value={project.id} />
                      <input type="hidden" name="invoiceId" value={inv.id} />
                      <input type="hidden" name="id" value={item.id} />
                      <div className="grid grid-cols-12 gap-3">
                        <Field label="Description" htmlFor={`edit-${item.id}-d`} className="col-span-12 md:col-span-7">
                          <input id={`edit-${item.id}-d`} name="description" className="input" defaultValue={item.description} required />
                        </Field>
                        <Field label="Qty" htmlFor={`edit-${item.id}-q`} className="col-span-4 md:col-span-2">
                          <input id={`edit-${item.id}-q`} name="quantity" type="number" step="any" min="0" className="input" defaultValue={item.quantity} required />
                        </Field>
                        <Field label="Unit price" htmlFor={`edit-${item.id}-p`} className="col-span-8 md:col-span-3">
                          <input id={`edit-${item.id}-p`} name="unitPrice" type="number" step="0.01" className="input" defaultValue={item.unitPrice} required />
                        </Field>
                      </div>
                      <div className="flex items-center gap-2">
                        <SubmitButton size="sm">Save</SubmitButton>
                        <Link href={base} className={buttonClasses("secondary", "sm")}>
                          Cancel
                        </Link>
                      </div>
                    </form>
                  </td>
                </tr>
              ) : (
                <Tr key={item.id}>
                  <Td className="min-w-[240px] text-slate-900">
                    {item.description}
                    {item.isTax ? <span className="ml-2 text-xs text-slate-400">follows the lines above</span> : null}
                  </Td>
                  <Td right>{num(item.quantity)}</Td>
                  <Td right>{money(item.unitPrice)}</Td>
                  <Td right className="font-medium text-slate-900">
                    {money(invoiceLineTotal(item))}
                  </Td>
                  {isDraft && item.isTax ? <Td /> : null}
                  {isDraft && !item.isTax ? (
                    <Td>
                      <span className="flex items-center justify-end gap-1">
                        <Link href={`${base}?edit=${item.id}`} className={buttonClasses("ghost", "sm")}>
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Link>
                        <ConfirmForm action={deleteInvoiceItem} hidden={{ ...itemHidden, id: item.id }} message="Delete this line item?" variant="ghost">
                          <span className="text-rose-700">Delete</span>
                        </ConfirmForm>
                      </span>
                    </Td>
                  ) : null}
                </Tr>
              ),
            )}
          </TBody>
          <TFoot>
            <tr>
              <td className="px-4 py-2.5" colSpan={3}>
                Total
              </td>
              <Td right className="font-semibold text-slate-900">
                {money(total)}
              </Td>
              {isDraft ? <td /> : null}
            </tr>
          </TFoot>
        </Table>
        {isDraft ? (
          <form action={setInvoiceTax} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="invoiceId" value={inv.id} />
            <label className="flex h-9 items-center gap-2 text-sm font-medium text-slate-800">
              <input type="checkbox" name="on" defaultChecked={inv.taxPct !== null} className="h-4 w-4 rounded border-slate-300" />
              Add tax
            </label>
            <Field label="Label" htmlFor="tax-label">
              <input id="tax-label" name="taxLabel" className="input !w-48" defaultValue={inv.taxLabel} />
            </Field>
            <Field label="Rate %" htmlFor="tax-pct">
              <input id="tax-pct" name="taxPct" type="number" step="any" min="0" max="100" className="input !w-28" defaultValue={inv.taxPct ?? ""} />
            </Field>
            <SubmitButton size="sm" variant="secondary">
              Apply
            </SubmitButton>
            <p className="basis-full text-xs text-slate-500">
              {inv.taxPct !== null
                ? "Tax is a line on this invoice and follows the other lines when they change."
                : "The sales tax you pay is already in your estimate's prices — only add tax here for something billed without it."}
            </p>
          </form>
        ) : null}
        {isDraft ? (
          <Collapsible summary="Add line item" defaultOpen={inv.items.length === 0}>
            <form action={createInvoiceItem} className="space-y-3">
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="invoiceId" value={inv.id} />
              <div className="grid grid-cols-12 gap-3">
                <Field label="Description" htmlFor="new-d" className="col-span-12 md:col-span-7">
                  <input id="new-d" name="description" className="input" required />
                </Field>
                <Field label="Qty" htmlFor="new-q" className="col-span-4 md:col-span-2">
                  <input id="new-q" name="quantity" type="number" step="any" min="0" className="input" defaultValue={1} required />
                </Field>
                <Field label="Unit price" htmlFor="new-p" className="col-span-8 md:col-span-3">
                  <input id="new-p" name="unitPrice" type="number" step="0.01" className="input" defaultValue={0} required />
                </Field>
              </div>
              <SubmitButton size="sm">Add item</SubmitButton>
            </form>
          </Collapsible>
        ) : (
          <p className="text-sm text-slate-500">Line items are locked once an invoice has been sent.</p>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Payments</h3>
        {inv.payments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">No payments recorded.</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Date</Th>
                <Th>Method</Th>
                <Th>Reference</Th>
                <Th right>Amount</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {inv.payments.map((p) => (
                <Tr key={p.id}>
                  <Td className="whitespace-nowrap">{fmtDate(p.date)}</Td>
                  <Td>{p.method}</Td>
                  <Td className="text-slate-600">{p.reference ?? "—"}</Td>
                  <Td right className="font-medium text-slate-900">
                    {money(p.amount)}
                  </Td>
                  <Td>
                    <span className="flex justify-end">
                      <ConfirmForm action={deletePayment} hidden={{ ...itemHidden, id: p.id }} message="Remove this payment?" variant="ghost">
                        <span className="text-rose-700">Remove</span>
                      </ConfirmForm>
                    </span>
                  </Td>
                </Tr>
              ))}
            </TBody>
            <TFoot>
              <tr>
                <td className="px-4 py-2.5" colSpan={3}>
                  Paid to date
                </td>
                <Td right className="font-semibold text-slate-900">
                  {money(paid)}
                </Td>
                <td />
              </tr>
            </TFoot>
          </Table>
        )}
        {!isVoid && balance > 0 ? (
          <Collapsible summary="Record payment" defaultOpen={inv.status === "SENT" || inv.status === "PARTIAL"}>
            <form action={recordPayment} className="space-y-3">
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="invoiceId" value={inv.id} />
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Field label="Amount" htmlFor="pay-amount">
                  <input id="pay-amount" name="amount" type="number" step="0.01" min="0.01" className="input" defaultValue={Math.round(balance * 100) / 100} required />
                </Field>
                <Field label="Date" htmlFor="pay-date">
                  <input id="pay-date" name="date" type="date" className="input" defaultValue={dateInput(new Date())} required />
                </Field>
                <Field label="Method" htmlFor="pay-method">
                  <select id="pay-method" name="method" className="input" defaultValue="CHECK">
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Reference" htmlFor="pay-ref">
                  <input id="pay-ref" name="reference" className="input" placeholder="Check # / transaction id" />
                </Field>
              </div>
              <SubmitButton size="sm" variant="success">
                Record payment
              </SubmitButton>
            </form>
          </Collapsible>
        ) : null}
      </div>

      <Collapsible summary="Edit invoice details">
        <form action={updateInvoice} className="space-y-4">
          <input type="hidden" name="projectId" value={project.id} />
          <input type="hidden" name="id" value={inv.id} />
          <FormGrid>
            <Field label="Invoice number" htmlFor="inv-number" hint={isDraft ? "Any number no other invoice uses." : "Set once it's sent."}>
              <input id="inv-number" name="number" type="number" min={1} step={1} className="input" defaultValue={inv.number} disabled={!isDraft} />
            </Field>
            <Field label="Title" htmlFor="inv-title">
              <input id="inv-title" name="title" className="input" defaultValue={inv.title} required />
            </Field>
            <Field label="Issue date" htmlFor="inv-issue">
              <input id="inv-issue" name="issueDate" type="date" className="input" defaultValue={dateInput(inv.issueDate)} required />
            </Field>
            <Field label="Due date" htmlFor="inv-due">
              <input id="inv-due" name="dueDate" type="date" className="input" defaultValue={dateInput(inv.dueDate)} />
            </Field>
            <Field label="Notes (shown on invoice)" htmlFor="inv-notes" className="md:col-span-2">
              <textarea id="inv-notes" name="notes" rows={3} className="input" defaultValue={inv.notes ?? ""} />
            </Field>
          </FormGrid>
          <SubmitButton size="sm">Save</SubmitButton>
        </form>
      </Collapsible>
    </div>
  );
}
