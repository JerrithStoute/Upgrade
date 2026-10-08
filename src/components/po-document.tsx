import { fmtDate, money } from "@/lib/utils";
import type { PoDoc } from "@/lib/po-doc";

/** A printable purchase order: letterhead, PO number, to, job, scope, lines and total, and a place to sign. */
export function PoDocument({ d }: { d: PoDoc }) {
  const { po } = d;
  return (
    <article className="mx-auto max-w-3xl space-y-6 rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-800 shadow-sm print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {d.company.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.company.logoUrl} alt={d.company.name} className="mb-2 max-h-16 max-w-[12rem] object-contain" />
          ) : null}
          <p className="font-semibold">{d.company.name}</p>
          {d.company.lines.map((l) => (
            <p key={l} className="text-xs text-slate-600">
              {l}
            </p>
          ))}
        </div>
        <div className="text-right">
          <h1 className="text-2xl font-semibold tracking-tight">Purchase order</h1>
          <p className="font-mono text-base">PO-{po.number}</p>
          <p className="text-xs text-slate-600">Date {fmtDate(po.sentAt ?? po.createdAt)}</p>
          {po.deliveryDate ? <p className="text-xs text-slate-600">Needed by {fmtDate(po.deliveryDate)}</p> : null}
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">To</p>
          <p className="font-medium">{d.to.name}</p>
          {d.to.lines.map((l) => (
            <p key={l} className="text-xs text-slate-600">
              {l}
            </p>
          ))}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Job</p>
          <p className="font-medium">
            {d.project.name}
            {d.project.number ? <span className="ml-1 text-slate-500">#{d.project.number}</span> : null}
          </p>
          {d.project.lines.map((l) => (
            <p key={l} className="text-xs text-slate-600">
              {l}
            </p>
          ))}
        </div>
      </section>

      <section>
        <p className="text-base font-semibold">{po.title}</p>
        {po.scope ? <p className="mt-1 whitespace-pre-line text-slate-700">{po.scope}</p> : null}
      </section>

      <table className="w-full text-left">
        <thead className="border-b border-slate-300 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-2 font-medium">Item</th>
            <th className="py-2 text-right font-medium">Qty</th>
            <th className="py-2 pl-2 font-medium">Unit</th>
            <th className="py-2 text-right font-medium">Unit price</th>
            <th className="py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {d.lines.map((l) => (
            <tr key={l.id} className="break-inside-avoid">
              <td className="py-1.5 pr-2">{l.description}</td>
              <td className="py-1.5 text-right tabular-nums">{l.quantity}</td>
              <td className="py-1.5 pl-2">{l.unit}</td>
              <td className="py-1.5 text-right tabular-nums">{money(l.unitCost)}</td>
              <td className="py-1.5 text-right tabular-nums">{money(l.quantity * l.unitCost)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-slate-300">
          <tr className="text-base font-semibold">
            <td colSpan={4} className="py-2 text-right">
              Total
            </td>
            <td className="py-2 text-right tabular-nums">{money(d.total)}</td>
          </tr>
        </tfoot>
      </table>

      <p className="text-xs text-slate-600">Please put PO-{po.number} on your bill. Work or materials beyond this PO need a change approved before they&apos;re done.</p>

      <section className="grid gap-8 pt-6 sm:grid-cols-2">
        {["Accepted by", "Date"].map((s) => (
          <div key={s}>
            <div className="h-8 border-b border-slate-400" />
            <p className="mt-1 text-xs text-slate-500">{s}</p>
          </div>
        ))}
      </section>
    </article>
  );
}
