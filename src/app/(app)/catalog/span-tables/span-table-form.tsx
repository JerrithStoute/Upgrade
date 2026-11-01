"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { SubmitButton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { SPAN_LOADS, SPAN_USES, SPECIES, codeSizes, codeSpanFt, type SpanUse } from "@/lib/span-tables";

export type SpanTableValues = {
  id: string;
  name: string;
  use: string;
  source: string;
  species: string;
  load: string;
  rows: { upToFt: number; size: string }[];
  overSize: string | null;
};

const SPACINGS = [12, 16, 19.2, 24];
const ftIn = (ft: number | null) => {
  if (ft == null) return "—";
  const inches = Math.round(ft * 12);
  return `${Math.floor(inches / 12)}'-${inches % 12}"`;
};
const box = "input !h-7 !py-0 text-xs";
const lbl = "mb-0.5 block text-[11px] text-slate-500";

/**
 * New or edit, in small boxes: name and what it's for, then your own rows ("up to 12 ft → 2x6") or the code's
 * spans for a species and loads (with a preview), and the member for anything longer. Cancel is the page's.
 */
export function SpanTableForm({ action, values, sizes }: { action: (fd: FormData) => Promise<void>; values?: SpanTableValues; sizes: string[] }) {
  const p = (k: string) => `span-${values?.id ?? "new"}-${k}`;
  const [use, setUse] = useState<SpanUse>((values?.use as SpanUse) ?? "FLOOR");
  const [source, setSource] = useState(values?.source === "CODE" ? "CODE" : "CUSTOM");
  const [species, setSpecies] = useState(values?.species || "SPF2");
  const loadsFor = (u: SpanUse) => SPAN_LOADS.filter((l) => l.use === u);
  const [load, setLoad] = useState(values?.load && SPAN_LOADS.some((l) => l.key === values.load) ? values.load : loadsFor(use)[0].key);
  const [rows, setRows] = useState<{ upToFt: string; size: string }[]>(
    values?.rows.length
      ? values.rows.map((r) => ({ upToFt: String(r.upToFt), size: r.size }))
      : [
          { upToFt: "12", size: "2x6" },
          { upToFt: "16", size: "2x8" },
        ],
  );
  const clean = rows.map((r) => ({ upToFt: Number(r.upToFt), size: r.size.trim() })).filter((r) => r.upToFt > 0 && r.size);
  const listId = p("sizes");
  const overSize = (
    <label className="block">
      <span className={lbl}>Longer than that</span>
      <input
        name="overSize"
        list={listId}
        className={box}
        defaultValue={values?.overSize ?? ""}
        placeholder="TJI 210"
        title="A specialty member (TJI, LVL…) for spans past the table — leave blank to be told instead"
      />
    </label>
  );

  return (
    <form action={action} className="space-y-2">
      {values ? <input type="hidden" name="id" value={values.id} /> : null}
      <input type="hidden" name="rows" value={JSON.stringify(clean)} />
      <input type="hidden" name="source" value={source} />
      <datalist id={listId}>
        {sizes.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <div className="grid items-end gap-2 sm:grid-cols-3 md:grid-cols-[2fr_1fr_auto]">
        <label>
          <span className={lbl}>Name</span>
          <input name="name" required autoFocus={!values} className={box} defaultValue={values?.name} placeholder="Floor joists" />
        </label>
        <label>
          <span className={lbl}>For</span>
          <select
            name="use"
            className={box}
            value={use}
            onChange={(e) => {
              const u = e.target.value as SpanUse;
              setUse(u);
              if (!loadsFor(u).some((l) => l.key === load)) setLoad(loadsFor(u)[0].key);
            }}
          >
            {SPAN_USES.map((u) => (
              <option key={u.key} value={u.key}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
        <span className="inline-flex h-7 overflow-hidden rounded-md border border-slate-300 text-xs" role="group" aria-label="Kind of table">
          {(
            [
              ["CUSTOM", "My own table", "Up to so many feet → this size"],
              ["CODE", "Code spans", "IRC spans for the lumber you buy"],
            ] as const
          ).map(([key, label, hint], i) => (
            <button
              key={key}
              type="button"
              title={hint}
              aria-pressed={source === key}
              onClick={() => setSource(key)}
              className={cn("px-2.5 font-medium", i && "border-l border-slate-300", source === key ? "bg-blue-50 text-blue-800" : "bg-white text-slate-600 hover:bg-slate-50")}
            >
              {label}
            </button>
          ))}
        </span>
      </div>

      {source === "CUSTOM" ? (
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
              <span className="w-16">{i === 0 ? "Spans up to" : "then up to"}</span>
              <input
                aria-label="Up to (ft)"
                type="number"
                min="1"
                step="0.5"
                className={cn(box, "!w-20")}
                value={r.upToFt}
                onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, upToFt: e.target.value } : x)))}
              />
              <span>ft →</span>
              <input
                aria-label="Size"
                list={listId}
                className={cn(box, "!w-40")}
                value={r.size}
                placeholder="2x8"
                onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, size: e.target.value } : x)))}
              />
              {rows.length > 1 ? (
                <button type="button" className="rounded p-1 text-slate-400 hover:text-rose-600" onClick={() => setRows(rows.filter((_, k) => k !== i))} aria-label="Remove row">
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            className="text-xs font-medium text-blue-700 hover:underline"
            onClick={() => setRows([...rows, { upToFt: String((Math.max(0, ...clean.map((x) => x.upToFt)) || 0) + 4), size: "" }])}
          >
            + Add a row
          </button>
          <div className="max-w-xs">{overSize}</div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-3">
            <label>
              <span className={lbl}>Lumber</span>
              <select name="species" className={box} value={species} onChange={(e) => setSpecies(e.target.value)}>
                {SPECIES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={lbl}>Loads</span>
              <select name="load" className={box} value={load} onChange={(e) => setLoad(e.target.value)}>
                {loadsFor(use).map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            {overSize}
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="px-3 py-1.5 text-left font-normal">Longest span</th>
                  {SPACINGS.map((s) => (
                    <th key={s} className="px-3 py-1.5 text-right font-normal">
                      {s}&quot; o.c.
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {codeSizes(use).map((size) => (
                  <tr key={size} className="border-t border-slate-100">
                    <td className="px-3 py-1 font-medium text-slate-800">{size}</td>
                    {SPACINGS.map((s) => (
                      <td key={s} className="px-3 py-1 text-right tabular-nums text-slate-600">
                        {ftIn(codeSpanFt(size, species, load, s))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Figured the way the IRC span tables are (No. 2 lumber, the loads above, the takeoff&apos;s spacing); the smallest size that spans it is used. Spot-check a few against
            your code book; your local code or engineer has the last word. Rafter spans are measured level (plan view).
          </p>
        </div>
      )}

      <SubmitButton size="sm" className="!h-7 !px-2.5 !text-xs">
        {values ? "Save table" : "Add table"}
      </SubmitButton>
    </form>
  );
}
