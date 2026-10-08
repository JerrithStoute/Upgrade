import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireVendor } from "@/lib/auth";
import { loadPoDoc } from "@/lib/po-doc";
import { buttonClasses } from "@/components/ui";
import { PoDocument } from "@/components/po-document";
import { PrintButton } from "@/app/(app)/projects/[id]/_components/print-button";

export default async function VendorPoPrintPage({ params }: { params: Promise<{ poId: string }> }) {
  const user = await requireVendor();
  const { poId } = await params;
  const doc = await loadPoDoc({ id: poId, vendorId: user.vendorId });
  if (!doc || doc.po.status === "DRAFT") notFound();
  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href={`/vendor/pos/${poId}`} className={buttonClasses("secondary", "sm")}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to PO
        </Link>
        <PrintButton label="Print / Save PDF" />
      </div>
      <PoDocument d={doc} />
    </div>
  );
}
