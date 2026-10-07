"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { Field, FormGrid, SubmitButton, buttonClasses } from "@/components/ui";
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

/** New or edit: your own rows ("up to 12 ft → 2x6"), or the code's spans for a species and loads. */
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

  return (
    <form action={action} className="space-y-4">
      {values ? <input type="hidden" name="id" value={values.id} /> : null}
      <input type="hidden" name="rows" value={JSON.stringify(clean)} />
      <input type="hidden" name="source" value={source} />
      <datalist id={listId}>
        {sizes.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <FormGrid className="md:grid-cols-3">
        <Field label="Name" htmlFor={p("name")} className="md:col-span-2">
          <input id={p("name")} name="name" required className="input" defaultValue={values?.name} placeholder="Floor joists" />
        </Field>
        <Field label="For" htmlFor={p("use")}>
          <select
            id={p("use")}
            name="use"
            className="input"
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
        </Field>
      </FormGrid>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["CUSTOM", "My own table", "Up to so many feet → this size"],
            ["CODE", "Code span table", "IRC spans for the lumber you buy"],
          ] as const
        ).map(([key, label, hint]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSource(key)}
            className={`rounded-lg border px-3 py-2 text-left text-sm ${source === key ? "border-blue-600 bg-blue-50 text-blue-900" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
          >
            <span className="block font-medium">{label}</span>
            <span className="block text-xs text-slate-500">{hint}</span>
          </button>
        ))}
      </div>

      {source === "CUSTOM" ? (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-24 text-slate-600">{i === 0 ? "Spans up to" : "then up to"}</span>
              <input
                aria-label="Up to (ft)"
                type="number"
                min="1"
                step="0.5"
                className="input !w-24"
                value={r.upToFt}
                onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, upToFt: e.target.value } : x)))}
              />
              <span className="text-slate-600">ft →</span>
              <input
                aria-label="Size"
                list={listId}
                className="input !w-48"
                value={r.size}
                placeholder="2x8"
                onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, size: e.target.value } : x)))}
              />
              {rows.length > 1 ? (
                <button type="button" className={buttonClasses("ghost", "sm")} onClick={() => setRows(rows.filter((_, k) => k !== i))} aria-label="Remove row">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            className={buttonClasses("ghost", "sm")}
            onClick={() => setRows([...rows, { upToFt: String((Math.max(0, ...clean.map((x) => x.upToFt)) || 0) + 4), size: "" }])}
          >
            <Plus className="h-3.5 w-3.5" /> Add a row
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <FormGrid className="md:grid-cols-2">
            <Field label="Lumber" htmlFor={p("species")}>
              <select id={p("species")} name="species" className="input" value={species} onChange={(e) => setSpecies(e.target.value)}>
                {SPECIES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Loads" htmlFor={p("load")}>
              <select id={p("load")} name="load" className="input" value={load} onChange={(e) => setLoad(e.target.value)}>
                {loadsFor(use).map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Field>
          </FormGrid>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Longest span</th>
                  {SPACINGS.map((s) => (
                    <th key={s} className="px-3 py-1.5 text-right font-medium">
                      {s}&quot; o.c.
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {codeSizes(use).map((size) => (
                  <tr key={size} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 font-medium text-slate-800">{size}</td>
                    {SPACINGS.map((s) => (
                      <td key={s} className="px-3 py-1.5 text-right tabular-nums text-slate-700">
                        {ftIn(codeSpanFt(size, species, load, s))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Figured the way the IRC span tables are (No. 2 lumber, the loads above, the takeoff&apos;s spacing) — the smallest size that spans it is used. Spot-check a few against
            your code book; your local code or engineer has the last word. Rafter spans are measured level (plan view).
          </p>
        </div>
      )}

      <Field label="Longer than that" htmlFor={p("overSize")} hint="A specialty member (TJI, LVL…) for spans past the table — leave blank to be told instead">
        <input id={p("overSize")} name="overSize" list={listId} className="input md:!w-80" defaultValue={values?.overSize ?? ""} placeholder="TJI 210" />
      </Field>

      <div className="flex items-center gap-2">
        <SubmitButton>{values ? "Save table" : "Add table"}</SubmitButton>
        {values ? (
          <Link href="/settings/span-tables" className={buttonClasses("ghost")}>
            Cancel
          </Link>
        ) : null}
      </div>
    </form>
  );
}
