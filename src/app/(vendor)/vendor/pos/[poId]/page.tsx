import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { requireVendor } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadPoDoc } from "@/lib/po-doc";
import { fmtDateTime, money } from "@/lib/utils";
import { BILL_STATUS_LABEL, PO_STATUS_LABEL, billTotal, poBilling } from "@/lib/purchasing";
import { Badge, Button, ButtonLink, buttonClasses } from "@/components/ui";
import { PoDocument } from "@/components/po-document";
import { respondToPo } from "../../actions";

export default async function VendorPoPage({ params }: { params: Promise<{ poId: string }> }) {
  const user = await requireVendor();
  const { poId } = await params;
  const doc = await loadPoDoc({ id: poId, vendorId: user.vendorId });
  if (!doc || doc.po.status === "DRAFT") notFound();
  const { po } = doc;
  const [billing, bills] = await Promise.all([
    poBilling(po.id),
    db.vendorBill.findMany({ where: { purchaseOrderId: po.id, vendorId: user.vendorId }, include: { lines: true }, orderBy: { billDate: "asc" } }),
  ]);
  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/vendor/pos" className="text-xs text-slate-500 hover:text-slate-800">
            ← Purchase orders
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-semibold text-slate-900">
            PO-{po.number}
            <Badge status={po.status}>{po.status === "SENT" ? "Waiting for your answer" : PO_STATUS_LABEL[po.status]}</Badge>
          </h1>
          {po.respondedAt ? (
            <p className="text-xs text-slate-500">
              {po.status === "DECLINED" ? "Declined" : "Accepted"} {fmtDateTime(po.respondedAt)}
              {po.responseNote ? ` — “${po.responseNote}”` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/vendor/pos/${po.id}/print`} className={buttonClasses("secondary", "sm")}>
            <Printer className="h-3.5 w-3.5" /> Print / PDF
          </Link>
          {po.status === "SENT" || po.status === "ACCEPTED" ? (
            <ButtonLink href={`/vendor/bills?po=${po.id}`} size="sm" variant="secondary">
              Send a bill for this PO
            </ButtonLink>
          ) : null}
        </div>
      </div>

      {po.status === "SENT" ? (
        <div className="no-print grid gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4 md:grid-cols-2">
          <form action={respondToPo} className="space-y-2">
            <input type="hidden" name="id" value={po.id} />
            <input type="hidden" name="answer" value="accept" />
            <p className="text-sm text-slate-700">Agree to do this work or supply this for {money(doc.total)}?</p>
            <input name="note" className="input" placeholder="Note (optional) — e.g. can start the 14th" />
            <Button type="submit" variant="success">
              Accept PO
            </Button>
          </form>
          <form action={respondToPo} className="space-y-2">
            <input type="hidden" name="id" value={po.id} />
            <input type="hidden" name="answer" value="decline" />
            <p className="text-sm text-slate-700">Can&apos;t do it as written? Tell us why.</p>
            <input name="note" className="input" placeholder="Why (helps us fix it)" />
            <Button type="submit" variant="secondary">
              Decline
            </Button>
          </form>
        </div>
      ) : null}

      {billing && bills.length ? (
        <div className="no-print rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
          <p className="font-medium text-slate-800">
            Billed {money(billing.billed)} of {money(billing.total)} · {money(billing.left)} left
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
            {bills.map((b) => (
              <li key={b.id}>
                {b.billNumber ? `#${b.billNumber} · ` : ""}
                {money(billTotal(b.lines))} — {BILL_STATUS_LABEL[b.status]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <PoDocument d={doc} />
    </div>
  );
}
