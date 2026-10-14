import Link from "@/components/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, X } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { companyClock } from "@/lib/company-zone";
import { portalHref } from "@/lib/portal";
import { loadProposal } from "@/lib/proposal-data";
import { buildProposal, clientCopy } from "@/lib/proposal-options";
import { money } from "@/lib/utils";
import { SubmitButton, buttonClasses } from "@/components/ui";
import { PrintButton } from "@/app/(app)/projects/[id]/_components/print-button";
import { ProposalPaper } from "@/app/(app)/projects/[id]/estimate/[estimateId]/proposal/proposal-view";
import { approveProposal, declineProposal } from "../../actions";

export const metadata = { title: "Proposal" };

/** The client's proposal: the same document you print, with their Approve / Decline where the signatures go. */
export default async function PortalProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireClient();
  const { id } = await params;
  const est = await db.estimate.findFirst({
    // Client view (you looking) can preview a draft; the client never sees one.
    where: { id, ...(user.preview ? {} : { status: { in: ["SENT", "APPROVED", "DECLINED"] } }), project: { clientId: user.clientId } },
    select: { id: true, projectId: true, status: true, signedBy: true, decidedAt: true, approvedAt: true, decisionNote: true },
  });
  if (!est) notFound();
  const p = await loadProposal(est.projectId, est.id);
  if (!p) notFound();
  // The finished numbers only — the cost lines behind them stay on the server.
  const doc = clientCopy(buildProposal(p.specs, p.options, p.estimate.basePrice, p.extras));
  const { dateTime } = await companyClock();
  const waiting = est.status === "SENT" || (user.preview && est.status === "DRAFT");
  const o = { cover: p.options.cover, intro: p.options.intro, heading: p.options.heading, validDays: p.options.validDays, signer: p.options.signer, clientSignature: p.options.clientSignature };

  return (
    <div className="space-y-4">
      {est.status === "DRAFT" ? (
        <p className="no-print rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <b>Draft</b> — your client can&apos;t see this yet. This is how it will look when you send it.
        </p>
      ) : null}
      <div className="no-print flex items-center justify-between">
        <Link href={portalHref("/portal/proposals", est.projectId)} className={buttonClasses("secondary", "sm")}>
          <ArrowLeft className="h-3.5 w-3.5" /> All proposals
        </Link>
        <PrintButton label="Print / Save PDF" />
      </div>

      <ProposalPaper
        doc={doc}
        o={o}
        basePrice={p.estimate.basePrice}
        pricedOn={p.pricedOn}
        companyName={p.companyName}
        cover={p.cover}
        intro={p.intro}
        header={p.header}
        footer={p.footer}
        signing={
          waiting ? (
            <section className="mt-12 break-inside-avoid rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-lg font-semibold">Your answer</h3>
              <form action={approveProposal} className="mt-3 flex flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={est.id} />
                <label className="min-w-[14rem] flex-1 text-sm">
                  <span className="label">Your full name (signature)</span>
                  <input name="signature" className="input" required defaultValue={user.name} autoComplete="name" />
                </label>
                <SubmitButton variant="success" pendingText="Approving…">
                  <Check className="h-4 w-4" /> Approve
                </SubmitButton>
                <p className="basis-full text-xs text-slate-500">Typing your name acts as your electronic signature. By approving, you accept this proposal for {money(doc.total)}.</p>
              </form>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer font-medium text-rose-700">Decline instead…</summary>
                <form action={declineProposal} className="mt-2 space-y-2">
                  <input type="hidden" name="id" value={est.id} />
                  <textarea name="note" className="input" rows={3} placeholder="Let your builder know why so they can revise it (optional)" aria-label="Reason" />
                  <SubmitButton variant="danger" size="sm" pendingText="Declining…">
                    <X className="h-4 w-4" /> Decline proposal
                  </SubmitButton>
                </form>
              </details>
            </section>
          ) : est.status === "APPROVED" && est.signedBy ? (
            <section className="mt-12 break-inside-avoid rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-semibold">Approved</p>
              <p>
                Signed {est.signedBy} · {dateTime(est.decidedAt ?? est.approvedAt)}
              </p>
            </section>
          ) : est.status === "DECLINED" ? (
            <section className="mt-12 break-inside-avoid rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
              <p className="font-semibold">Declined{est.decidedAt ? ` · ${dateTime(est.decidedAt)}` : ""}</p>
              {est.decisionNote ? <p className="whitespace-pre-line">{est.decisionNote}</p> : null}
            </section>
          ) : undefined
        }
      />
    </div>
  );
}
