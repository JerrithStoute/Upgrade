import Link from "@/components/link";
import { notFound } from "next/navigation";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPortalProject, portalHref, invoiceTotals } from "@/lib/portal";
import { cn, fmtDate, money } from "@/lib/utils";
import { isOverdue } from "@/lib/finance";
import { PrintButton } from "@/components/portal/print-button";
import { loadInvoiceDoc } from "@/lib/invoice-doc";
import { InvoiceDocument } from "@/components/invoice-document";

export const metadata = { title: "Invoice" };

export default async function PortalInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireClient();
  const { id } = await params;
  const invoice = await db.invoice.findFirst({
    // Client view (you looking) can preview a draft; the client never sees one.
    where: { id, ...(user.preview ? {} : { status: { not: "DRAFT" } }), project: { clientId: user.clientId } },
    include: { items: { orderBy: { sortOrder: "asc" } }, payments: { orderBy: { date: "asc" } } },
  });
  if (!invoice) notFound();
  const project = await getPortalProject(user.clientId, invoice.projectId);
  const doc = await loadInvoiceDoc(invoice.projectId, invoice.id);
  if (!doc) notFound();
  const { total, paid, balance } = invoiceTotals(invoice);
  const overdue = isOverdue(invoice) && balance > 0.005;
  const pill =
    invoice.status === "VOID"
      ? { label: "Void", tone: "bg-slate-100 text-slate-600" }
      : balance <= 0.005
        ? { label: "Paid", tone: "bg-emerald-50 text-emerald-800" }
        : overdue
          ? { label: "Overdue", tone: "bg-rose-50 text-rose-800" }
          : paid > 0.005
            ? { label: "Partly paid", tone: "bg-amber-50 text-amber-800" }
            : { label: "Due", tone: "bg-amber-50 text-amber-800" };

  return (
    <>
      {invoice.status === "DRAFT" ? (
        <p className="no-print mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <b>Draft</b> — your client can&apos;t see this yet. This is how it will look when you send it.
        </p>
      ) : null}
      {/* The short version first (beside the paper on a computer); printing gets just the paper. */}
      <div className="space-y-4">
        <div className="no-print flex items-center justify-between text-sm">
          <Link href={portalHref("/portal/invoices", project.id)} className="font-medium text-blue-700 hover:underline">
            ← Invoices
          </Link>
          <PrintButton label="Print / PDF" />
        </div>
        <div className="flex flex-col items-start gap-4 lg:flex-row">
          <aside className="no-print w-full shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm lg:sticky lg:top-32 lg:w-80">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">Invoice #{invoice.number}</span>
              <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", pill.tone)}>{pill.label}</span>
            </div>
            <h1 className="mt-0.5 text-lg font-semibold text-slate-900">{invoice.title}</h1>
            <div className="mt-2 flex gap-6">
              <div>
                <p className="text-xs text-slate-500">{invoice.status === "VOID" ? "Total" : "Balance due"}</p>
                <p className="text-xl font-semibold tabular-nums text-slate-900">{money(invoice.status === "VOID" ? total : balance)}</p>
              </div>
              {invoice.dueDate && balance > 0.005 && invoice.status !== "VOID" ? (
                <div>
                  <p className="text-xs text-slate-500">Due</p>
                  <p className={cn("text-xl font-semibold", overdue ? "text-rose-700" : "text-slate-900")}>{fmtDate(invoice.dueDate, "MMM d")}</p>
                </div>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Issued {fmtDate(invoice.issueDate, "MMM d")} · Total {money(total)} · Paid {money(paid)}
            </p>
            {invoice.notes ? <p className="mt-3 whitespace-pre-line border-t border-slate-100 pt-3 text-sm text-slate-700">{invoice.notes}</p> : null}
          </aside>

          <div className="w-full min-w-0 flex-1">
            <InvoiceDocument d={doc} />
          </div>
        </div>
      </div>
    </>
  );
}
