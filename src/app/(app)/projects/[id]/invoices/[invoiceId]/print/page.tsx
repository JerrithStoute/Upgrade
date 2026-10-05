import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { getBrand } from "@/lib/company-brand";
import { PrintLogo } from "@/components/brand-mark";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { fmtDate, money, num } from "@/lib/utils";
import { invoiceLineTotal, invoiceTotal, paymentsTotal } from "@/lib/finance";
import { buttonClasses } from "@/components/ui";
import { PrintButton } from "../../../_components/print-button";

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string; invoiceId: string }> }) {
  await requireStaff();
  const brand = await getBrand();
  const { id, invoiceId } = await params;
  const project = await getProject(id);
  const [inv, company] = await Promise.all([
    db.invoice.findFirst({
      where: { id: invoiceId, projectId: project.id },
      include: { items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }, payments: { orderBy: { date: "asc" } } },
    }),
    db.company.findFirst(),
  ]);
  if (!inv) notFound();

  const total = invoiceTotal(inv.items);
  const paid = paymentsTotal(inv.payments);
  const balance = total - paid;
  const client = project.client;
  const companyAddress = [company?.address, [company?.city, company?.state].filter(Boolean).join(", "), company?.zip].filter(Boolean).join(" · ");
  const clientAddress = client ? [client.address, [client.city, client.state].filter(Boolean).join(", "), client.zip].filter(Boolean).join(" · ") : "";
  const projectAddress = [project.address, [project.city, project.state].filter(Boolean).join(", "), project.zip].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href={`/projects/${project.id}/invoices/${inv.id}`} className={buttonClasses("secondary", "sm")}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to invoice
        </Link>
        <PrintButton label="Print / Save PDF" />
      </div>

      <article className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-8 text-slate-900 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-200 pb-6">
          <div>
            <PrintLogo logoUrl={brand.logoUrl} />
            <h1 className="text-2xl font-bold tracking-tight">{company?.name ?? "Your Company"}</h1>
            {companyAddress ? <p className="mt-1 text-sm text-slate-600">{companyAddress}</p> : null}
            <p className="text-sm text-slate-600">{[company?.phone, company?.email].filter(Boolean).join(" · ")}</p>
            {company?.licenseNumber ? <p className="text-sm text-slate-600">License {company.licenseNumber}</p> : null}
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Invoice</p>
            <p className="mt-1 text-2xl font-bold">#{inv.number}</p>
            {inv.status === "VOID" ? <p className="text-sm font-semibold uppercase text-rose-700">Void</p> : null}
            {inv.status === "PAID" ? <p className="text-sm font-semibold uppercase text-emerald-700">Paid</p> : null}
          </div>
        </header>

        <section className="grid grid-cols-1 gap-6 py-6 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Bill to</p>
            {client ? (
              <>
                <p className="mt-1 font-medium">
                  {client.firstName} {client.lastName}
                </p>
                {client.company ? <p className="text-sm text-slate-600">{client.company}</p> : null}
                {clientAddress ? <p className="text-sm text-slate-600">{clientAddress}</p> : null}
                <p className="text-sm text-slate-600">{[client.email, client.phone].filter(Boolean).join(" · ")}</p>
              </>
            ) : (
              <p className="mt-1 text-sm text-slate-500">No client on file</p>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Project</p>
            <p className="mt-1 font-medium">
              #{project.number} — {project.name}
            </p>
            {projectAddress ? <p className="text-sm text-slate-600">{projectAddress}</p> : null}
          </div>
          <div className="text-sm sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Details</p>
            <p className="mt-1">
              <span className="text-slate-500">Title:</span> {inv.title}
            </p>
            <p>
              <span className="text-slate-500">Issued:</span> {fmtDate(inv.issueDate)}
            </p>
            <p>
              <span className="text-slate-500">Due:</span> {fmtDate(inv.dueDate)}
            </p>
          </div>
        </section>

        <section>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-slate-800 text-left text-xs uppercase tracking-wide text-slate-600">
                <th className="py-2 pr-3">Description</th>
                <th className="py-2 pr-3 text-right">Qty</th>
                <th className="py-2 pr-3 text-right">Unit price</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.items.map((i) => (
                <tr key={i.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3">{i.description}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{num(i.quantity)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(i.unitPrice)}</td>
                  <td className="py-2 text-right tabular-nums">{money(invoiceLineTotal(i))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-300">
                <td className="py-2 pr-3 text-right text-slate-600" colSpan={3}>
                  Total
                </td>
                <td className="py-2 text-right font-medium tabular-nums">{money(total)}</td>
              </tr>
              {inv.payments.map((p) => (
                <tr key={p.id} className="text-slate-600">
                  <td className="py-1 pr-3 text-right text-xs" colSpan={3}>
                    Payment {fmtDate(p.date)} · {p.method}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </td>
                  <td className="py-1 text-right text-xs tabular-nums">−{money(p.amount)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-800">
                <td className="py-3 pr-3 text-right text-base font-semibold" colSpan={3}>
                  Balance due
                </td>
                <td className="py-3 text-right text-base font-bold tabular-nums">{money(inv.status === "VOID" ? 0 : balance)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        {inv.notes ? (
          <section className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Notes</h2>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{inv.notes}</p>
          </section>
        ) : null}

        <footer className="mt-10 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
          Thank you for your business. Please reference invoice #{inv.number} with your payment.
          {company?.website ? ` · ${company.website}` : ""}
        </footer>
      </article>
    </div>
  );
}
