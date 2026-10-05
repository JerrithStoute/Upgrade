import { FileText } from "lucide-react";
import { fmtDate, fmtDateTime, money, num, cn } from "@/lib/utils";
import type { ChangeOrderDoc } from "@/lib/change-order-doc";

const STATUS: Record<string, [string, string]> = {
  DRAFT: ["Draft", "text-slate-600"],
  PENDING_APPROVAL: ["Awaiting approval", "text-amber-700"],
  APPROVED: ["Approved", "text-emerald-700"],
  DECLINED: ["Declined", "text-rose-700"],
  VOID: ["Void", "text-slate-500"],
};

/**
 * A change order as one document, top to bottom: the title and its status, the dates,
 * your company and the job, the intro text, the line items (their total in the table),
 * the effect on the contract, terms and dates, the closing text and the approvals —
 * a signature line for each, where the client's Approve / Decline sits on theirs.
 * The client's portal page and both printouts.
 */
export function ChangeOrderDocument({
  d,
  clientAction,
}: {
  d: ChangeOrderDoc;
  /** The client's Approve / Decline, on their signature line (portal). */ clientAction?: React.ReactNode;
}) {
  const { co, totals } = d;
  const hasSelections = d.lines.some((l) => l.kind === "SELECTION");
  const prices = co.showPrices;
  // Columns: item, (choice), (client price, allowance), price / difference.
  const cols = 1 + (hasSelections ? 1 : 0) + (prices ? (hasSelections ? 3 : 1) : 0);
  const [status, statusTone] = STATUS[co.status] ?? [co.status, "text-slate-600"];
  const signers = d.signers.length ? d.signers : [{ role: "Client", name: d.client ?? "Client", approvedAt: null, as: null }];

  return (
    <article className="proposal-doc mx-auto w-full max-w-4xl rounded-xl border border-slate-200 bg-white p-5 text-slate-900 sm:p-10 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      {d.company.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={d.company.logoUrl} alt={d.company.name} className="mx-auto max-h-24 max-w-[16rem] object-contain" />
      ) : null}

      {/* Title and status */}
      <header className={cn("text-center", d.company.logoUrl && "mt-6")}>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Change Order #{co.number}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{co.title}</h1>
        <p className="mt-1 text-sm">
          <span className="font-semibold text-slate-700">Status:</span> <span className={cn("font-semibold", statusTone)}>{status}</span>
        </p>
      </header>

      {/* Dates, then you and the job */}
      <section className="mt-8 space-y-0.5 text-sm">
        <p>
          <span className="font-semibold">Document date:</span> {fmtDate(co.sentAt ?? co.createdAt, "EEEE, MMMM d, yyyy")}
        </p>
        {d.contractDate ? (
          <p>
            <span className="font-semibold">Contract date:</span> {fmtDate(d.contractDate, "EEEE, MMMM d, yyyy")}
          </p>
        ) : null}
      </section>
      <section className="mt-4 grid gap-6 text-sm leading-relaxed sm:grid-cols-2">
        <div>
          <p className="font-semibold">{d.company.name}</p>
          {d.company.lines.map((l) => (
            <p key={l} className="text-slate-700">
              {l}
            </p>
          ))}
        </div>
        <div className="sm:text-right">
          <p className="font-semibold">Project</p>
          {d.client ? <p className="text-slate-700">{d.client}</p> : null}
          {d.project.lines.length ? (
            d.project.lines.map((l) => (
              <p key={l} className="text-slate-700">
                {l}
              </p>
            ))
          ) : (
            <p className="text-slate-700">{d.project.name}</p>
          )}
        </div>
      </section>

      {co.introText ? <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-slate-700">{co.introText}</p> : null}

      {/* Line items — the total is the table's last row */}
      <section className="mt-8 break-inside-avoid">
        <h2 className="text-lg font-semibold">Line items</h2>
        <table className="mt-2 w-full text-sm">
          {co.showItems ? (
            <>
              <thead>
                <tr className="border-b-2 border-slate-800 text-left text-xs uppercase tracking-wide text-slate-600">
                  <th className="py-2 pr-3">{hasSelections ? "Selection / item" : "Item"}</th>
                  {hasSelections ? <th className="py-2 pr-3">Choice</th> : null}
                  {hasSelections && prices ? <th className="py-2 pr-3 text-right">Client price</th> : null}
                  {hasSelections && prices ? <th className="py-2 pr-3 text-right">Allowance</th> : null}
                  {prices ? <th className="py-2 text-right">{hasSelections ? "Difference" : "Price"}</th> : null}
                </tr>
              </thead>
              <tbody>
                {d.lines.map((l) => (
                  <tr key={l.id} className="break-inside-avoid border-b border-slate-100 align-top">
                    <td className="py-2 pr-3">{l.kind === "CHARGE" ? <span className="text-slate-600">Extra charge — {l.description}</span> : l.description}</td>
                    {hasSelections ? <td className="py-2 pr-3 text-slate-700">{l.kind === "SELECTION" ? l.choiceName : ""}</td> : null}
                    {hasSelections && prices ? <td className="py-2 pr-3 text-right tabular-nums">{l.kind === "CHARGE" ? "" : money(l.clientPrice)}</td> : null}
                    {hasSelections && prices ? <td className="py-2 pr-3 text-right tabular-nums text-slate-600">{l.allowance !== null ? money(l.allowance) : ""}</td> : null}
                    {prices ? <td className="py-2 text-right tabular-nums">{money(l.amount)}</td> : null}
                  </tr>
                ))}
                {d.lines.length === 0 ? (
                  <tr>
                    <td colSpan={cols} className="py-3 text-slate-500">
                      No line items.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </>
          ) : null}
          <tfoot>
            {co.showItems && prices && (totals.profitLine || totals.tax) ? <Foot cols={cols} label="Subtotal" value={totals.shownSubtotal} /> : null}
            {co.showItems && prices && totals.profitLine ? (
              <Foot cols={cols} label={`${co.profitLabel}${totals.feePct !== null ? ` (${num(totals.feePct, 2)}%)` : ""}`} value={totals.profit} />
            ) : null}
            {co.showItems && prices && totals.tax ? <Foot cols={cols} label={`${co.taxLabel} (${num(co.taxPct, 3)}%)`} value={totals.tax} /> : null}
            <tr className="border-y-2 border-slate-800 text-base font-bold">
              <td colSpan={co.showItems ? Math.max(cols - 1, 1) : 1} className="py-2 pr-3">
                Total{co.showItems ? "" : " for this change order"}
              </td>
              <td className="py-2 text-right tabular-nums">{money(totals.total)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      {/* Effect on the contract */}
      <section className="mt-8 break-inside-avoid">
        <h2 className="text-lg font-semibold">Effect on contract total</h2>
        <table className="mt-2 w-full text-sm">
          <tbody className="divide-y divide-slate-200 border-y border-slate-300">
            <tr>
              <td className="py-1.5 font-medium">Base price</td>
              <td className="py-1.5 text-right tabular-nums">{money(d.effect.basePrice)}</td>
            </tr>
            {Math.abs(d.effect.previous) >= 0.005 ? (
              <tr>
                <td className="py-1.5 font-medium">Previously approved change orders</td>
                <td className="py-1.5 text-right tabular-nums">{money(d.effect.previous)}</td>
              </tr>
            ) : null}
            <tr>
              <td className="py-1.5 font-medium">Total from this change order</td>
              <td className="py-1.5 text-right tabular-nums">{money(d.effect.thisOne)}</td>
            </tr>
            <tr className="font-bold">
              <td className="py-1.5">Total price*</td>
              <td className="py-1.5 text-right tabular-nums">{money(d.effect.total)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-1 text-xs text-slate-500">* May not include other change orders approved since this one was created.</p>
      </section>

      {/* Terms, dates, files */}
      {co.terms || co.scheduleImpactDays || co.priorCompletion || co.newCompletion || d.files.length ? (
        <section className="mt-6 break-inside-avoid space-y-1 text-sm text-slate-700">
          {co.terms ? (
            <p>
              <span className="font-semibold text-slate-900">Terms:</span> {co.terms}
            </p>
          ) : null}
          {co.scheduleImpactDays ? (
            <p>
              <span className="font-semibold text-slate-900">Effect on completion date:</span> {co.scheduleImpactDays > 0 ? "+" : ""}
              {co.scheduleImpactDays} day{Math.abs(co.scheduleImpactDays) === 1 ? "" : "s"}
            </p>
          ) : null}
          {co.priorCompletion || co.newCompletion ? (
            <p>
              <span className="font-semibold text-slate-900">Projected completion:</span> {co.priorCompletion ? fmtDate(co.priorCompletion) : "—"} →{" "}
              {co.newCompletion ? fmtDate(co.newCompletion) : "—"}
            </p>
          ) : null}
          {d.files.length ? (
            <p className="flex flex-wrap items-center gap-2 pt-1">
              <span className="font-semibold text-slate-900">Files:</span>
              {d.files.map((f) => (
                <a
                  key={f.id}
                  href={`/api/files/${f.id}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 text-blue-700 hover:underline print:text-slate-800"
                >
                  <FileText className="h-3.5 w-3.5" /> {f.name}
                </a>
              ))}
            </p>
          ) : null}
        </section>
      ) : null}

      {co.closingText ? <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-slate-700">{co.closingText}</p> : null}

      {/* Approvals: a line for each signer; the client's Approve / Decline sits on theirs */}
      <section className="mt-10 break-inside-avoid">
        <h2 className="text-lg font-semibold">Approvals</h2>
        <div className="mt-4 space-y-8">
          {signers.map((s, i) => (
            <div key={i}>
              {s.role === "Client" && clientAction && !s.approvedAt ? <div className="no-print mb-3">{clientAction}</div> : null}
              <div className="grid grid-cols-[1fr_8rem] gap-4 sm:grid-cols-[1fr_12rem] sm:gap-6">
                <div>
                  <div className="flex h-10 items-end border-b border-slate-400 pb-1 text-sm">
                    {s.approvedAt ? (
                      <span className="italic text-emerald-800">Approved electronically{s.as ? ` — ${s.as}` : ""}</span>
                    ) : co.status === "DECLINED" && s.role === "Client" ? (
                      <span className="italic text-rose-700">Declined{co.decidedBy ? ` — ${co.decidedBy}` : ""}</span>
                    ) : (
                      <span className="no-print text-xs text-slate-400">Awaiting approval</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-700">
                    <span className="font-semibold">{s.role === "Client" ? "Client" : "Team member"}:</span> {s.name}
                  </p>
                </div>
                <div>
                  <div className="flex h-10 items-end border-b border-slate-400 pb-1 text-sm text-slate-700">
                    {s.approvedAt ? fmtDateTime(s.approvedAt) : co.status === "DECLINED" && s.role === "Client" && co.decidedAt ? fmtDateTime(co.decidedAt) : ""}
                  </div>
                  <p className="mt-1 text-sm text-slate-700">Date</p>
                </div>
              </div>
              {s.role === "Client" && co.status === "DECLINED" && co.decisionNote ? <p className="mt-2 text-sm text-slate-600">Reason: {co.decisionNote}</p> : null}
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}

function Foot({ cols, label, value }: { cols: number; label: string; value: number }) {
  return (
    <tr className="text-slate-700">
      <td colSpan={Math.max(cols - 1, 1)} className="py-1.5 pr-3 text-right">
        {label}
      </td>
      <td className="py-1.5 text-right tabular-nums">{money(value)}</td>
    </tr>
  );
}
