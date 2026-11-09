import { fmtDate, money, num, titleCase, cn } from "@/lib/utils";
import type { InvoiceDoc } from "@/lib/invoice-doc";
import { DocFooter, DocHeader, SectionTitle, TermsText, docColors, type DocPill } from "@/components/doc-parts";

/** Where the invoice stands: draft, void, paid (and when), overdue, partly paid, or due (and when). */
function pillFor(d: InvoiceDoc): DocPill {
  const { inv } = d;
  if (inv.status === "DRAFT") return { label: "Draft", tone: "draft" };
  if (inv.status === "VOID") return { label: "Void", tone: "void" };
  if (d.balance <= 0.005 && d.total > 0.005) return { label: `Paid${d.lastPaid ? ` ${fmtDate(d.lastPaid)}` : ""}`, tone: "ok" };
  if (d.overdue) return { label: "Overdue", tone: "no" };
  if (d.paid > 0.005) return { label: "Partly paid", tone: "waiting" };
  return { label: inv.dueDate ? `Due ${fmtDate(inv.dueDate, "MMM d")}` : "Due", tone: "waiting" };
}

const method = (m: string) => (m === "ACH" ? "ACH" : titleCase(m));

/**
 * An invoice as one document, in the same look as the proposal and change orders: the header (your
 * logo, its number, dates and status), From / Bill to / Project, the title, its lines, the payments
 * and the balance due, where the contract stands, how to pay and the notes. Your Print page and
 * the client's portal. `howToPay` replaces the How to pay section (your page: typed right there).
 */
export function InvoiceDocument({ d, howToPay }: { d: InvoiceDoc; howToPay?: React.ReactNode }) {
  const { inv } = d;
  // Quantities and unit prices only when a line has a quantity (lump sums: just the amount).
  const qty = d.items.some((i) => Math.abs(i.quantity - 1) > 1e-9);
  const head = "border-b-[1.5px] border-slate-900 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500";
  const cell = "border-b border-slate-100 py-2.5";
  const s = inv.showSummary ? d.standing : null;
  const pct = (n: number) => (s && s.contract > 0 ? `${Math.max(0, Math.min(100, (n / s.contract) * 100))}%` : "0%");

  return (
    <article
      className="proposal-doc mx-auto w-full max-w-4xl rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm sm:p-12 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none"
      style={docColors(d.colors)}
    >
      <DocHeader
        logoUrl={d.company.logoUrl}
        companyName={d.company.name}
        kind="Invoice"
        number={`${inv.number}`}
        dates={[["Issued", fmtDate(inv.issueDate)], ...(inv.dueDate ? [["Due", fmtDate(inv.dueDate)] as [string, string]] : [])]}
        pill={pillFor(d)}
        parties={[
          { label: "From", name: d.company.name, lines: d.company.lines },
          { label: "Bill to", name: d.client, lines: d.clientLines },
          { label: "Project", name: d.project.name, lines: [d.project.address, `Job #${d.project.number}`].filter(Boolean) },
        ]}
      />

      {inv.title.trim() && inv.title.trim() !== "Invoice" ? <h1 className="mt-4 font-serif text-2xl">{inv.title}</h1> : null}

      <SectionTitle>This invoice</SectionTitle>
      <div className={cn("grid gap-x-4 text-[13.5px]", qty ? "grid-cols-[1fr_auto_auto_auto]" : "grid-cols-[1fr_auto]")}>
        <span className={head}>Description</span>
        {qty ? <span className={cn(head, "text-right")}>Qty</span> : null}
        {qty ? <span className={cn(head, "text-right")}>Unit price</span> : null}
        <span className={cn(head, "text-right")}>Amount</span>
        {d.items.map((i) => (
          <div key={i.id} className="contents">
            <span className={cell}>{i.description}</span>
            {qty ? <span className={cn(cell, "text-right tabular-nums")}>{num(i.quantity)}</span> : null}
            {qty ? <span className={cn(cell, "text-right tabular-nums")}>{money(i.unitPrice)}</span> : null}
            <span className={cn(cell, "text-right tabular-nums")}>{money(i.quantity * i.unitPrice)}</span>
          </div>
        ))}
      </div>
      <div className="ml-auto mt-4 w-full break-inside-avoid text-sm sm:w-96">
        <Row label="Total" value={money(d.total)} />
        {d.payments.map((p) => (
          <Row key={p.id} small label={`Payment received ${fmtDate(p.date, "MMM d")} · ${method(p.method)}${p.reference ? ` · ${p.reference}` : ""}`} value={`− ${money(p.amount)}`} />
        ))}
        <div className="mt-1.5 flex items-baseline justify-between gap-4 border-y-slate-900 py-2.5 text-base font-bold [border-bottom:3px_double] [border-top:1.5px_solid]">
          <span>Balance due</span>
          <span className="tabular-nums">{money(d.balance)}</span>
        </div>
      </div>

      {s ? (
        <section className="break-inside-avoid">
          <SectionTitle>Where your contract stands</SectionTitle>
          <div className="overflow-hidden rounded-md border border-slate-200 text-[13.5px]">
            <Line label="Contract (with approved change orders)" value={money(s.contract)} />
            <Line label="Invoiced before this one" value={money(s.before)} />
            <div className="flex justify-between gap-3 border-l-[3px] border-t border-l-[var(--doc-accent)] border-t-slate-100 bg-[var(--doc-tint)] px-4 py-2 font-bold">
              <span>This invoice</span>
              <span className="tabular-nums">{money(s.thisOne)}</span>
            </div>
            <div className="flex justify-between gap-3 border-t-[1.5px] border-slate-900 px-4 py-2 font-bold">
              <span>{s.left < -0.005 ? "Invoiced past the contract" : "Left to invoice after this"}</span>
              <span className="tabular-nums">{money(Math.abs(s.left))}</span>
            </div>
            <div className="mx-4 mb-1 mt-3 flex h-2 overflow-hidden rounded-full bg-slate-100">
              <i className="block h-full bg-[var(--doc-accent)] opacity-85" style={{ width: pct(s.before) }} />
              <i className="block h-full bg-[var(--doc-accent)] opacity-40" style={{ width: pct(Math.min(s.thisOne, s.contract - s.before)) }} />
            </div>
            <p className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-[11.5px] text-slate-500">
              <span>
                <b className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-[var(--doc-accent)] align-[-1px] opacity-85" />
                Invoiced before
              </span>
              <span>
                <b className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-[var(--doc-accent)] align-[-1px] opacity-40" />
                This invoice
              </span>
              <span>
                <b className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-slate-100 align-[-1px]" />
                Left to invoice
              </span>
              <span className="ml-auto">Paid so far {money(s.paid)}</span>
            </p>
          </div>
        </section>
      ) : null}

      {howToPay ?? <HowToPay text={d.company.paymentInstructions} number={inv.number} />}

      {inv.notes ? (
        <section className="break-inside-avoid">
          <SectionTitle>Notes</SectionTitle>
          <p className="whitespace-pre-line text-[13px] leading-relaxed text-slate-700">{inv.notes}</p>
        </section>
      ) : null}

      <DocFooter left={d.company.footer} right={`Invoice No. ${inv.number} · Job #${d.project.number}`} />
    </article>
  );
}

/** How to pay: your wording (a short line above a paragraph is its heading), and the invoice number to put on the payment. */
export function HowToPay({ text, number, children }: { text: string | null; number: number; children?: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      {text?.trim() || children ? <SectionTitle>How to pay</SectionTitle> : null}
      {children ?? (text?.trim() ? <TermsText text={text} /> : null)}
      <p className={cn("text-xs text-slate-500", text?.trim() || children ? "mt-2" : "mt-8")}>Please put invoice No. {number} on your payment.</p>
    </section>
  );
}

function Row({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-slate-600">
      <span className={cn(small && "text-[12.5px]")}>{label}</span>
      <span className="whitespace-nowrap tabular-nums text-slate-900">{value}</span>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-t border-slate-100 px-4 py-2 text-slate-600 first:border-t-0">
      <span>{label}</span>
      <span className="tabular-nums text-slate-900">{value}</span>
    </div>
  );
}
