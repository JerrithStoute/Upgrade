import { CheckCircle2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { nextInvoiceNumber } from "@/lib/projects";
import { Card, CardBody, CardHeader, SubmitButton } from "@/components/ui";
import { saveBilling } from "./actions";

export const metadata = { title: "Billing" };

/** What flows on by itself (overages → change orders → invoices) and how invoices are numbered. */
export default async function BillingSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireAdmin();
  const { saved } = await searchParams;
  const [company, next, highest] = await Promise.all([
    db.company.findFirst({ select: { autoSelectionCO: true, autoInvoiceCO: true, invoiceNumbering: true, invoiceNextNumber: true } }),
    nextInvoiceNumber(),
    db.invoice.findFirst({ orderBy: { number: "desc" }, select: { number: true } }),
  ]);
  const c = company ?? { autoSelectionCO: true, autoInvoiceCO: true, invoiceNumbering: "AUTO", invoiceNextNumber: null };
  const box = "flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-800 has-[:checked]:border-blue-300 has-[:checked]:bg-blue-50/50";

  return (
    <form action={saveBilling} className="space-y-6">
      {saved ? (
        <p className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> Saved.
        </p>
      ) : null}

      <Card>
        <CardHeader title="Selections → change orders → invoices" description="Money moving on by itself, so nothing gets missed. Turn either off to do it by hand." />
        <CardBody className="space-y-3">
          <label className={box}>
            <input type="checkbox" name="autoSelectionCO" defaultChecked={c.autoSelectionCO} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
            <span>
              <span className="block font-medium">Selection overages and credits go on a change order</span>
              <span className="block text-xs text-slate-500">
                When a choice is made — by you or the client — the difference from the allowance goes on the job&apos;s draft &ldquo;Selections&rdquo; change order (started if
                there isn&apos;t one). A new choice updates it while it&apos;s a draft; clearing the choice takes it off.
              </span>
            </span>
          </label>
          <label className={box}>
            <input type="checkbox" name="autoInvoiceCO" defaultChecked={c.autoInvoiceCO} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
            <span>
              <span className="block font-medium">Approved change orders go on the next invoice</span>
              <span className="block text-xs text-slate-500">
                The moment a change order is approved, it&apos;s added to the job&apos;s draft invoice (started if there isn&apos;t one). A change order is never billed twice.
              </span>
            </span>
          </label>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Invoice numbers"
          description={`Every invoice has its own number, across all jobs. ${highest ? `The highest used is #${highest.number}.` : "None used yet."}`}
        />
        <CardBody className="space-y-3">
          <label className={box}>
            <input type="radio" name="invoiceNumbering" value="AUTO" defaultChecked={c.invoiceNumbering !== "MANUAL"} className="mt-0.5 h-4 w-4" />
            <span className="min-w-0">
              <span className="block font-medium">Number them for me</span>
              <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                Start at
                <input
                  name="invoiceNextNumber"
                  type="number"
                  min={1}
                  step={1}
                  defaultValue={c.invoiceNextNumber ?? ""}
                  placeholder={String(next)}
                  className="input !h-8 !w-28 !py-0 text-right"
                  aria-label="Start invoice numbers at"
                />
                <span>
                  — next invoice is <strong>#{next}</strong>. To carry on from QuickBooks, enter its next number. A number below the highest used isn&apos;t used (no two invoices
                  share one).
                </span>
              </span>
            </span>
          </label>
          <label className={box}>
            <input type="radio" name="invoiceNumbering" value="MANUAL" defaultChecked={c.invoiceNumbering === "MANUAL"} className="mt-0.5 h-4 w-4" />
            <span>
              <span className="block font-medium">I&apos;ll type them</span>
              <span className="block text-xs text-slate-500">
                A new invoice asks for its number (the next unused one is filled in to start). Invoices the app starts by itself — for an approved change order — get the next
                unused number; change it on the invoice while it&apos;s a draft.
              </span>
            </span>
          </label>
          <p className="text-xs text-slate-500">Either way, a draft invoice&apos;s number can be changed under &ldquo;Edit invoice details&rdquo;.</p>
        </CardBody>
      </Card>

      <SubmitButton>Save</SubmitButton>
    </form>
  );
}
