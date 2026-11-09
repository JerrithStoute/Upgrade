import { fmtDate, money, num, cn } from "@/lib/utils";
import { PO_STATUS_LABEL } from "@/lib/purchasing";
import type { PoDoc } from "@/lib/po-doc";
import { DocFooter, DocHeader, SectionTitle, SignBox, SignLine, TermsText, docColors, type DocPill } from "@/components/doc-parts";

const TONE: Record<string, DocPill["tone"]> = { DRAFT: "draft", SENT: "waiting", ACCEPTED: "ok", DECLINED: "no", CLOSED: "ok", VOID: "void" };

/**
 * A purchase order as one document, in the same look as your proposals, change orders and invoices:
 * the header (your logo, its number, issue and deliver-by dates, where it stands), From / To / Deliver to,
 * what it's for, the order and its total, delivery and where to send the bill, your PO terms, and the
 * vendor's acceptance. Your Print page and the vendor's page. `terms` replaces the Terms section (your page:
 * typed right there).
 */
export function PoDocument({ d, terms }: { d: PoDoc; terms?: React.ReactNode }) {
  const { po } = d;
  const head = "border-b-[1.5px] border-slate-900 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500";
  const cell = "border-b border-slate-100 py-2.5";
  const status = PO_STATUS_LABEL[po.status] ?? po.status;
  const pill: DocPill = {
    label: po.status === "SENT" ? "Sent · waiting on vendor" : `${status}${(po.status === "ACCEPTED" || po.status === "DECLINED") && po.respondedAt ? ` ${fmtDate(po.respondedAt)}` : ""}`,
    tone: TONE[po.status] ?? "draft",
  };
  const accepted = po.status === "ACCEPTED" || po.status === "CLOSED";
  const declined = po.status === "DECLINED";

  return (
    <article
      className="proposal-doc mx-auto w-full max-w-4xl rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm sm:p-12 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none"
      style={docColors(d.colors)}
    >
      <DocHeader
        logoUrl={d.company.logoUrl}
        companyName={d.company.name}
        kind="Purchase order"
        number={`${po.number}`}
        dates={[["Issued", fmtDate(po.sentAt ?? po.createdAt)], ...(po.deliveryDate ? [["Deliver by", fmtDate(po.deliveryDate)] as [string, string]] : [])]}
        pill={pill}
        parties={[
          { label: "From", name: d.company.name, lines: d.company.lines },
          { label: "To", name: d.to.name, lines: d.to.lines },
          { label: "Deliver to", name: d.project.name, lines: [d.siteAddress, `Job #${d.project.number}`].filter(Boolean) },
        ]}
      />

      <h1 className="mt-4 font-serif text-2xl">{po.title}</h1>
      {po.scope ? <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-700">{po.scope}</p> : null}

      <SectionTitle>Order</SectionTitle>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-[13.5px] sm:grid-cols-[1fr_auto_auto_auto_auto]">
        <span className={head}>Description</span>
        <span className={cn(head, "text-right")}>Qty</span>
        <span className={cn(head, "hidden sm:block")}>Unit</span>
        <span className={cn(head, "hidden text-right sm:block")}>Unit cost</span>
        <span className={cn(head, "text-right")}>Amount</span>
        {d.lines.map((l) => (
          <div key={l.id} className="contents">
            <span className={cell}>{l.description}</span>
            <span className={cn(cell, "text-right tabular-nums")}>
              {num(l.quantity)}
              <span className="ml-1 text-xs text-slate-500 sm:hidden">{l.unit}</span>
            </span>
            <span className={cn(cell, "hidden text-slate-600 sm:block")}>{l.unit}</span>
            <span className={cn(cell, "hidden text-right tabular-nums sm:block")}>{money(l.unitCost)}</span>
            <span className={cn(cell, "text-right tabular-nums")}>{money(l.quantity * l.unitCost)}</span>
          </div>
        ))}
      </div>
      <div className="ml-auto mt-4 w-full text-sm sm:w-80">
        <div className="flex items-baseline justify-between gap-4 border-y-slate-900 py-2.5 text-base font-bold [border-bottom:3px_double] [border-top:1.5px_solid]">
          <span>Total</span>
          <span className="tabular-nums">{money(d.total)}</span>
        </div>
      </div>

      <section className="break-inside-avoid">
        <SectionTitle>Delivery &amp; billing</SectionTitle>
        <div className="grid overflow-hidden rounded-md border border-slate-200 text-[13px] text-slate-700 sm:grid-cols-2">
          <div className="px-5 py-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">{po.deliveryDate ? "Deliver by" : "Deliver to"}</p>
            {po.deliveryDate ? <p className="mt-1 font-serif text-xl text-slate-900">{fmtDate(po.deliveryDate, "EEE, MMM d, yyyy")}</p> : null}
            <p className="mt-1.5">{d.siteAddress || d.project.name}</p>
            {d.company.phone ? <p>Questions: {d.company.phone}</p> : null}
          </div>
          <div className="border-t border-slate-200 bg-[var(--doc-tint)] px-5 py-4 sm:border-l sm:border-t-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">Send your bill to</p>
            <p className="mt-1 font-semibold text-slate-900">{d.company.name}</p>
            {d.company.billTo.map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
        </div>
        <p className="mt-3 border-l-[3px] border-[var(--doc-accent)] bg-[var(--doc-tint)] px-4 py-2.5 text-[13px] font-semibold">
          Put PO No. {po.number} on every delivery ticket and bill.
        </p>
      </section>

      {terms ?? (d.company.terms?.trim() ? <PoTerms text={d.company.terms} /> : null)}

      <SignBox statement="We accept this order at the prices and terms above.">
        <div className="mt-5 grid grid-cols-1 gap-8 sm:grid-cols-2">
          <SignLine
            who={d.to.name}
            stamp={accepted && d.respondedWhen ? `✓ Accepted ${d.respondedWhen}` : declined ? `Declined${d.respondedWhen ? ` ${d.respondedWhen}` : ""}` : null}
            declined={declined}
          />
          <SignLine who={d.company.name} signed={d.sentBy} stamp={d.sentWhen ? `✓ Sent ${d.sentWhen}` : null} />
        </div>
        {declined && po.responseNote ? <p className="mt-3 text-sm text-slate-600">Reason: {po.responseNote}</p> : null}
      </SignBox>

      <DocFooter left={d.company.footer} right={`Purchase order No. ${po.number} · Job #${d.project.number}`} />
    </article>
  );
}

export function PoTerms({ text, children }: { text: string | null; children?: React.ReactNode }) {
  return (
    <section>
      <SectionTitle>Terms</SectionTitle>
      {children ?? <TermsText text={text ?? ""} />}
    </section>
  );
}
