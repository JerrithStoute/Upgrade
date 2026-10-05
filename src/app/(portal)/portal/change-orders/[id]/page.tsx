import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Printer, X } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPortalProject, portalHref } from "@/lib/portal";
import { money } from "@/lib/utils";
import { loadChangeOrderDoc } from "@/lib/change-order-doc";
import { ChangeOrderDocument } from "@/components/change-order-document";
import { SubmitButton, buttonClasses } from "@/components/ui";
import { approveChangeOrder, declineChangeOrder } from "../../actions";

export const metadata = { title: "Change Order" };

/** The client's change order: one document, their Approve / Decline on their signature line. */
export default async function PortalChangeOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireClient();
  const { id } = await params;
  const co = await db.changeOrder.findFirst({
    // Client view (you looking) can preview a draft; the client never sees one.
    where: { id, ...(user.preview ? {} : { status: { not: "DRAFT" } }), project: { clientId: user.clientId } },
    select: { id: true, projectId: true, status: true, clientApproval: true, clientApprovedAt: true, scheduleImpactDays: true },
  });
  if (!co) notFound();
  const project = await getPortalProject(user.clientId, co.projectId);
  const doc = await loadChangeOrderDoc(co.projectId, co.id);
  if (!doc) notFound();
  // Waiting on this client's signature (it may still need your team's approvals after).
  // (A draft previewed in Client view shows the approval part as the client will get it.)
  const pending = (co.status === "PENDING_APPROVAL" || (user.preview && co.status === "DRAFT")) && co.clientApproval && !co.clientApprovedAt;
  const days = co.scheduleImpactDays || 0;

  return (
    <div className="space-y-4">
      {co.status === "DRAFT" ? (
        <p className="no-print rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <b>Draft</b> — your client can&apos;t see this yet. This is how it will look when you send it.
        </p>
      ) : null}
      <div className="no-print flex items-center justify-between">
        <Link href={portalHref("/portal/change-orders", project.id)} className={buttonClasses("secondary", "sm")}>
          <ArrowLeft className="h-3.5 w-3.5" /> All change orders
        </Link>
        <Link href={`/portal/change-orders/${co.id}/print`} className={buttonClasses("secondary", "sm")}>
          <Printer className="h-3.5 w-3.5" /> Print / Save PDF
        </Link>
      </div>

      <ChangeOrderDocument
        d={doc}
        clientAction={
          pending ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <form action={approveChangeOrder} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={co.id} />
                <label className="min-w-[14rem] flex-1 text-sm">
                  <span className="label">Your full name (signature)</span>
                  <input name="signature" className="input" required defaultValue={user.name} autoComplete="name" />
                </label>
                <SubmitButton variant="success" pendingText="Approving…">
                  <Check className="h-4 w-4" /> Approve
                </SubmitButton>
                <p className="basis-full text-xs text-slate-500">
                  Typing your name acts as your electronic signature. By approving, you authorize this work for {money(doc.totals.total)}
                  {days ? ` and a change of ${days > 0 ? "+" : ""}${days} day${Math.abs(days) === 1 ? "" : "s"} to the schedule` : ""}.
                </p>
              </form>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer font-medium text-rose-700">Decline instead…</summary>
                <form action={declineChangeOrder} className="mt-2 space-y-2">
                  <input type="hidden" name="id" value={co.id} />
                  <textarea name="note" className="input" rows={3} placeholder="Let your builder know why so they can revise it (optional)" aria-label="Reason" />
                  <SubmitButton variant="danger" size="sm" pendingText="Declining…">
                    <X className="h-4 w-4" /> Decline change order
                  </SubmitButton>
                </form>
              </details>
            </div>
          ) : undefined
        }
      />
    </div>
  );
}
