import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { requireVendor } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, money } from "@/lib/utils";
import { PO_STATUS_LABEL, poTotal } from "@/lib/purchasing";
import { Badge, EmptyState, Table, THead, TBody, Tr, Th, Td } from "@/components/ui";

export default async function VendorPosPage() {
  const user = await requireVendor();
  // Drafts haven't been sent to them yet.
  const pos = await db.purchaseOrder.findMany({
    where: { vendorId: user.vendorId, status: { not: "DRAFT" } },
    orderBy: { number: "desc" },
    include: { lines: true, project: { select: { name: true } } },
  });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Purchase orders</h1>
      {pos.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No purchase orders yet" />
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>PO</Th>
              <Th>Job</Th>
              <Th>Title</Th>
              <Th>Sent</Th>
              <Th>Status</Th>
              <Th right>Total</Th>
            </tr>
          </THead>
          <TBody>
            {pos.map((po) => (
              <Tr key={po.id}>
                <Td className="font-mono text-xs">
                  <Link href={`/vendor/pos/${po.id}`} className="text-blue-700 hover:underline">
                    PO-{po.number}
                  </Link>
                </Td>
                <Td className="text-xs">{po.project.name}</Td>
                <Td>
                  <Link href={`/vendor/pos/${po.id}`} className="font-medium text-slate-900 hover:text-blue-700">
                    {po.title}
                  </Link>
                </Td>
                <Td className="whitespace-nowrap">{fmtDate(po.sentAt)}</Td>
                <Td>
                  <Badge status={po.status}>{po.status === "SENT" ? "Waiting for your answer" : PO_STATUS_LABEL[po.status]}</Badge>
                </Td>
                <Td right className="tabular-nums">
                  {money(poTotal(po.lines))}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
