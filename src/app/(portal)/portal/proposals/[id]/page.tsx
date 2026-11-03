import Link from "@/components/link";
import { notFound } from "next/navigation";
import { addDays } from "date-fns";
import { Check, X } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { companyClock } from "@/lib/company-zone";
import { portalHref } from "@/lib/portal";
import { loadProposal } from "@/lib/proposal-data";
import { buildProposal, clientCopy } from "@/lib/proposal-options";
import { cn, fmtDate, money } from "@/lib/utils";
import { SubmitButton } from "@/components/ui";
import { PrintButton } from "@/app/(app)/projects/[id]/_components/print-button";
import { ProposalPaper } from "@/app/(app)/projects/[id]/estimate/[estimateId]/proposal/proposal-view";
import { approveProposal, declineProposal } from "../../actions";

export const metadata = { title: "Proposal" };

/** The client's proposal: the short version and their Approve / Decline on top (beside it on a computer), the same document you print below. */
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

  const versions = await db.estimate.count({ where: { projectId: est.projectId, status: { in: ["SENT", "APPROVED", "DECLINED"] } } });
  const [y, m, d] = p.pricedOn.split("-").map(Number);
  const goodThrough = o.validDays > 0 ? addDays(new Date(y, m - 1, d), o.validDays) : null;
  const pill = waiting
    ? { label: "Waiting on you", tone: "bg-amber-50 text-amber-800" }
    : est.status === "APPROVED"
      ? { label: "Approved", tone: "bg-emerald-50 text-emerald-800" }
      : est.status === "DECLINED"
        ? { label: "Declined", tone: "bg-rose-50 text-rose-800" }
        : { label: "Draft", tone: "bg-slate-100 text-slate-600" };
  const day = (x: Date | null) => (x ? fmtDate(x, "MMM d, yyyy") : "");

  return (
    <div className="space-y-4">
      {est.status === "DRAFT" ? (
        <p className="no-print rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <b>Draft</b> — your client can&apos;t see this yet. This is how it will look when you send it.
        </p>
      ) : null}
      <div className="no-print flex items-center justify-between text-sm">
        {/* (With just one, the Proposals tab is this page.) */}
        {versions > 1 ? (
          <Link href={portalHref("/portal/proposals", est.projectId)} className="font-medium text-blue-700 hover:underline">
            ← Proposals
          </Link>
        ) : (
          <span />
        )}
        <PrintButton label="Print / PDF" />
      </div>

      <div className="flex flex-col items-start gap-4 lg:flex-row">
        {/* The short version, and where they sign: first on a phone, beside the paper on a computer. */}
        <aside className="no-print w-full shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm lg:sticky lg:top-32 lg:w-80">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500">Proposal{p.estimate.sentAt ? ` · sent ${fmtDate(p.estimate.sentAt, "MMM d")}` : ""}</span>
            <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", pill.tone)}>{pill.label}</span>
          </div>
          <h1 className="mt-0.5 text-lg font-semibold text-slate-900">{p.cover.projectName}</h1>
          <p className="mt-2 text-xs text-slate-500">Total</p>
          <p className="text-2xl font-semibold tabular-nums text-slate-900">{money(doc.total)}</p>
          {goodThrough && waiting ? <p className="text-xs text-slate-500">Good through {fmtDate(goodThrough, "MMM d")}</p> : null}

          {waiting ? (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <form action={approveProposal} className="space-y-2">
                <input type="hidden" name="id" value={est.id} />
                <label className="block text-xs text-slate-500">
                  Your full name (signature)
                  <input name="signature" className="input mt-1" required defaultValue={user.name} autoComplete="name" />
                </label>
                <SubmitButton variant="success" pendingText="Approving…" className="w-full justify-center">
                  <Check className="h-4 w-4" /> Approve proposal
                </SubmitButton>
                <p className="text-xs text-slate-500">Typing your name acts as your electronic signature. By approving, you accept this proposal for {money(doc.total)}.</p>
              </form>
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer font-medium text-rose-700">Decline instead…</summary>
                <form action={declineProposal} className="mt-2 space-y-2">
                  <input type="hidden" name="id" value={est.id} />
                  <textarea name="note" className="input" rows={3} placeholder="Let your builder know why so they can revise it (optional)" aria-label="Reason" />
                  <SubmitButton variant="danger" size="sm" pendingText="Declining…">
                    <X className="h-4 w-4" /> Decline proposal
                  </SubmitButton>
                </form>
              </details>
            </div>
          ) : est.status === "APPROVED" ? (
            <p className="mt-3 flex items-start gap-1.5 border-t border-slate-100 pt-3 text-sm text-emerald-700">
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
              {est.signedBy ? `You approved this ${day(est.decidedAt ?? est.approvedAt)}, signed ${est.signedBy}` : `Approved ${day(est.decidedAt ?? est.approvedAt)}`}
            </p>
          ) : est.status === "DECLINED" ? (
            <div className="mt-3 border-t border-slate-100 pt-3 text-sm text-rose-700">
              <p>Declined{est.decidedAt ? ` ${day(est.decidedAt)}` : ""}</p>
              {est.decisionNote ? <p className="mt-0.5 whitespace-pre-line text-xs text-slate-600">&ldquo;{est.decisionNote}&rdquo;</p> : null}
            </div>
          ) : null}
        </aside>

        <div className="min-w-0 flex-1">
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
              // What prints at the end once they've answered (on screen it's in the card).
              est.status === "APPROVED" && est.signedBy ? (
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
      </div>
    </div>
  );
}
