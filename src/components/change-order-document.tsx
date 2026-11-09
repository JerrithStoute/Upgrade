import { FileText } from "lucide-react";
import { fmtDate, fmtDateTime, money, num, cn } from "@/lib/utils";
import type { ChangeOrderDoc } from "@/lib/change-order-doc";
import { DocFooter, DocHeader, PhotoRow, SectionTitle, SignBox, SignLine, TermsText, docColors, type DocPill } from "@/components/doc-parts";

const STATUS: Record<string, DocPill> = {
  DRAFT: { label: "Draft", tone: "draft" },
  PENDING_APPROVAL: { label: "Awaiting approval", tone: "waiting" },
  APPROVED: { label: "Approved", tone: "ok" },
  DECLINED: { label: "Declined", tone: "no" },
  VOID: { label: "Void", tone: "void" },
};

/**
 * A change order as one document, in the same look as the proposal: the header (your logo, its
 * number, dates and status), From / Prepared for / Project, the title, the intro text and pictures,
 * the changes and their prices, the effect on the contract and the schedule, the terms, the closing
 * text, and the approvals — a line for each signer. The client's portal page and both printouts.
 */
export function ChangeOrderDocument({ d }: { d: ChangeOrderDoc }) {
  const { co, totals, doc } = d;
  const hasSelections = d.lines.some((l) => l.kind === "SELECTION");
  const prices = co.showPrices;
  // Client choices' price and allowance beside the difference (the panel can leave them off).
  const allow = hasSelections && prices && doc.allowance;
  const signers = d.signers.length ? d.signers : [{ role: "Client", name: d.client ?? "Client", approvedAt: null, as: null }];
  const st = STATUS[co.status] ?? { label: co.status, tone: "draft" as const };
  const decided = co.status === "APPROVED" || co.status === "DECLINED" ? co.decidedAt : null;
  const days = co.scheduleImpactDays;
  const scheduleShown = doc.schedule && (!!days || !!co.priorCompletion || !!co.newCompletion);
  const kind = doc.heading;
  const number = `${co.number}`;
  // Columns for the lines: item, (choice), (price, allowance), amount / difference.
  const grid = hasSelections ? (allow ? "grid-cols-[1.2fr_1.3fr_auto] sm:grid-cols-[1.2fr_1.3fr_auto_auto_auto]" : prices ? "grid-cols-[1.2fr_1.3fr_auto]" : "grid-cols-[1fr_1fr]") : prices ? "grid-cols-[1fr_auto]" : "grid-cols-1";
  const cell = "border-b border-slate-100 py-2.5";
  const head = "border-b-[1.5px] border-slate-900 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500";

  return (
    <article
      className="proposal-doc mx-auto w-full max-w-4xl rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm sm:p-12 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none"
      style={docColors(d.colors)}
    >
      <DocHeader
        logoUrl={d.company.logoUrl}
        companyName={d.company.name}
        kind={kind}
        number={number}
        dates={[
          ["Issued", fmtDate(co.sentAt ?? co.createdAt)],
          ...(d.contractDate ? [["Contract signed", fmtDate(d.contractDate)] as [string, string]] : []),
        ]}
        pill={{ ...st, label: `${st.label}${decided ? ` ${fmtDate(decided)}` : ""}` }}
        parties={[
          { label: "From", name: d.company.name, lines: d.company.lines },
          { label: "Prepared for", name: d.client, lines: d.clientLines },
          { label: "Project", name: d.project.name, lines: [...(d.project.lines.length ? [d.project.lines.join(", ")] : []), `Job #${d.project.number}`] },
        ]}
      />

      <h1 className="mt-4 font-serif text-2xl">{co.title}</h1>
      {co.introText && doc.intro ? <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{co.introText}</p> : null}
      {doc.files && d.photos.length ? (
        <div className="mt-3">
          <PhotoRow photos={d.photos} />
        </div>
      ) : null}

      {/* The changes; the total is their last row */}
      <SectionTitle>{prices ? "Changes & pricing" : "Changes"}</SectionTitle>
      {co.showItems ? (
        <div className={cn("grid gap-x-4 text-[13.5px]", grid)}>
          <span className={head}>{hasSelections ? "Selection / item" : "Description"}</span>
          {hasSelections ? <span className={head}>Choice</span> : null}
          {allow ? <span className={cn(head, "hidden text-right sm:block")}>Price</span> : null}
          {allow ? <span className={cn(head, "hidden text-right sm:block")}>Allowance</span> : null}
          {prices ? <span className={cn(head, "text-right")}>{hasSelections ? "Difference" : "Amount"}</span> : null}
          {d.lines.map((l) => (
            <Row key={l.id}>
              <span className={cell}>{l.kind === "CHARGE" ? <span className="text-slate-600">Extra charge — {l.description}</span> : l.description}</span>
              {hasSelections ? <span className={cn(cell, "text-slate-700")}>{l.kind === "SELECTION" ? l.choiceName : ""}</span> : null}
              {allow ? <span className={cn(cell, "hidden text-right tabular-nums sm:block")}>{l.kind === "CHARGE" ? "" : money(l.clientPrice)}</span> : null}
              {allow ? <span className={cn(cell, "hidden text-right tabular-nums text-slate-600 sm:block")}>{l.allowance !== null ? money(l.allowance) : ""}</span> : null}
              {prices ? <span className={cn(cell, "text-right tabular-nums")}>{money(l.amount)}</span> : null}
            </Row>
          ))}
          {d.lines.length === 0 ? <span className={cn(cell, "col-span-full text-slate-500")}>No line items.</span> : null}
        </div>
      ) : null}
      <div className="ml-auto mt-4 w-full break-inside-avoid text-sm sm:w-80">
        {co.showItems && prices && (totals.profitLine || totals.tax) ? <Foot label="Subtotal" value={totals.shownSubtotal} /> : null}
        {co.showItems && prices && totals.profitLine ? (
          <Foot label={`${co.profitLabel}${totals.feePct !== null && doc.feePct ? ` (${num(totals.feePct, 2)}%)` : ""}`} value={totals.profit} />
        ) : null}
        {co.showItems && prices && totals.tax ? <Foot label={`${co.taxLabel} (${num(co.taxPct, 3)}%)`} value={totals.tax} /> : null}
        <div className="mt-1.5 flex items-baseline justify-between gap-4 border-y-slate-900 py-2.5 text-base font-bold [border-bottom:3px_double] [border-top:1.5px_solid]">
          <span>This change order</span>
          <span className="tabular-nums">{money(totals.total)}</span>
        </div>
      </div>

      {/* Effect on the contract, and on the schedule */}
      {doc.effect || scheduleShown ? (
        <section className="break-inside-avoid">
          <SectionTitle>{doc.effect ? "Effect on your contract" : "Effect on the schedule"}</SectionTitle>
          <div className={cn("grid overflow-hidden rounded-md border border-slate-200 text-[13.5px]", doc.effect && scheduleShown && "sm:grid-cols-[1.3fr_1fr]")}>
            {doc.effect ? (
              <div className="px-5 py-4">
                <Line label="Original contract" value={money(d.effect.basePrice)} />
                {Math.abs(d.effect.previous) >= 0.005 ? <Line label={`Approved change orders (${d.previousCount})`} value={signed(d.effect.previous)} /> : null}
                <Line label="This change order" value={signed(d.effect.thisOne)} />
                <div className="mt-1.5 flex justify-between gap-3 border-t-[1.5px] border-slate-900 pt-2 font-bold">
                  <span>New contract total</span>
                  <span className="tabular-nums">{money(d.effect.total)}</span>
                </div>
              </div>
            ) : null}
            {scheduleShown ? (
              <div className={cn("bg-[var(--doc-tint)] px-5 py-4", doc.effect && "border-t border-slate-200 sm:border-l sm:border-t-0")}>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">Schedule</p>
                <p className="mt-1 font-serif text-2xl">{days ? `${days > 0 ? "+" : ""}${days} day${Math.abs(days) === 1 ? "" : "s"}` : "No change"}</p>
                {co.priorCompletion || co.newCompletion ? (
                  <p className="mt-1 text-xs text-slate-600">
                    Completion {co.priorCompletion ? `moves from ${fmtDate(co.priorCompletion)} ` : ""}
                    {co.newCompletion ? `to ${fmtDate(co.newCompletion)}` : ""}.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
          {doc.effect ? <p className="mt-1.5 text-xs text-slate-500">Counts the other change orders approved so far.</p> : null}
        </section>
      ) : null}

      {co.terms && doc.terms ? (
        <section>
          <SectionTitle>Terms</SectionTitle>
          <TermsText text={co.terms} />
        </section>
      ) : null}

      {doc.files && d.files.length ? (
        <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-semibold">Attached:</span>
          {d.files.map((f) => (
            <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-blue-700 hover:underline print:text-slate-800">
              <FileText className="h-3.5 w-3.5" /> {f.name}
            </a>
          ))}
        </p>
      ) : null}

      {co.closingText && doc.closing ? <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-slate-700">{co.closingText}</p> : null}

      {/* Approvals: a line for each signer */}
      <SignBox statement="The changes, price and schedule above are approved, and become part of the contract.">
        <div className={cn("mt-5 grid grid-cols-1 gap-8", signers.length > 1 && "sm:grid-cols-2")}>
          {signers.map((s, i) => {
            const declined = !s.approvedAt && co.status === "DECLINED" && s.role === "Client";
            return (
              <div key={i}>
                <SignLine
                  who={s.name}
                  sub={s.role === "Client" ? null : d.company.name}
                  signed={s.approvedAt ? (s.as ?? s.name) : null}
                  stamp={
                    s.approvedAt
                      ? `✓ Approved${s.role === "Client" ? " online" : ""} ${fmtDateTime(s.approvedAt)}`
                      : declined
                        ? `Declined${co.decidedBy ? ` by ${co.decidedBy}` : ""}${co.decidedAt ? ` ${fmtDateTime(co.decidedAt)}` : ""}`
                        : null
                  }
                  declined={declined}
                />
                {declined && co.decisionNote ? <p className="mt-1 text-sm text-slate-600">Reason: {co.decisionNote}</p> : null}
              </div>
            );
          })}
        </div>
      </SignBox>

      <DocFooter left={d.footer} right={`${kind} No. ${number} · Job #${d.project.number}`} />
    </article>
  );
}

/** One line's cells (a grid row; keeps a line's cells together across a page break). */
function Row({ children }: { children: React.ReactNode }) {
  return <div className="contents break-inside-avoid">{children}</div>;
}

const signed = (n: number) => `${n < 0 ? "−" : "+"} ${money(Math.abs(n))}`;

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-slate-600">
      <span>{label}</span>
      <span className="tabular-nums text-slate-900">{value}</span>
    </div>
  );
}

function Foot({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-slate-600">
      <span>{label}</span>
      <span className="tabular-nums text-slate-900">{money(value)}</span>
    </div>
  );
}
