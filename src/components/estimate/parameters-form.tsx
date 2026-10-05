"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClasses } from "@/components/ui";
import { saveEstimateParameters } from "@/app/(app)/settings/estimate-parameters/actions";

export type ParamSetup = { id: string; name: string; unit: string };
type Row = { key: number; id: string | null; name: string; unit: string };

let seq = 0;

/**
 * Your estimate parameters: the job values item quantities use in formulas
 * (=[Heated sq. ft.] * 1.1). Used in Settings and, in a side panel, on the estimate.
 * Renaming keeps every formula and job value attached. Nothing is saved until
 * "Save changes".
 */
export function ParametersForm({ initial, usage, compact, onSaved }: { initial: ParamSetup[]; usage?: Record<string, number>; compact?: boolean; onSaved?: () => void }) {
  const router = useRouter();
  const fresh = () => initial.map((p) => ({ key: ++seq, ...p }));
  const [rows, setRows] = useState<Row[]>(fresh);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const change = (fn: (r: Row[]) => Row[]) => {
    setRows(fn);
    setDirty(true);
    setError(null);
  };
  const patch = (key: number, p: Partial<Row>) => change((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const move = (i: number, by: number) =>
    change((rs) => {
      const n = [...rs];
      const [r] = n.splice(i, 1);
      n.splice(Math.max(0, Math.min(n.length, i + by)), 0, r);
      return n;
    });

  useEffect(() => {
    if (!dirty || compact) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, compact]);

  const save = () =>
    startSaving(async () => {
      const r = await saveEstimateParameters(rows.map(({ id, name, unit }) => ({ id, name: name.trim(), unit: unit.trim() })));
      if (!r.ok) setError(r.error);
      else {
        setDirty(false);
        onSaved?.();
        router.refresh();
      }
    });

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-slate-600">
        The numbers each job fills in — <span className="font-medium text-slate-800">Heated sq. ft.</span>, Roof squares, Exterior wall LF, Bathrooms… An item&apos;s quantity can
        use them: pick one in the Qty cell, or type a formula like <span className="font-mono text-slate-800">=[Heated sq. ft.] * 1.1</span> or{" "}
        <span className="font-mono text-slate-800">=roundup([Wall area] / 32)</span>. Renaming one keeps every formula working.
      </p>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-8 px-2 py-2.5" />
              <th className="px-2 py-2.5 font-medium">Name</th>
              <th className="w-28 px-2 py-2.5 font-medium">Unit</th>
              {usage ? <th className="w-20 px-2 py-2.5 text-right font-medium">Used</th> : null}
              <th className="w-28 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                  No parameters yet — add your first one below.
                </td>
              </tr>
            ) : null}
            {rows.map((r, i) => (
              <tr key={r.key}>
                <td className="px-2 py-1.5 text-right text-xs text-slate-400">{i + 1}.</td>
                <td className="px-2 py-1.5">
                  <input
                    className={cn("input !py-1.5", !r.name.trim() && "!border-rose-300")}
                    value={r.name}
                    placeholder="e.g. Heated sq. ft."
                    aria-label="Parameter name"
                    autoFocus={!r.name}
                    onChange={(e) => patch(r.key, { name: e.target.value })}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input className="input !py-1.5" value={r.unit} placeholder="sf" aria-label="Unit" onChange={(e) => patch(r.key, { unit: e.target.value })} />
                </td>
                {usage ? (
                  <td className="px-2 py-1.5 text-right text-xs tabular-nums text-slate-500">{r.id && usage[r.id] ? `${usage[r.id]} item${usage[r.id] === 1 ? "" : "s"}` : "—"}</td>
                ) : null}
                <td className="px-2 py-1.5">
                  <span className="flex justify-end gap-0.5">
                    <button type="button" className={buttonClasses("ghost", "sm")} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className={buttonClasses("ghost", "sm")} disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className={cn(buttonClasses("ghost", "sm"), "text-rose-700")}
                      aria-label={`Delete ${r.name || "parameter"}`}
                      onClick={() => {
                        const used = r.id ? (usage?.[r.id] ?? 0) : 0;
                        if (used && !window.confirm(`${r.name} is used by ${used} item${used === 1 ? "" : "s"}. Their formulas will show [?] and count it as 0. Delete it?`))
                          return;
                        change((rs) => rs.filter((x) => x.key !== r.key));
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className={buttonClasses("secondary", "sm")} onClick={() => change((rs) => [...rs, { key: ++seq, id: null, name: "", unit: "" }])}>
          <Plus className="h-3.5 w-3.5" /> Add parameter
        </button>
      </div>

      <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <span className={cn("mr-auto text-xs", error ? "text-rose-700" : "text-amber-700")}>{error ?? (dirty ? "Not saved yet" : "")}</span>
        <button
          type="button"
          className={buttonClasses("secondary")}
          disabled={!dirty || saving}
          onClick={() => {
            setRows(fresh());
            setDirty(false);
            setError(null);
          }}
        >
          Discard
        </button>
        <button type="button" className={buttonClasses("primary")} disabled={!dirty || saving} onClick={save}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
