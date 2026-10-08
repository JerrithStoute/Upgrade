import Link from "next/link";
import { requireVendor } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateInput, fmtDate, money } from "@/lib/utils";
import { billTotal, poBilling } from "@/lib/purchasing";
import { Badge, Card, CardBody, CardHeader, SubmitButton, Table, THead, TBody, Tr, Th, Td } from "@/components/ui";
import { uploadVendorBill } from "../actions";

/** What a sub / vendor sees of their bills: sent, approved, paid — and a form to send one. */
const SHOWN: Record<string, string> = { PENDING: "Received", APPROVED: "Approved — payment coming", PAID: "Paid", REJECTED: "Returned — call us" };

export default async function VendorBillsPage({ searchParams }: { searchParams: Promise<{ po?: string; sent?: string }> }) {
  const user = await requireVendor();
  const { po: poId, sent } = await searchParams;
  const [bills, pos] = await Promise.all([
    db.vendorBill.findMany({
      where: { vendorId: user.vendorId },
      orderBy: [{ billDate: "desc" }, { createdAt: "desc" }],
      include: { lines: true, purchaseOrder: { select: { number: true } }, project: { select: { name: true } } },
    }),
    db.purchaseOrder.findMany({
      where: { vendorId: user.vendorId, status: { in: ["SENT", "ACCEPTED"] } },
      orderBy: { number: "desc" },
      include: { project: { select: { name: true } } },
    }),
  ]);
  const lefts = await Promise.all(pos.map((p) => poBilling(p.id)));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Bills</h1>
      {sent ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          Got it — your bill is in. You&apos;ll see it change here when it&apos;s approved and paid.
        </p>
      ) : null}

      <Card>
        <CardHeader title="Send a bill" description="Bill against a PO we sent you. Attach your invoice (PDF or a photo)." />
        <CardBody>
          {pos.length === 0 ? (
            <p className="text-sm text-slate-500">You don&apos;t have an open PO with us right now. Call us if you need to bill for something.</p>
          ) : (
            <form action={uploadVendorBill} className="grid gap-3 md:grid-cols-4">
              <label className="space-y-1 md:col-span-2">
                <span className="label">PO</span>
                <select name="purchaseOrderId" className="input" defaultValue={poId ?? pos[0].id} required>
                  {pos.map((p, i) => (
                    <option key={p.id} value={p.id}>
                      PO-{p.number} · {p.project.name} · {p.title}
                      {lefts[i] ? ` (${money(lefts[i]!.left)} left)` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="label">Your invoice #</span>
                <input name="billNumber" className="input" />
              </label>
              <label className="space-y-1">
                <span className="label">Amount</span>
                <input name="amount" type="number" step="0.01" min="0.01" required className="input" />
              </label>
              <label className="space-y-1">
                <span className="label">Invoice date</span>
                <input name="billDate" type="date" required className="input" defaultValue={dateInput(new Date())} />
              </label>
              <label className="space-y-1">
                <span className="label">Due</span>
                <input name="dueDate" type="date" className="input" />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="label">For (optional)</span>
                <input name="description" className="input" placeholder="e.g. Rough-in, 50% draw" />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="label">Your invoice file</span>
                <input name="file" type="file" required accept=".pdf,image/*" className="block w-full text-sm" />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="label">Note (optional)</span>
                <input name="notes" className="input" />
              </label>
              <div className="md:col-span-4">
                <SubmitButton pendingText="Sending…">Send bill</SubmitButton>
              </div>
            </form>
          )}
        </CardBody>
      </Card>

      {bills.length ? (
        <Table>
          <THead>
            <tr>
              <Th>Date</Th>
              <Th>Job</Th>
              <Th>PO</Th>
              <Th>Your #</Th>
              <Th>Status</Th>
              <Th right>Amount</Th>
            </tr>
          </THead>
          <TBody>
            {bills.map((b) => (
              <Tr key={b.id}>
                <Td className="whitespace-nowrap">{fmtDate(b.billDate)}</Td>
                <Td className="text-xs">{b.project.name}</Td>
                <Td className="font-mono text-xs">{b.purchaseOrder ? `PO-${b.purchaseOrder.number}` : "—"}</Td>
                <Td className="text-xs">
                  {b.fileId ? (
                    <Link href={`/api/files/${b.fileId}`} target="_blank" className="text-blue-700 hover:underline">
                      {b.billNumber ?? "Open"}
                    </Link>
                  ) : (
                    (b.billNumber ?? "—")
                  )}
                </Td>
                <Td>
                  <Badge status={b.status}>{SHOWN[b.status]}</Badge>
                  {b.status === "PAID" && b.paidAt ? (
                    <span className="block text-xs text-slate-500">
                      {fmtDate(b.paidAt)}
                      {b.paidReference ? ` · ${b.paidReference}` : ""}
                    </span>
                  ) : null}
                </Td>
                <Td right className="tabular-nums">
                  {money(billTotal(b.lines))}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      ) : null}
    </div>
  );
}
