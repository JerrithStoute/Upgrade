"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/link";
import { AlertTriangle, Pin, SlidersHorizontal } from "lucide-react";
import { buttonClasses } from "@/components/ui";
import { cn, money } from "@/lib/utils";
import type { EscalationLine } from "@/lib/escalation";
import { sheetCategories, sheetSummary, sheetTrigger, shownLines, type PriceSheetOptions, type SheetCategory } from "@/lib/price-sheet";
import { PrintButton } from "../../../_components/print-button";
import { savePriceSheet } from "../../actions";
import { EscalationCoButton } from "@/components/estimate/escalation-co-button";

type Data = {
  kind: "SENT" | "SIGNED";
  since: string;
  today: string;
  triggerPct: number;
  past: boolean;
  lines: EscalationLine[];
  fileId: string | null;
};

const qtyText = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: 2 }));
const pctText = (then: number, change: number) => (then > 0 && Math.abs(change) >= 0.005 ? `${change > 0 ? "+" : "−"}${Math.abs(Math.round((change / then) * 1000) / 10)}%` : "");
const signed = (n: number) => (Math.abs(n) < 0.005 ? "—" : `${n > 0 ? "+" : "−"}${money(Math.abs(n))}`);
const tone = (n: number) => (n > 0.005 ? "text-rose-700" : n < -0.005 ? "text-emerald-700" : "text-slate-400");

/**
 * The price change sheet, two ways: "For you" — every item with its vendor and when its price was
 * last checked (old ones flagged, so you don't charge on a stale number) — and "For the client":
 * your letterhead, your words and only what you choose to show, set in the panel beside it.
 */
export function PriceChangeView({
  projectId,
  estimateId,
  backHref,
  initialView,
  e,
  job,
  version,
  checked,
  stale,
  initial,
  isCustom,
  isAdmin,
  canMakeCo,
  clientName,
  header,
}: {
  projectId: string;
  estimateId: string;
  backHref: string;
  initialView: "you" | "client";
  e: Data;
  job: string;
  version: string;
  /** Item List item → the day its price was last set or confirmed. */
  checked: Record<string, string>;
  /** Item List item → why its price is due for a recheck. */
  stale: Record<string, string>;
  initial: PriceSheetOptions;
  isCustom: boolean;
  isAdmin: boolean;
  /** May make change orders (and see costs). */
  canMakeCo: boolean;
  clientName: string | null;
  header: React.ReactNode;
}) {
  const router = useRouter();
  const [view, setView] = useState(initialView);
  const [o, setO] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const set = (fn: (p: PriceSheetOptions) => PriceSheetOptions) => {
    setO(fn);
    setDirty(true);
    setMsg(null);
  };
  const save = (scope: "estimate" | "default" | "reset") =>
    start(async () => {
      const r = await savePriceSheet(projectId, estimateId, o, scope);
      if (!r.ok) setMsg(r.error);
      else {
        setDirty(false);
        setMsg(scope === "default" ? "Saved as your default for every price change sheet." : scope === "reset" ? "Back to your default." : "Saved for this estimate.");
        router.refresh();
      }
    });
  // Something to charge: the client's sheet (with what's left off it) is up.
  const sheetUp = useMemo(() => sheetCategories(e.lines, o.leaveOut).change > 0.005, [e.lines, o.leaveOut]);
  const allCategories = useMemo(() => [...new Set(e.lines.map((l) => l.category))], [e.lines]);
  const since = e.kind === "SENT" ? `proposal sent ${e.since}` : `contract signed ${e.since}`;
  const seg = (on: boolean) => cn("px-3 py-1 text-xs font-medium", on ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50");

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Link href={backHref} className="text-sm font-medium text-blue-700 hover:underline">
          ← Estimate
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md ring-1 ring-inset ring-slate-300" role="group" aria-label="Who it's for">
            <button type="button" className={seg(view === "you")} onClick={() => setView("you")} aria-pressed={view === "you"}>
              For you
            </button>
            <button type="button" className={seg(view === "client")} onClick={() => setView("client")} aria-pressed={view === "client"}>
              For the client
            </button>
          </div>
          <PrintButton label="Print / PDF" />
          {canMakeCo && sheetUp ? (
            <EscalationCoButton
              projectId={projectId}
              estimateId={estimateId}
              // The change order carries the client's sheet as set here: unsaved settings are saved for this estimate first.
              before={async () => {
                if (!dirty) return true;
                const r = await savePriceSheet(projectId, estimateId, o, "estimate");
                if (!r.ok) setMsg(r.error);
                else setDirty(false);
                return r.ok;
              }}
            />
          ) : null}
        </div>
      </div>

      {view === "you" ? (
        <ForYou e={e} job={job} version={version} since={since} checked={checked} stale={stale} />
      ) : (
        <div className="flex flex-col items-start gap-4 lg:flex-row">
          <aside className="no-print w-full shrink-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-[calc(4.5rem+var(--job-head,0px))] lg:max-h-[calc(100vh-5.5rem-var(--job-head,0px))] lg:w-72 lg:overflow-y-auto">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-900">What the client sees</h2>
            </div>
            <p className="-mt-1 text-xs text-slate-500">{isCustom ? "This estimate has its own settings." : "Following your default settings."}</p>

            <Group title="Words">
              <label className="block text-sm text-slate-700">
                Heading
                <input className="input mt-1 !h-8 !py-0 text-xs" value={o.heading} onChange={(ev) => set((p) => ({ ...p, heading: ev.target.value }))} />
              </label>
              <label className="block text-sm text-slate-700">
                Your note at the top
                <textarea className="input mt-1 text-xs" rows={4} value={o.intro} placeholder="Optional" onChange={(ev) => set((p) => ({ ...p, intro: ev.target.value }))} />
              </label>
              <label className="block text-sm text-slate-700">
                Your note at the end
                <textarea className="input mt-1 text-xs" rows={3} value={o.closing} placeholder="Optional" onChange={(ev) => set((p) => ({ ...p, closing: ev.target.value }))} />
              </label>
              <Check label="The sentence with the totals" checked={o.summary} onChange={(v) => set((p) => ({ ...p, summary: v }))} />
              <Check label={`What your contract allows (more than ${e.triggerPct}%)`} checked={o.trigger} onChange={(v) => set((p) => ({ ...p, trigger: v }))} />
            </Group>
            <Group title="Items">
              <Check label="Item lines (off: category totals only)" checked={o.items} onChange={(v) => set((p) => ({ ...p, items: v }))} />
              <Check label="Quantities" checked={o.qty} disabled={!o.items} onChange={(v) => set((p) => ({ ...p, qty: v }))} />
              <Check label={o.items ? "Each item's price then and now" : "Each category's total then and now"} checked={o.prices} onChange={(v) => set((p) => ({ ...p, prices: v }))} />
              <Check label="Items whose price didn't change" checked={o.unchanged} disabled={!o.items} onChange={(v) => set((p) => ({ ...p, unchanged: v }))} />
            </Group>
            <Group title="Categories on the sheet">
              {allCategories.map((c) => (
                <Check
                  key={c}
                  label={c}
                  checked={!o.leaveOut.includes(c)}
                  onChange={(v) => set((p) => ({ ...p, leaveOut: v ? p.leaveOut.filter((x) => x !== c) : [...p.leaveOut, c] }))}
                />
              ))}
              <p className="text-xs text-slate-500">One left off is out of the totals too.</p>
            </Group>
            <Group title="Signature">
              <Check label="Lines for the client to sign" checked={o.signature} onChange={(v) => set((p) => ({ ...p, signature: v }))} />
            </Group>

            <div className="space-y-2 border-t border-slate-200 pt-3">
              <p className={cn("h-4 text-xs", msg && !dirty ? "text-emerald-700" : "text-amber-700")}>{msg ?? (dirty ? "Not saved yet" : "")}</p>
              <button type="button" className={cn(buttonClasses("primary", "sm"), "w-full")} disabled={!dirty || saving} onClick={() => save("estimate")}>
                Save for this estimate
              </button>
              {isAdmin ? (
                <button type="button" className={cn(buttonClasses("secondary", "sm"), "w-full")} disabled={saving} onClick={() => save("default")}>
                  Save as my default
                </button>
              ) : null}
              {isCustom ? (
                <button type="button" className={cn(buttonClasses("ghost", "sm"), "w-full")} disabled={saving} onClick={() => save("reset")}>
                  Use my default instead
                </button>
              ) : null}
            </div>
          </aside>
          <ForClient e={e} o={o} header={header} clientName={clientName} />
        </div>
      )}
    </div>
  );
}

/** Your copy: every item, its vendor, and how fresh today's price is. */
function ForYou({ e, job, version, since, checked, stale }: { e: Data; job: string; version: string; since: string; checked: Record<string, string>; stale: Record<string, string> }) {
  const [unchanged, setUnchanged] = useState(false);
  const s = useMemo(() => sheetCategories(e.lines), [e.lines]);
  // Unchanged items hidden: a category where nothing moved is one line at the end, not a heading of its own.
  const still = s.categories.filter((c) => Math.abs(c.change) < 0.005 && c.lines.every((l) => Math.abs(l.change) < 0.005));
  const listed = unchanged ? s.categories : s.categories.filter((c) => !still.includes(c));
  const staleChanged = e.lines.filter((l) => l.materialItemId && stale[l.materialItemId] && Math.abs(l.change) >= 0.005).length;
  const up = s.change > 0.005;
  return (
    <article className="mx-auto w-full max-w-5xl space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Material price change</h1>
          <p className="text-sm text-slate-500">
            {job} · {version} · {since} → today ({e.today})
          </p>
        </div>
        <div className="text-right">
          <p className={cn("text-2xl font-semibold tabular-nums", up ? (e.past ? "text-rose-700" : "text-slate-900") : "text-emerald-700")}>
            {s.change > 0.005 ? "up" : s.change < -0.005 ? "down" : "no change"} {Math.abs(s.pct)}%
          </p>
          <p className="text-sm tabular-nums text-slate-600">
            {money(s.then)} → {money(s.now)} · {signed(s.change)}
          </p>
        </div>
      </header>
      {e.past ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm text-rose-900">
          Past your {e.triggerPct}% escalation trigger: the whole increase, <b>{money(s.change)}</b>, can be charged.
        </p>
      ) : up ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700">Under your {e.triggerPct}% escalation trigger.</p>
      ) : null}
      {staleChanged ? (
        <p className="no-print flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {staleChanged} changed price{staleChanged === 1 ? " is" : "s are"} due for a recheck — check with your supplier before you charge on {staleChanged === 1 ? "it" : "them"}.{" "}
            <Link href="/catalog/items?recheck=1" className="font-medium underline underline-offset-2 hover:no-underline">
              Item List
            </Link>
          </span>
        </p>
      ) : null}

      <div className="no-print flex items-center justify-between gap-3 text-xs">
        <label className="flex items-center gap-1.5 text-slate-600">
          <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300" checked={unchanged} onChange={(ev) => setUnchanged(ev.target.checked)} />
          Show unchanged items
        </label>
        {e.fileId ? (
          <a href={`/api/files/${e.fileId}`} target="_blank" rel="noreferrer" className="font-medium text-blue-700 hover:underline">
            The {since} snapshot (PDF)
          </a>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-1.5 pr-2 font-medium">Item</th>
              <th className="px-2 py-1.5 text-right font-medium">Qty</th>
              <th className="px-2 py-1.5 text-right font-medium">Bid price</th>
              <th className="px-2 py-1.5 text-right font-medium">Today</th>
              <th className="px-2 py-1.5 text-right font-medium">Change</th>
              <th className="py-1.5 pl-2 text-right font-medium">On this job</th>
            </tr>
          </thead>
          {listed.map((c) => (
            <tbody key={c.name} className="break-inside-avoid">
              <tr className="bg-slate-50">
                <td colSpan={4} className="py-1.5 pl-2 font-semibold text-slate-900">
                  {c.name}
                </td>
                <td className="px-2 py-1.5 text-right text-xs text-slate-500">{pctText(c.then, c.change)}</td>
                <td className={cn("py-1.5 pl-2 pr-2 text-right font-semibold tabular-nums", tone(c.change))}>{signed(c.change)}</td>
              </tr>
              {shownLines(c, unchanged).map((l) => {
                const id = l.materialItemId;
                const moved = Math.abs(l.change) >= 0.005;
                return (
                  <tr key={l.key} className="border-b border-slate-100 align-top">
                    <td className="py-1.5 pr-2">
                      <span className="text-slate-900">{l.name}</span>
                      {l.pinned ? (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-[11px] text-violet-700">
                          <Pin className="h-3 w-3" /> this job only
                        </span>
                      ) : null}
                      <span className="block text-xs text-slate-500">
                        {[l.vendor, id && checked[id] ? `price checked ${checked[id]}` : null].filter(Boolean).join(" · ")}
                      </span>
                      {id && stale[id] && moved ? <span className="block text-xs font-medium text-amber-700">{stale[id]}</span> : null}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                      {qtyText(l.qty)} <span className="text-xs text-slate-400">{l.unit}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{money(l.price)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-900">{money(l.today)}</td>
                    <td className="px-2 py-1.5 text-right text-xs tabular-nums text-slate-500">{pctText(l.price, l.today - l.price)}</td>
                    <td className={cn("py-1.5 pl-2 pr-2 text-right tabular-nums", tone(l.change))}>{signed(l.change)}</td>
                  </tr>
                );
              })}
              {!unchanged && c.unchanged ? (
                <tr className="border-b border-slate-100">
                  <td colSpan={6} className="py-1 pr-2 text-xs text-slate-400">
                    + {c.unchanged} item{c.unchanged === 1 ? "" : "s"} with no change ({money(c.unchangedTotal)})
                  </td>
                </tr>
              ) : null}
            </tbody>
          ))}
          <tfoot>
            {!unchanged && still.length ? (
              <tr>
                <td colSpan={6} className="py-1.5 pr-2 text-xs text-slate-400">
                  No change in {still.map((c) => c.name).join(", ")} ({money(still.reduce((t, c) => t + c.then, 0))})
                </td>
              </tr>
            ) : null}
            <tr className="border-t-2 border-slate-300">
              <td colSpan={4} className="py-2 pr-2 font-semibold text-slate-900">
                Materials: {money(s.then)} → {money(s.now)}
              </td>
              <td className="px-2 py-2 text-right text-xs text-slate-500">{pctText(s.then, s.change)}</td>
              <td className={cn("py-2 pl-2 pr-2 text-right font-semibold tabular-nums", tone(s.change))}>{signed(s.change)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-slate-500">Bid quantities at today&apos;s prices, materials only. Today&apos;s price is the Item List&apos;s (or this job&apos;s own, for an item kept at This job only).</p>
    </article>
  );
}

/** What the client gets: your letterhead, your words, and what you chose to show. */
function ForClient({ e, o, header, clientName }: { e: Data; o: PriceSheetOptions; header: React.ReactNode; clientName: string | null }) {
  const s = useMemo(() => sheetCategories(e.lines, o.leaveOut), [e.lines, o.leaveOut]);
  const cols = 1 + (o.items && o.qty ? 1 : 0) + (o.prices ? 2 : 0);
  const summary = sheetSummary(e.kind, e.since, s);
  return (
    <article className="mx-auto w-full min-w-0 max-w-4xl flex-1 rounded-xl border border-slate-200 bg-white p-10 text-slate-900 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <div>{header}</div>
      <h2 className="mt-10 text-2xl font-semibold">{o.heading.trim() || "Material price change"}</h2>
      {o.intro.trim() ? <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-800">{o.intro.trim()}</p> : null}
      {o.summary || o.trigger ? (
        <p className="mt-4 text-sm leading-relaxed text-slate-800">
          {o.summary ? summary : null}
          {o.summary && o.trigger ? " " : null}
          {o.trigger ? sheetTrigger(e.triggerPct) : null}
        </p>
      ) : null}

      <table className="mt-8 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-2 font-semibold">{o.items ? "Item" : "Category"}</th>
            {o.items && o.qty ? <th className="px-2 py-2 text-right font-semibold">Qty</th> : null}
            {o.prices ? (
              <>
                <th className="px-2 py-2 text-right font-semibold">Was</th>
                <th className="px-2 py-2 text-right font-semibold">Now</th>
              </>
            ) : null}
            <th className="py-2 pl-2 text-right font-semibold">Change</th>
          </tr>
        </thead>
        {s.categories
          .filter((c) => o.unchanged || Math.abs(c.change) >= 0.005 || !o.items)
          .map((c) => (
            <ClientCategory key={c.name} c={c} o={o} cols={cols} />
          ))}
        <tfoot>
          <tr className="border-t-2 border-slate-400">
            <td colSpan={cols} className="py-2.5 pr-2 font-semibold">
              Materials {money(s.then)} → {money(s.now)}
            </td>
            <td className="py-2.5 pl-2 text-right text-base font-semibold tabular-nums">{signed(s.change)}</td>
          </tr>
        </tfoot>
      </table>

      {o.closing.trim() ? <p className="mt-8 whitespace-pre-line text-sm leading-relaxed text-slate-800">{o.closing.trim()}</p> : null}
      {o.signature ? (
        <div className="mt-14 grid grid-cols-2 gap-10 break-inside-avoid text-sm">
          <div>
            <div className="h-10 border-b border-slate-400" />
            <p className="mt-1 text-slate-600">{clientName ?? "Client"}</p>
          </div>
          <div>
            <div className="h-10 border-b border-slate-400" />
            <p className="mt-1 text-slate-600">Date</p>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function ClientCategory({ c, o, cols }: { c: SheetCategory; o: PriceSheetOptions; cols: number }) {
  const lines = o.items ? shownLines(c, o.unchanged) : [];
  return (
    <tbody className="break-inside-avoid">
      <tr className={cn(o.items && "bg-slate-50")}>
        <td colSpan={o.items ? cols : 1} className={cn("py-2 pr-2", o.items ? "pl-2 font-semibold" : "text-slate-800")}>
          {c.name}
          {!o.items ? <span className="ml-2 text-xs text-slate-500">{pctText(c.then, c.change)}</span> : null}
        </td>
        {!o.items && o.prices ? (
          <>
            <td className="px-2 py-2 text-right tabular-nums text-slate-700">{money(c.then)}</td>
            <td className="px-2 py-2 text-right tabular-nums text-slate-900">{money(c.now)}</td>
          </>
        ) : null}
        <td className={cn("py-2 pl-2 pr-2 text-right tabular-nums", o.items && "font-semibold")}>{signed(c.change)}</td>
      </tr>
      {lines.map((l) => (
        <tr key={l.key} className="border-b border-slate-100">
          <td className="py-1.5 pl-4 pr-2 text-slate-800">{l.name}</td>
          {o.qty ? (
            <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
              {qtyText(l.qty)} <span className="text-xs text-slate-400">{l.unit}</span>
            </td>
          ) : null}
          {o.prices ? (
            <>
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{money(l.price)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-900">{money(l.today)}</td>
            </>
          ) : null}
          <td className="py-1.5 pl-2 pr-2 text-right tabular-nums">{signed(l.change)}</td>
        </tr>
      ))}
      {o.items && !o.unchanged && c.unchanged ? (
        <tr className="border-b border-slate-100">
          <td colSpan={cols + 1} className="py-1 pl-4 text-xs text-slate-500">
            + {c.unchanged} item{c.unchanged === 1 ? "" : "s"} with no change
          </td>
        </tr>
      ) : null}
    </tbody>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</legend>
      {children}
    </fieldset>
  );
}

function Check({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2 text-sm text-slate-700", disabled && "cursor-default opacity-50")}>
      <input
        type="checkbox"
        className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(ev) => onChange(ev.target.checked)}
      />
      {label}
    </label>
  );
}
