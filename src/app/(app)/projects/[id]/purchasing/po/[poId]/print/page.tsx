import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { getProject } from "@/lib/projects";
import { loadPoDoc } from "@/lib/po-doc";
import { buttonClasses } from "@/components/ui";
import { PoDocument } from "@/components/po-document";
import { PrintButton } from "../../../../_components/print-button";

export default async function PurchaseOrderPrintPage({ params }: { params: Promise<{ id: string; poId: string }> }) {
  await requireStaff();
  const { id, poId } = await params;
  const project = await getProject(id);
  const doc = await loadPoDoc({ id: poId, projectId: project.id });
  if (!doc) notFound();
  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href={`/projects/${project.id}/purchasing/po/${poId}`} className={buttonClasses("secondary", "sm")}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to PO
        </Link>
        <PrintButton label="Print / Save PDF" />
      </div>
      <PoDocument d={doc} />
    </div>
  );
}
