"use client";

import { useState } from "react";
import { compareMaterialNames, doorSizeCode, feetInchesIn } from "@/lib/takeoff";
import { CODE_GROUPS, type CodeGroup, type CodeRules } from "@/lib/code-groups";
import { cn, costCodeLabel } from "@/lib/utils";

/** A door or window on the Item List with its size (and, for doors, interior / exterior; for windows, a type). */
export type DoorChoice = { id: string; name: string; widthIn: number; heightIn: number; exterior: boolean | null; style: string | null };

export type NewUnit = { name: string; widthIn: number; heightIn: number; exterior: boolean; style: string | null; costCodeId: string | null; codeForAll: boolean };

/** Cost codes to offer, and the remembered "same code for all windows / doors" answers. */
export type UnitCodes = { costCodes: { id: string; code: string | null; name: string }[]; rules: CodeRules };

const chip = (on: boolean) =>
  cn(
    "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
    on ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
  );

/** The first filter: interior / exterior for doors, the window type for windows ("" = any). */
function groupOf(d: DoorChoice, kind: "door" | "window") {
  if (kind === "window") return d.style?.trim() || "";
  return d.exterior === true ? "ext" : d.exterior === false ? "int" : "";
}

/**
 * Pick a door or window from the Item List without scrolling a long list: narrow it
 * by interior / exterior (doors) or type (windows), then height and width, then
 * choose. Every filter narrows the list and switches the pick to the first match.
 * "New …" adds one to the Item List with its size.
 */
export function DoorPicker({
  doors,
  value,
  onChange,
  onCreate,
  compact,
  kind = "door",
  codes,
}: {
  doors: DoorChoice[];
  value: string | null;
  onChange: (id: string | null) => void;
  onCreate: (unit: NewUnit) => Promise<string | null>;
  compact?: boolean;
  kind?: "door" | "window";
  codes?: UnitCodes;
}) {
  const noun = kind === "window" ? "window" : "door";
  const current = doors.find((d) => d.id === value) ?? null;
  // Filters start from the one already picked, so its neighbors are one click away.
  const [group, setGroup] = useState<string>(current ? groupOf(current, kind) : "");
  const [height, setHeight] = useState<number | null>(current?.heightIn ?? null);
  const [width, setWidth] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", width: "", height: "", exterior: false, style: "" });
  // Cost code for a new one: "" = not picked yet, "none" = left blank on purpose. forAll null = the default.
  const [code, setCode] = useState<{ id: string; forAll: boolean | null; changing: boolean }>({ id: "", forAll: null, changing: false });
  const [busy, setBusy] = useState(false);

  // The first filter is strict (one with no setting only shows under Any); each filter narrows the next.
  const filter = (g: string, h: number | null, wd: number | null) => {
    const byGroup = doors.filter((d) => !g || groupOf(d, kind).toLowerCase() === g.toLowerCase());
    const byHeight = byGroup.filter((d) => h == null || d.heightIn === h);
    const list = byHeight.filter((d) => wd == null || d.widthIn === wd).sort((a, b) => compareMaterialNames(a.name, b.name));
    return { byGroup, byHeight, list };
  };
  const { byGroup, byHeight, list } = filter(group, height, width);
  const groups: [string, string][] =
    kind === "window"
      ? Array.from(new Set(doors.map((d) => groupOf(d, kind)).filter(Boolean)))
          .sort((a, b) => a.localeCompare(b))
          .map((t) => [t, t])
      : [
          ["int", "Int"],
          ["ext", "Ext"],
        ];
  const heights = Array.from(new Set(byGroup.map((d) => d.heightIn))).sort((a, b) => a - b);
  const widths = Array.from(new Set(byHeight.map((d) => d.widthIn))).sort((a, b) => a - b);
  /** Change the filters; when the one picked no longer matches, switch to the first one that does. */
  const refilter = (g: string, h: number | null, wd: number | null) => {
    setGroup(g);
    setHeight(h);
    setWidth(wd);
    const next = filter(g, h, wd).list;
    if (!next.some((d) => d.id === value)) onChange(next[0]?.id ?? null);
  };

  if (adding) {
    const w = Number(draft.width) || 0;
    const h = Number(draft.height) || 0;
    const label = kind === "window" ? draft.style.trim() || "window" : `${draft.exterior ? "Ext" : "Int"} door`;
    const name = draft.name.trim() || (w && h ? `${doorSizeCode(w, h)} ${label}` : "");
    const types = groups.map(([t]) => t);
    const codeGroup: CodeGroup = kind === "window" ? "windows" : draft.exterior ? "doors:exterior" : "doors:interior";
    const plural = CODE_GROUPS[codeGroup].plural;
    const rule = codes?.rules[codeGroup];
    const ruleCode = rule?.sameForAll ? rule.costCodeId : null;
    const ruleLabel = ruleCode ? codes?.costCodes.find((c) => c.id === ruleCode) : undefined;
    const usingRule = !!ruleLabel && !code.changing;
    const forAll = code.forAll ?? (ruleCode ? false : rule?.sameForAll !== false);
    const pickedCode = usingRule ? ruleCode : code.id === "none" ? null : code.id || null;
    const codeReady = !codes || usingRule || code.id !== "";
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] text-slate-600">
            Width (in)
            <input
              className="input !w-20 !py-1 text-xs"
              type="number"
              min="6"
              step="0.5"
              value={draft.width}
              onChange={(e) => setDraft({ ...draft, width: e.target.value })}
              placeholder={kind === "window" ? "36" : "32"}
            />
          </label>
          <label className="text-[11px] text-slate-600">
            Height (in)
            <input
              className="input !w-20 !py-1 text-xs"
              type="number"
              min="6"
              step="0.5"
              value={draft.height}
              onChange={(e) => setDraft({ ...draft, height: e.target.value })}
              placeholder={kind === "window" ? "60" : "80"}
            />
          </label>
          {kind === "window" ? (
            <label className="text-[11px] text-slate-600">
              Type
              <input
                className="input !w-28 !py-1 text-xs"
                list="window-types"
                value={draft.style}
                onChange={(e) => setDraft({ ...draft, style: e.target.value })}
                placeholder="Single hung"
              />
              <datalist id="window-types">
                {types.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
          ) : (
            <div className="inline-flex overflow-hidden rounded-md border border-slate-300 text-[11px]">
              {[false, true].map((ext) => (
                <button
                  key={String(ext)}
                  type="button"
                  onClick={() => setDraft({ ...draft, exterior: ext })}
                  className={cn("px-2 py-1 font-medium", draft.exterior === ext ? "bg-slate-900 text-white" : "bg-white text-slate-700")}
                >
                  {ext ? "Ext" : "Int"}
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          className="input !py-1 text-xs"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder={name || (kind === "window" ? "Name, e.g. 3050 single hung vinyl" : "Name, e.g. 2868 6-panel prehung LH")}
        />
        {codes ? (
          usingRule ? (
            <p className="text-[11px] text-slate-600">
              Cost code: <span className="font-medium text-slate-900">{costCodeLabel(ruleLabel!)}</span> <span className="text-slate-500">(all {plural})</span>{" "}
              <button type="button" className="text-blue-700 hover:underline" onClick={() => setCode({ id: ruleCode!, forAll: false, changing: true })}>
                change
              </button>
            </p>
          ) : (
            <div className="space-y-1">
              <select
                aria-label="Cost code"
                className={cn("input !py-1 text-xs", code.id === "" && "border-amber-400")}
                value={code.id}
                onChange={(e) => setCode({ ...code, id: e.target.value })}
              >
                <option value="">Cost code — pick one…</option>
                {codes.costCodes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {costCodeLabel(c)}
                  </option>
                ))}
                <option value="none">Leave blank for now</option>
              </select>
              {code.id && code.id !== "none" ? (
                <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                  <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300" checked={forAll} onChange={(e) => setCode({ ...code, forAll: e.target.checked })} />
                  Use this for all {plural} (and fill in any with no code)
                </label>
              ) : null}
            </div>
          )
        ) : null}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy || !w || !h || !name || !codeReady}
            className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
            onClick={async () => {
              setBusy(true);
              const id = await onCreate({
                name,
                widthIn: w,
                heightIn: h,
                exterior: draft.exterior,
                style: kind === "window" ? draft.style.trim() || null : null,
                costCodeId: pickedCode,
                codeForAll: !usingRule && !!pickedCode && forAll,
              });
              setBusy(false);
              if (id) {
                setAdding(false);
                setCode({ id: "", forAll: null, changing: false });
                setGroup(kind === "window" ? draft.style.trim() : draft.exterior ? "ext" : "int");
                setHeight(h);
                setWidth(w);
                onChange(id);
              }
            }}
          >
            {busy ? "Adding…" : `Add ${noun}`}
          </button>
          <button type="button" className="text-xs text-slate-600 hover:underline" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
        <p className="text-[11px] text-slate-500">Added to Settings → Item List (in your {kind === "window" ? "windows" : "doors"} category), where you can set its price.</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", compact && "text-xs")}>
      <div className="flex flex-wrap items-center gap-1">
        {kind === "window" ? <span className="w-10 text-[10px] font-semibold uppercase text-slate-500">Type</span> : null}
        <button type="button" className={chip(group === "")} onClick={() => refilter("", null, null)}>
          Any
        </button>
        {groups.map(([k, label]) => (
          <button key={k} type="button" className={chip(group.toLowerCase() === k.toLowerCase())} onClick={() => refilter(k, null, null)}>
            {label}
          </button>
        ))}
      </div>
      {heights.length ? (
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-10 text-[10px] font-semibold uppercase text-slate-500">Height</span>
          <button type="button" className={chip(height == null)} onClick={() => refilter(group, null, width)}>
            Any
          </button>
          {heights.map((h) => (
            <button key={h} type="button" className={chip(height === h)} onClick={() => refilter(group, height === h ? null : h, null)}>
              {feetInchesIn(h)}
            </button>
          ))}
        </div>
      ) : null}
      {widths.length ? (
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-10 text-[10px] font-semibold uppercase text-slate-500">Width</span>
          <button type="button" className={chip(width == null)} onClick={() => refilter(group, height, null)}>
            Any
          </button>
          {widths.map((w) => (
            <button key={w} type="button" className={chip(width === w)} onClick={() => refilter(group, height, width === w ? null : w)}>
              {feetInchesIn(w)}
            </button>
          ))}
        </div>
      ) : null}
      <select
        aria-label={kind === "window" ? "Window" : "Door"}
        className="input !py-1 text-xs"
        value={value ?? ""}
        onChange={(e) => {
          if (e.target.value === "__new") {
            setAdding(true);
            setDraft({
              name: "",
              width: width ? String(width) : "",
              height: height ? String(height) : "",
              exterior: group === "ext",
              style: kind === "window" ? group : "",
            });
          } else onChange(e.target.value || null);
        }}
      >
        <option value="">{list.length ? `Pick a ${noun} (${list.length})…` : `No ${noun}s match — add one`}</option>
        {list.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
        <option value="__new">+ New {noun}…</option>
      </select>
    </div>
  );
}
