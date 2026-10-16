"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmForm } from "@/components/ui";
import { moveByArrow } from "@/components/grid-keys";
import { RECHECK_UNITS } from "@/lib/price-recheck";
import { HelpLink } from "@/components/help/help-link";
import { deleteCostCode, saveCostCodeCell, toggleCostCodeActive, type CostCodeCell } from "../actions";

export type CostCodeRow = {
  id: string;
  code: string | null;
  name: string;
  division: string;
  sortOrder: number;
  active: boolean;
  priceRecheckEvery: number | null;
  priceRecheckUnit: string | null;
  /** Records using it, and what they are (its tooltip). */
  refs: number;
  refsTitle: string;
  /** "06-100 Framing", for the delete question. */
  label: string;
};

type Status = "saving" | "saved" | { error: string };

const cell = "!h-8 !px-2 !py-1";

/**
 * The cost code library as an editable table, like the Item List: change a box right in its row
 * and it saves when you click away. Tick several rows and a group or recheck time goes into all
 * of them.
 */
export function CostCodeTable({ groups, divisions }: { groups: { division: string; codes: CostCodeRow[] }[]; divisions: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [, startTransition] = useTransition();
  const all = groups.flatMap((g) => g.codes.map((c) => c.id));
  const picked = all.filter((id) => selected.has(id));

  const toggle = (ids: string[], on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  /** Group and recheck time go to every ticked row (when this one is ticked); code, name and sort are one code's own. */
  const save = (id: string, field: CostCodeCell, value: string) => {
    const k = `${id}:${field}`;
    const fills = field === "division" || field === "recheck";
    const ids = fills && selected.has(id) && picked.length > 1 ? picked : [id];
    setStatus((s) => ({ ...s, [k]: "saving" }));
    startTransition(async () => {
      const r = await saveCostCodeCell(ids, field, value);
      setStatus((s) => ({ ...s, [k]: r.error ? { error: r.error } : "saved" }));
      if (!r.error)
        setTimeout(
          () =>
            setStatus((s) => {
              if (s[k] !== "saved") return s;
              const next = { ...s };
              delete next[k];
              return next;
            }),
          1500,
        );
    });
  };
  const mark = (id: string, field: CostCodeCell) => <CellStatus status={status[`${id}:${field}`]} />;

  return (
    <>
      <datalist id="division-list">
        {divisions.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm" onKeyDown={moveByArrow}>
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Select all cost codes"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={all.length > 0 && picked.length === all.length}
                  onChange={(e) => toggle(all, e.target.checked)}
                />
              </th>
              <th className="px-2 py-2.5 font-medium">Code</th>
              <th className="px-2 py-2.5 font-medium">Name</th>
              <th className="px-2 py-2.5 font-medium">Group</th>
              <th className="px-2 py-2.5 text-right font-medium">Sort</th>
              <th className="px-2 py-2.5 font-medium">
                <span className="inline-flex items-center gap-1">
                  Recheck prices every <HelpLink slug="estimate-settings" section="Cost codes" />
                </span>
              </th>
              <th className="px-2 py-2.5 text-right font-medium">In use</th>
              <th className="px-2 py-2.5 font-medium">Active</th>
              <th />
            </tr>
          </thead>
          {groups.map((g) => {
            const ids = g.codes.map((c) => c.id);
            return (
              <tbody key={g.division} className="divide-y divide-slate-100">
                <tr className="bg-slate-50/80">
                  <td className="px-3 py-1.5">
                    <input
                      type="checkbox"
                      aria-label={`Select all in ${g.division}`}
                      className="h-4 w-4 rounded border-slate-300"
                      checked={ids.every((id) => selected.has(id))}
                      onChange={(e) => toggle(ids, e.target.checked)}
                    />
                  </td>
                  <td colSpan={8} className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    {g.division}
                  </td>
                </tr>
                {g.codes.map((c) => (
                  <tr key={c.id} className={cn(selected.has(c.id) ? "bg-blue-50" : "hover:bg-slate-50", !c.active && "text-slate-400")}>
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${c.label}`}
                        className="h-4 w-4 rounded border-slate-300"
                        checked={selected.has(c.id)}
                        onChange={(e) => toggle([c.id], e.target.checked)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="flex items-center gap-1">
                        <TextCell label={`Code for ${c.name}`} value={c.code} width="!w-20" mono onSave={(v) => save(c.id, "code", v)} />
                        {mark(c.id, "code")}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="flex items-center gap-1">
                        <TextCell label={`Name of ${c.label}`} value={c.name} width="!w-56" onSave={(v) => save(c.id, "name", v)} />
                        {mark(c.id, "name")}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="flex items-center gap-1">
                        <TextCell label={`Group for ${c.label}`} value={c.division} width="!w-44" list="division-list" onSave={(v) => save(c.id, "division", v)} />
                        {mark(c.id, "division")}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="flex items-center justify-end gap-1">
                        {mark(c.id, "sortOrder")}
                        <TextCell label={`Sort order for ${c.label}`} value={String(c.sortOrder)} width="!w-16 text-right" onSave={(v) => save(c.id, "sortOrder", v)} />
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="flex items-center gap-1">
                        <RecheckCell key={`${c.priceRecheckEvery ?? ""}|${c.priceRecheckUnit ?? ""}`} row={c} onSave={(v) => save(c.id, "recheck", v)} />
                        {mark(c.id, "recheck")}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      <span title={c.refsTitle}>{c.refs || "—"}</span>
                    </td>
                    <td className="px-2 py-1.5">
                      <form action={toggleCostCodeActive}>
                        <input type="hidden" name="id" value={c.id} />
                        <button
                          type="submit"
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                            c.active ? "bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100" : "bg-slate-100 text-slate-600 ring-slate-200 hover:bg-slate-200",
                          )}
                          title={c.active ? "Click to deactivate" : "Click to activate"}
                        >
                          {c.active ? "Active" : "Inactive"}
                        </button>
                      </form>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <ConfirmForm
                        action={deleteCostCode}
                        hidden={{ id: c.id }}
                        message={
                          c.refs > 0
                            ? `${c.label} is referenced by ${c.refs} record${c.refs === 1 ? "" : "s"} and cannot be deleted. Deactivate it instead?`
                            : `Delete cost code ${c.label}?`
                        }
                        variant="ghost"
                      >
                        {c.refs > 0 ? "Deactivate" : "Delete"}
                      </ConfirmForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
        {picked.length > 1 ? (
          <span className="font-medium text-blue-800">
            {picked.length} rows ticked — a group or recheck time changed on any of them goes into all {picked.length}.{" "}
          </span>
        ) : null}
        Change any box right in its row — it saves when you click away. Tick several rows to give them the same group or recheck time.
      </p>
    </>
  );
}

/** "Recheck prices every [3] [weeks]": saves both together; a blank number = never. */
function RecheckCell({ row, onSave }: { row: CostCodeRow; onSave: (v: string) => void }) {
  const every = row.priceRecheckEvery ? String(row.priceRecheckEvery) : "";
  const unit = row.priceRecheckUnit ?? "weeks";
  const [n, setN] = useState(every);
  const [u, setU] = useState(unit);
  const send = (nn: string, uu: string) => {
    const num = Math.round(Number(nn));
    const clean = nn.trim() && num > 0 ? String(num) : "";
    if (clean === every && (uu === unit || !clean)) return;
    onSave(clean ? `${clean}|${uu}` : "");
  };
  return (
    <span className="flex items-center gap-1">
      <input
        inputMode="numeric"
        aria-label={`Recheck prices for ${row.label} every`}
        className={cn("input !w-14 text-right tabular-nums", cell)}
        value={n}
        placeholder="—"
        onChange={(e) => setN(e.target.value.replace(/\D/g, ""))}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setN(every);
            e.currentTarget.blur();
          }
        }}
        onBlur={() => send(n, u)}
      />
      <select
        aria-label={`Days, weeks or months for ${row.label}`}
        className={cn("input !w-24", cell)}
        value={u}
        onChange={(e) => {
          setU(e.target.value);
          send(n, e.target.value);
        }}
      >
        {RECHECK_UNITS.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
    </span>
  );
}

function TextCell({ label, value, onSave, list, width, mono }: { label: string; value: string | null; onSave: (v: string) => void; list?: string; width: string; mono?: boolean }) {
  const original = value ?? "";
  return (
    <input
      key={original}
      aria-label={label}
      list={list}
      autoComplete={list ? "off" : undefined}
      className={cn("input", width, cell, mono && "font-mono")}
      defaultValue={original}
      placeholder="—"
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.currentTarget.value = original;
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => {
        const v = e.currentTarget.value.trim();
        if (v !== original) onSave(v);
      }}
    />
  );
}

/** ✓ when a box saved, a dot while saving, and the error when it didn't. */
function CellStatus({ status }: { status?: Status }) {
  if (!status) return <span className="inline-block w-3.5" />;
  if (status === "saving") return <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400" aria-label="Saving" />;
  if (status === "saved") return <Check className="h-3.5 w-3.5 text-emerald-600" aria-label="Saved" />;
  return (
    <span title={status.error} className="text-rose-600">
      <X className="h-3.5 w-3.5" aria-label={status.error} />
    </span>
  );
}
