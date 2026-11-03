import Link from "@/components/link";
import { notFound } from "next/navigation";
import { Check, Printer, X } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPortalProject, portalHref } from "@/lib/portal";
import { cn, fmtDate, money } from "@/lib/utils";
import { loadChangeOrderDoc } from "@/lib/change-order-doc";
import { ChangeOrderDocument } from "@/components/change-order-document";
import { SubmitButton } from "@/components/ui";
import { approveChangeOrder, declineChangeOrder } from "../../actions";

export const metadata = { title: "Change Order" };

/** The client's change order: the short version and their Approve / Decline on top (beside it on a computer), the paper below. */
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

  const client = doc.signers.find((x) => x.role === "Client");
  const status = pending
    ? { label: "Waiting on you", tone: "bg-amber-50 text-amber-800" }
    : co.status === "APPROVED"
      ? { label: "Approved", tone: "bg-emerald-50 text-emerald-800" }
      : co.status === "DECLINED"
        ? { label: "Declined", tone: "bg-rose-50 text-rose-800" }
        : co.status === "VOID"
          ? { label: "Void", tone: "bg-slate-100 text-slate-600" }
          : co.status === "DRAFT"
            ? { label: "Draft", tone: "bg-slate-100 text-slate-600" }
            : // You signed; the builder's own approvals are still to come.
              { label: "Waiting on your builder", tone: "bg-slate-100 text-slate-600" };
  const signed = (d: Date | null) => (d ? fmtDate(d, "MMM d, yyyy") : "");

  return (
    <div className="space-y-4">
      {co.status === "DRAFT" ? (
        <p className="no-print rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <b>Draft</b> — your client can&apos;t see this yet. This is how it will look when you send it.
        </p>
      ) : null}
      <div className="no-print flex items-center justify-between text-sm">
        <Link href={portalHref("/portal/change-orders", project.id)} className="font-medium text-blue-700 hover:underline">
          ← Change orders
        </Link>
        <Link href={`/portal/change-orders/${co.id}/print`} className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900">
          <Printer className="h-3.5 w-3.5" /> Print / PDF
        </Link>
      </div>

      <div className="flex flex-col items-start gap-4 lg:flex-row">
        {/* The short version, and where they sign: first on a phone, beside the paper on a computer. */}
        <aside className="no-print w-full shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm lg:sticky lg:top-32 lg:w-80">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500">Change order #{doc.co.number}</span>
            <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", status.tone)}>{status.label}</span>
          </div>
          <h1 className="mt-0.5 text-lg font-semibold text-slate-900">{doc.co.title}</h1>
          <div className="mt-2 flex gap-6">
            <div>
              <p className="text-xs text-slate-500">This change</p>
              <p className="text-xl font-semibold tabular-nums text-slate-900">
                {doc.totals.total > 0 ? "+" : ""}
                {money(doc.totals.total)}
              </p>
            </div>
            {doc.doc.schedule && days ? (
              <div>
                <p className="text-xs text-slate-500">Schedule</p>
                <p className="text-xl font-semibold tabular-nums text-slate-900">
                  {days > 0 ? "+" : ""}
                  {days} day{Math.abs(days) === 1 ? "" : "s"}
                </p>
              </div>
            ) : null}
          </div>
          {doc.doc.effect ? <p className="mt-1 text-xs text-slate-500">New contract total {money(doc.effect.total)}</p> : null}

          {pending ? (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <form action={approveChangeOrder} className="space-y-2">
                <input type="hidden" name="id" value={co.id} />
                <label className="block text-xs text-slate-500">
                  Your full name (signature)
                  <input name="signature" className="input mt-1" required defaultValue={user.name} autoComplete="name" />
                </label>
                <SubmitButton variant="success" pendingText="Approving…" className="w-full justify-center">
                  <Check className="h-4 w-4" /> Approve
                </SubmitButton>
                <p className="text-xs text-slate-500">
                  Typing your name acts as your electronic signature. By approving, you authorize this work for {money(doc.totals.total)}
                  {days && doc.doc.schedule ? ` and a change of ${days > 0 ? "+" : ""}${days} day${Math.abs(days) === 1 ? "" : "s"} to the schedule` : ""}.
                </p>
              </form>
              <details className="mt-2 text-sm">
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
          ) : client?.approvedAt ? (
            <p className="mt-3 flex items-start gap-1.5 border-t border-slate-100 pt-3 text-sm text-emerald-700">
              <Check className="mt-0.5 h-4 w-4 shrink-0" /> You approved this {signed(client.approvedAt)}
              {client.as ? `, signed ${client.as}` : ""}
            </p>
          ) : co.status === "APPROVED" && doc.co.decidedAt ? (
            // Approved without their signature here (signed on paper, or no client approval needed).
            <p className="mt-3 flex items-start gap-1.5 border-t border-slate-100 pt-3 text-sm text-emerald-700">
              <Check className="mt-0.5 h-4 w-4 shrink-0" /> Approved {signed(doc.co.decidedAt)}
            </p>
          ) : co.status === "DECLINED" ? (
            <div className="mt-3 border-t border-slate-100 pt-3 text-sm text-rose-700">
              <p>Declined{doc.co.decidedAt ? ` ${signed(doc.co.decidedAt)}` : ""}</p>
              {doc.co.decisionNote ? <p className="mt-0.5 text-xs text-slate-600">&ldquo;{doc.co.decisionNote}&rdquo;</p> : null}
            </div>
          ) : null}
        </aside>

        <div className="min-w-0 flex-1">
          <ChangeOrderDocument d={doc} />
        </div>
      </div>
    </div>
  );
}
