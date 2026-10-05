import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadChangeOrderDoc } from "@/lib/change-order-doc";
import { buttonClasses } from "@/components/ui";
import { ChangeOrderDocument } from "@/components/change-order-document";
import { PrintButton } from "@/components/portal/print-button";

export const metadata = { title: "Change Order" };

/** The client's printable copy of a change order (not drafts; only their own jobs). */
export default async function PortalChangeOrderPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireClient();
  const { id } = await params;
  const co = await db.changeOrder.findFirst({
    where: { id, ...(user.preview ? {} : { status: { not: "DRAFT" } }), project: { clientId: user.clientId } },
    select: { id: true, projectId: true },
  });
  if (!co) notFound();
  const doc = await loadChangeOrderDoc(co.projectId, co.id);
  if (!doc) notFound();
  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href={`/portal/change-orders/${co.id}`} className={buttonClasses("secondary", "sm")}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to change order
        </Link>
        <PrintButton label="Print / Save PDF" />
      </div>
      <ChangeOrderDocument d={doc} />
    </div>
  );
}
