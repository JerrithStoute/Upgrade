import Link from "@/components/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireView } from "@/lib/auth";
import { allows } from "@/lib/access";
import { getProject } from "@/lib/projects";
import { loadInvoiceDoc } from "@/lib/invoice-doc";
import { buttonClasses } from "@/components/ui";
import { InvoiceDocument } from "@/components/invoice-document";
import { PrintButton } from "../../../_components/print-button";
import { EditableHowToPay, SummarySwitch } from "./invoice-paper-controls";

/** The invoice as the client gets it — the same paper as in their portal — ready to print or save as a PDF. */
export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string; invoiceId: string }> }) {
  const user = await requireView("invoices");
  const { id, invoiceId } = await params;
  const project = await getProject(id);
  const d = await loadInvoiceDoc(project.id, invoiceId);
  if (!d) notFound();
  const canEdit = allows(user.access, "invoices", 2);

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href={`/projects/${project.id}/invoices/${d.inv.id}`} className={buttonClasses("secondary", "sm")}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to invoice
        </Link>
        <div className="flex items-center gap-4">
          {canEdit && d.standing ? <SummarySwitch projectId={project.id} invoiceId={d.inv.id} on={d.inv.showSummary} /> : null}
          <PrintButton label="Print / Save PDF" />
        </div>
      </div>
      <InvoiceDocument
        d={d}
        howToPay={
          <EditableHowToPay projectId={project.id} invoiceId={d.inv.id} text={d.company.paymentInstructions} number={d.inv.number} canEdit={canEdit && user.role === "ADMIN"} />
        }
      />
    </div>
  );
}
