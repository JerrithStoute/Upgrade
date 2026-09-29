import Link from "next/link";
import { addDays } from "date-fns";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject, contractValue, nextInvoiceNumber } from "@/lib/projects";
import { dateInput, money } from "@/lib/utils";
import { changeOrderNumberFromDescription, linePriceOfChangeOrder } from "@/lib/finance";
import { Card, CardBody, CardHeader, Field, FormGrid, SubmitButton, buttonClasses } from "@/components/ui";
import { createInvoice } from "../actions";

export default async function NewInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const project = await getProject(id);
  const [number, contract, approvedCOs, invoiceItems] = await Promise.all([
    nextInvoiceNumber(),
    contractValue(project.id, project.contractAmount),
    db.changeOrder.findMany({ where: { projectId: project.id, status: "APPROVED" }, include: { items: true }, orderBy: { number: "asc" } }),
    db.invoiceItem.findMany({ where: { invoice: { projectId: project.id, status: { not: "VOID" } } }, select: { description: true } }),
  ]);
  const billedCoNumbers = new Set(invoiceItems.map((i) => changeOrderNumberFromDescription(i.description)).filter((n): n is number => n !== null));
  const unbilledCOs = approvedCOs.filter((co) => !billedCoNumbers.has(co.number));
  const today = new Date();

  return (
    <Card className="max-w-4xl">
      <CardHeader title={`New invoice #${number}`} description="Set the basics and add opening line items. You can refine items on the invoice page before sending." />
      <CardBody>
        <form action={createInvoice} className="space-y-6">
          <input type="hidden" name="projectId" value={project.id} />
          <FormGrid>
            <Field label="Title" htmlFor="inv-title" className="md:col-span-2">
              <input id="inv-title" name="title" className="input" required placeholder="e.g. Draw 4 — Cabinets installed" />
            </Field>
            <Field label="Issue date" htmlFor="inv-issue">
              <input id="inv-issue" name="issueDate" type="date" className="input" defaultValue={dateInput(today)} required />
            </Field>
            <Field label="Due date" htmlFor="inv-due">
              <input id="inv-due" name="dueDate" type="date" className="input" defaultValue={dateInput(addDays(today, 14))} />
            </Field>
            <Field label="Notes (shown on invoice)" htmlFor="inv-notes" className="md:col-span-2">
              <textarea id="inv-notes" name="notes" rows={2} className="input" placeholder="Payment instructions, thank-you note…" />
            </Field>
          </FormGrid>

          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
            <h3 className="text-sm font-semibold text-slate-900">Quick add</h3>
            <div>
              <p className="label">Approved change orders not yet invoiced</p>
              {unbilledCOs.length === 0 ? (
                <p className="text-sm text-slate-500">None — every approved change order has been billed.</p>
              ) : (
                <ul className="space-y-1.5">
                  {unbilledCOs.map((co) => (
                    <li key={co.id}>
                      <label className="flex items-center gap-2 text-sm text-slate-800">
                        <input type="checkbox" name="changeOrderIds" value={co.id} className="h-4 w-4 rounded border-slate-300" />
                        <span className="font-mono text-xs text-slate-500">CO #{co.number}</span>
                        {co.title}
                        <span className="ml-auto tabular-nums">{money(linePriceOfChangeOrder(co.items))}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Field label="Percent of contract" htmlFor="inv-pct" hint={`Adds a "Progress draw (X%)" line. Contract value ${money(contract)} — 10% = ${money(contract * 0.1)}.`} className="max-w-xs">
              <div className="flex items-center gap-2">
                <input id="inv-pct" name="percentOfContract" type="number" step="0.5" min="0" max="100" className="input" placeholder="0" />
                <span className="text-sm text-slate-500">%</span>
              </div>
            </Field>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Line items</h3>
            <div className="space-y-2">
              <div className="hidden grid-cols-12 gap-2 text-xs font-medium uppercase tracking-wide text-slate-500 md:grid">
                <span className="col-span-7">Description</span>
                <span className="col-span-2">Qty</span>
                <span className="col-span-3">Unit price</span>
              </div>
              {[0, 1, 2].map((i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <input name="itemDescription" className="input col-span-12 md:col-span-7" placeholder={i === 0 ? "Description" : ""} aria-label={`Item ${i + 1} description`} />
                  <input name="itemQuantity" type="number" step="any" min="0" className="input col-span-4 md:col-span-2" defaultValue={1} aria-label={`Item ${i + 1} quantity`} />
                  <input name="itemUnitPrice" type="number" step="0.01" min="0" className="input col-span-8 md:col-span-3" placeholder="0.00" aria-label={`Item ${i + 1} unit price`} />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <SubmitButton>Create invoice</SubmitButton>
            <Link href={`/projects/${project.id}/invoices`} className={buttonClasses("secondary")}>
              Cancel
            </Link>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
