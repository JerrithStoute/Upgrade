import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { getProject } from "@/lib/projects";
import { loadChangeOrderDoc } from "@/lib/change-order-doc";
import { buttonClasses } from "@/components/ui";
import { ChangeOrderDocument } from "@/components/change-order-document";
import { PrintButton } from "../../../_components/print-button";

export default async function ChangeOrderPrintPage({ params }: { params: Promise<{ id: string; coId: string }> }) {
  await requireStaff();
  const { id, coId } = await params;
  const project = await getProject(id);
  const doc = await loadChangeOrderDoc(project.id, coId);
  if (!doc) notFound();
  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href={`/projects/${project.id}/change-orders/${coId}`} className={buttonClasses("secondary", "sm")}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to change order
        </Link>
        <PrintButton label="Print / Save PDF" />
      </div>
      <ChangeOrderDocument d={doc} />
    </div>
  );
}
