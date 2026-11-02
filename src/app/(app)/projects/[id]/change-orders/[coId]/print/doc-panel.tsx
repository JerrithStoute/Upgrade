"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { buttonClasses } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { DocOptions } from "@/lib/change-orders";
import { saveChangeOrder, saveCoDocDefaults } from "../../actions";

type Values = {
  showItems: boolean;
  showPrices: boolean;
  profitMode: string;
  profitShown: string;
  profitLabel: string;
  taxPct: number;
  taxShown: string;
  taxLabel: string;
  doc: DocOptions;
};

/**
 * "What the client sees", beside the paper (like the proposal's): items and prices, how the
 * profit and tax show, and what else is on it. Each change saves and the paper beside it
 * follows. The pricing itself (markup, tax %) is set on the change order page. Draft only —
 * once it's sent, this is what the client has.
 */
export function DocPanel({ projectId, coId, draft, hasSelections, v: saved0 }: { projectId: string; coId: string; draft: boolean; hasSelections: boolean; v: Values }) {
  // Changes show at once; the page (re-keyed on what's saved) catches up behind them.
  const [v, setV] = useState(saved0);
  const router = useRouter();
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) =>
    start(async () => {
      setErr(null);
      const r = await fn();
      if (!r.ok) setErr(r.error);
      else {
        after?.();
        router.refresh();
      }
    });
  const save = (patch: Partial<Omit<Values, "doc">> & { docOptions?: Partial<DocOptions> }) => {
    setSaved(false);
    const { docOptions, ...rest } = patch;
    setV((cur) => ({ ...cur, ...rest, doc: { ...cur.doc, ...(docOptions ?? {}) } }));
    run(() => saveChangeOrder(projectId, coId, patch));
  };
  const doc = (patch: Partial<DocOptions>) => save({ docOptions: patch });
  const off = !draft || busy;

  return (
    <aside className="no-print w-full shrink-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-[calc(4.5rem+var(--job-head,0px))] lg:max-h-[calc(100vh-5.5rem-var(--job-head,0px))] lg:w-72 lg:overflow-y-auto">
      <div>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <SlidersHorizontal className="h-4 w-4 text-slate-400" /> What the client sees
        </h2>
        <p className="text-xs text-slate-500">
          {draft ? "Pricing (markup, tax %) is set on the change order." : "Sent — this is what the client has. It can't change now."}
        </p>
      </div>
      {err ? <p className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">{err}</p> : null}

      <Group title="Page">
        <label className="block text-xs text-slate-600">
          Heading
          <input
            key={v.doc.heading}
            className="input mt-0.5 !h-8 !py-0 text-sm"
            defaultValue={v.doc.heading}
            disabled={off}
            onBlur={(e) => e.target.value.trim() !== v.doc.heading && doc({ heading: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        </label>
        <Check label="Intro text" checked={v.doc.intro} disabled={off} onChange={(x) => doc({ intro: x })} />
        <Check label="Closing text" checked={v.doc.closing} disabled={off} onChange={(x) => doc({ closing: x })} />
      </Group>

      <Group title="Items">
        <Check label="Show items" checked={v.showItems} disabled={off} onChange={(x) => save({ showItems: x, ...(x ? {} : { showPrices: false }) })} />
        <Check label="Prices" hint="Off: the items, then only the total" checked={v.showItems && v.showPrices} disabled={off || !v.showItems} onChange={(x) => save({ showPrices: x })} indent />
        {hasSelections ? (
          <Check
            label="Client price and allowance on client choices"
            hint="Beside the difference"
            checked={v.doc.allowance}
            disabled={off || !v.showItems || !v.showPrices}
            onChange={(x) => doc({ allowance: x })}
            indent
          />
        ) : null}
      </Group>

      <Group title="Profit">
        {v.profitMode === "NONE" ? (
          <p className="text-xs text-slate-500">No profit on this change order.</p>
        ) : (
          <>
            <Radio name="profit" label="Built into the prices" checked={v.profitShown === "FOLDED"} disabled={off} onChange={() => save({ profitShown: "FOLDED" })} />
            <Radio name="profit" label="Separate fee line (prices at cost)" checked={v.profitShown === "LINE"} disabled={off} onChange={() => save({ profitShown: "LINE" })} />
            {v.profitShown === "LINE" ? (
              <div className="space-y-1.5 pl-6">
                <input
                  key={v.profitLabel}
                  aria-label="Fee line name"
                  className="input !h-8 !py-0 text-sm"
                  defaultValue={v.profitLabel}
                  disabled={off}
                  onBlur={(e) => e.target.value.trim() !== v.profitLabel && save({ profitLabel: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                />
                {v.profitMode === "PCT" ? <Check label="Show the fee %" checked={v.doc.feePct} disabled={off} onChange={(x) => doc({ feePct: x })} /> : null}
              </div>
            ) : null}
          </>
        )}
      </Group>

      <Group title="Sales tax">
        {v.taxPct > 0 ? (
          <>
            <Radio name="tax" label="Built into the prices" checked={v.taxShown === "FOLDED"} disabled={off} onChange={() => save({ taxShown: "FOLDED" })} />
            <Radio name="tax" label="Its own line (prices before tax)" checked={v.taxShown === "LINE"} disabled={off} onChange={() => save({ taxShown: "LINE" })} />
            {v.taxShown === "LINE" ? (
              <input
                key={v.taxLabel}
                aria-label="Tax line name"
                className="input !ml-6 !h-8 !w-[calc(100%-1.5rem)] !py-0 text-sm"
                defaultValue={v.taxLabel}
                disabled={off}
                onBlur={(e) => e.target.value.trim() !== v.taxLabel && save({ taxLabel: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              />
            ) : null}
          </>
        ) : (
          <p className="text-xs text-slate-500">No sales tax on this change order.</p>
        )}
      </Group>

      <Group title="Also on it">
        <Check label="Effect on contract" checked={v.doc.effect} disabled={off} onChange={(x) => doc({ effect: x })} />
        <Check label="Days added and completion dates" checked={v.doc.schedule} disabled={off} onChange={(x) => doc({ schedule: x })} />
        <Check label="Terms" checked={v.doc.terms} disabled={off} onChange={(x) => doc({ terms: x })} />
        <Check label="Files" checked={v.doc.files} disabled={off} onChange={(x) => doc({ files: x })} />
        <p className="pt-1 text-[11px] text-slate-500">Signature lines follow the change order&apos;s Approvals.</p>
      </Group>

      {draft ? (
        <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
          <button type="button" className={buttonClasses("secondary", "xs")} disabled={busy} onClick={() => run(() => saveCoDocDefaults(projectId, coId), () => setSaved(true))}>
            Use these as my defaults
          </button>
          {saved ? <span className="text-xs text-emerald-700">Saved</span> : null}
        </div>
      ) : null}
    </aside>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 border-t border-slate-100 pt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {children}
    </div>
  );
}

function Check({ label, hint, checked, disabled, onChange, indent }: { label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; indent?: boolean }) {
  return (
    <label className={cn("flex items-start gap-2 text-sm text-slate-700", indent && "pl-6", disabled && "opacity-60")} title={hint}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Radio({ name, label, checked, disabled, onChange }: { name: string; label: string; checked: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <label className={cn("flex items-start gap-2 text-sm text-slate-700", disabled && "opacity-60")}>
      <input type="radio" name={name} className="mt-0.5 h-4 w-4 shrink-0" checked={checked} disabled={disabled} onChange={onChange} />
      {label}
    </label>
  );
}
