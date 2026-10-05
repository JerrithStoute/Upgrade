"use client";

import { useState } from "react";
import Link from "next/link";
import { Field, FormGrid, SubmitButton, buttonClasses } from "@/components/ui";
import { cn, costCodeLabel, money, num } from "@/lib/utils";
import {
  CONDITION_COLORS,
  CONDITION_TYPES,
  CONDITION_TYPE_LABELS,
  DEFAULT_METRIC,
  SOLD_AS_LABELS,
  METRICS_BY_TYPE,
  hipFactor,
  beamOptions,
  metricLabel,
  slopeFactor,
  packBoards,
  parseStockLengths,
  wasteBoards,
  withWasteBoards,
  listCost,
  PACK_MODES,
  PACK_MODE_LABELS,
  type ConditionType,
  type LengthPrices,
  type PackMode,
} from "@/lib/takeoff";
import { CodeRuleFields } from "./code-rules";
import { PendingItems } from "./pending-items";
import type { ItemOption } from "./assembly-form";
import type { CodeRules } from "@/lib/code-groups";
import { DoorOptionsFields, OpeningOptionsFields, WallOptionsFields, WindowOptionsFields, type ItemChoice } from "./wall-options";

export type ConditionFormValues = {
  id: string;
  name: string;
  type: string;
  metric: string;
  color: string;
  group: string;
  /** Measured for information only — not on the estimate or the Material list. */
  referenceOnly?: boolean;
  costCodeId: string | null;
  unitCost: number;
  markupPct: number;
  wastePct: number;
  pitch: number;
  pitchMode: string;
  pitch2: number | null;
  height: number;
  depth: number;
  spacing: number;
  overhang: number;
  memberSize: string | null;
  memberSizeId: string | null;
  stockLengths: string | null;
  options?: string | null;
  /** Joists/rafters: how cuts are packed into boards (WASTE | CHEAPEST | LENGTH) and the length for LENGTH. */
  packMode?: string;
  packLength?: number | null;
  /** Job takeoffs: every member's length and the board prices, to compare the packings. */
  packing?: { cuts: number[]; prices: LengthPrices | null };
};

export type MemberSizeOption = { id: string; name: string; kind: string; soldAs: string; stockLengths: string | null };

const TYPE_HINTS: Record<ConditionType, string> = {
  AREA: "Click the corners of a shape. Flooring, drywall, slabs, roofing, siding.",
  LINEAR: "Click along a line. Walls, trim, gutters, rakes, hips and valleys.",
  COUNT: "Click once per item. Outlets, fixtures, doors, windows.",
  FRAMING: "Outline the framed area; joists or rafters are laid out at your spacing.",
  HIP_VALLEY: "Trace each hip, valley or ridge on the roof plan, wall corner to ridge. Every line is one piece of lumber.",
  BEAM: "Trace each beam from bearing to bearing — one line per beam. The bearing is added at both ends, and plies order that many pieces per beam.",
  WALL: 'Trace walls corner to corner; double-click to finish a run, or end on the first corner to close it. Name the takeoff for the wall ("Ext 2x6 Wall").',
  DOOR: "Click each door on the plan, then pick which door it is. Doors are counted by name, and casing is added for each one.",
  WINDOW: "Click each window on the plan, then pick which window it is. Windows are counted by name, with casing, stool and apron for each one.",
  OPENING: "Draw a line across each door or window opening — one line per opening, its length is the width. Headers and king & jack studs come from here.",
};

export function ConditionForm({
  action,
  hidden,
  costCodes,
  memberSizes,
  itemOptions = [],
  defaultMarkup,
  values,
  hasMeasurements,
  cancelHref,
  nextColor,
  codeRules = {},
  assemblyItems,
}: {
  action: (fd: FormData) => Promise<void>;
  /** Hidden fields identifying where the condition lives (projectId, or templateId). */
  hidden: Record<string, string>;
  costCodes: { id: string; code: string | null; name: string }[];
  memberSizes: MemberSizeOption[];
  /** Item List items, offered for sheathing, drywall and baseboard. */
  itemOptions?: ItemChoice[];
  defaultMarkup: number;
  values?: ConditionFormValues;
  hasMeasurements?: boolean;
  cancelHref?: string;
  nextColor?: string;
  /** Remembered "same cost code for all windows / lumber / …" answers. */
  codeRules?: CodeRules;
  /** New takeoffs: Item List entries for adding assembly items before the first save. */
  assemblyItems?: ItemOption[];
}) {
  const [type, setType] = useState<ConditionType>((values?.type as ConditionType) ?? "AREA");
  const [metric, setMetric] = useState(values?.metric ?? DEFAULT_METRIC[type]);
  const [pitchText, setPitchText] = useState(String(values?.pitch ?? 0));
  const pitch = Math.max(0, Number(pitchText) || 0);
  const [pitch2Text, setPitch2Text] = useState(values?.pitch2 == null ? "" : String(values.pitch2));
  const pitch2 = pitch2Text.trim() === "" ? pitch : Math.max(0, Number(pitch2Text) || 0);
  const [sizeId, setSizeId] = useState(values?.memberSizeId ?? "");
  const [stockText, setStockText] = useState(values?.stockLengths ?? "");
  const [pack, setPack] = useState<PackMode>((values?.packMode as PackMode) ?? "WASTE");
  const [packLengthText, setPackLengthText] = useState(values?.packLength ? String(values.packLength) : "");
  const size = memberSizes.find((m) => m.id === sizeId) ?? null;
  const metrics = METRICS_BY_TYPE[type];
  const p = (k: string) => `cond-${values?.id ?? "new"}-${k}`;
  const isWall = type === "WALL";
  const isOpening = type === "OPENING";
  const isDoor = type === "DOOR";
  const isWindow = type === "WINDOW";
  const isAuto = isWall || isOpening || isDoor || isWindow;
  const isHip = type === "HIP_VALLEY";
  const isBeam = type === "BEAM";
  const isMember = type === "FRAMING" || isHip || isBeam;
  // Beams are level: no pitch, and their bearing stands in for overhang.
  const showPitch = type !== "COUNT" && !isAuto && !isBeam;
  const beam = beamOptions(values?.options);
  const factor = isHip ? hipFactor(pitch, pitch2) : slopeFactor(pitch);
  const pitchHint = isHip
    ? pitch > 0 && pitch2 > 0
      ? `${pitch}/12 & ${pitch2}/12 → plan × ${factor.toFixed(3)}`
      : "0 on either side = level (ridges)"
    : pitch > 0
      ? `${pitch}/12 → plan × ${factor.toFixed(3)}`
      : "0 = flat";

  return (
    <form action={action} className="space-y-4">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {values ? <input type="hidden" name="id" value={values.id} /> : null}
      <FormGrid className="md:grid-cols-4">
        <Field label="Name" htmlFor={p("name")} className="md:col-span-2">
          <input
            id={p("name")}
            name="name"
            required
            className="input"
            defaultValue={values?.name}
            placeholder={
              type === "FRAMING"
                ? '2x10 Floor Joists @ 16" o.c.'
                : isHip
                  ? "2x10 Hips & Valleys"
                  : isBeam
                    ? "GLB 5-1/8 × 12 Beams"
                    : isWall
                      ? "Ext 2x6 Wall"
                      : isOpening
                        ? "Window Headers"
                        : "LVP Flooring"
            }
          />
        </Field>
        <Field label="Type" htmlFor={p("type")} hint={hasMeasurements ? "Locked — this takeoff has measurements" : undefined}>
          <select
            id={p("type")}
            name="type"
            className="input"
            value={type}
            disabled={hasMeasurements}
            onChange={(e) => {
              const t = e.target.value as ConditionType;
              setType(t);
              setMetric(DEFAULT_METRIC[t]);
            }}
          >
            {CONDITION_TYPES.map((t) => (
              <option key={t} value={t}>
                {CONDITION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          {hasMeasurements ? <input type="hidden" name="type" value={type} /> : null}
        </Field>
        <Field label="Color" htmlFor={p("color")}>
          <div className="flex items-center gap-2">
            <input
              id={p("color")}
              name="color"
              type="color"
              defaultValue={values?.color ?? nextColor ?? CONDITION_COLORS[0]}
              className="h-9 w-12 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
            />
            <div className="flex flex-wrap gap-1">
              {CONDITION_COLORS.slice(0, 6).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Use ${c}`}
                  className="h-4 w-4 rounded-full ring-1 ring-slate-300"
                  style={{ background: c }}
                  onClick={(e) => {
                    const input = (e.currentTarget.closest("form") as HTMLFormElement).elements.namedItem("color") as HTMLInputElement;
                    input.value = c;
                  }}
                />
              ))}
            </div>
          </div>
        </Field>
      </FormGrid>
      <p className="-mt-2 text-xs text-slate-500">{TYPE_HINTS[type]}</p>

      {isWall ? <WallOptionsFields idPrefix={p("wall")} values={values} memberSizes={memberSizes} items={itemOptions} /> : null}
      {isOpening ? <OpeningOptionsFields idPrefix={p("open")} values={values} memberSizes={memberSizes} /> : null}
      {isDoor ? <DoorOptionsFields idPrefix={p("door")} values={values} items={itemOptions} /> : null}
      {isWindow ? <WindowOptionsFields idPrefix={p("window")} values={values} items={itemOptions} /> : null}

      <FormGrid className="md:grid-cols-4">
        <Field label="Quantity" htmlFor={p("metric")} hint="What this takeoff reports and sends to the estimate">
          <select id={p("metric")} name="metric" className="input" value={metric} onChange={(e) => setMetric(e.target.value)}>
            {metrics.map((m) => (
              <option key={m} value={m}>
                {metricLabel(m)}
              </option>
            ))}
          </select>
        </Field>
        {showPitch ? (
          <Field label={isHip ? "Pitch, side 1 (rise / 12)" : "Pitch (rise / 12)"} htmlFor={p("pitch")} hint={pitchHint}>
            <input id={p("pitch")} name="pitch" inputMode="decimal" className="input" value={pitchText} onChange={(e) => setPitchText(e.target.value)} />
          </Field>
        ) : null}
        {isHip ? (
          <Field label="Pitch, side 2 (rise / 12)" htmlFor={p("pitch2")} hint="The other roof plane. Blank = same as side 1 · 0 & 0 = ridge">
            <input
              id={p("pitch2")}
              name="pitch2"
              inputMode="decimal"
              step="0.25"
              min="0"
              className="input"
              value={pitch2Text}
              onChange={(e) => setPitch2Text(e.target.value)}
              placeholder={String(pitch)}
            />
          </Field>
        ) : null}
        {type === "LINEAR" ? (
          <Field label="Height (ft)" htmlFor={p("height")} hint="Length × height = wall area">
            <input id={p("height")} name="height" inputMode="decimal" className="input" defaultValue={values?.height || ""} placeholder="8" />
          </Field>
        ) : null}
        {type === "AREA" ? (
          <Field label="Depth (in)" htmlFor={p("depth")} hint="Area × depth = volume (cy)">
            <input id={p("depth")} name="depth" inputMode="decimal" className="input" defaultValue={values?.depth || ""} placeholder="4" />
          </Field>
        ) : null}
        {type === "FRAMING" ? (
          <Field label="Spacing (in o.c.)" htmlFor={p("spacing")}>
            <input id={p("spacing")} name="spacing" inputMode="decimal" className="input" defaultValue={values?.spacing ?? 16} />
          </Field>
        ) : null}
        {isBeam ? (
          <>
            <Field label="Bearing each end (in)" htmlFor={p("bearing")} hint="Added to both ends of every beam (3 = 6 in. longer)">
              <input id={p("bearing")} name="opt_bearingIn" inputMode="decimal" className="input" defaultValue={beam.bearingIn} />
            </Field>
            <Field label="Plies" htmlFor={p("plies")} hint="1 for a glulam; 2 or 3 for built-up LVLs (pieces per beam)">
              <input id={p("plies")} name="opt_plies" type="number" min={1} max={6} step={1} className="input" defaultValue={beam.plies} />
            </Field>
          </>
        ) : null}
        {isMember && !isBeam ? (
          <Field
            label="Overhang (in)"
            htmlFor={p("overhang")}
            hint={isHip ? "Horizontal, out from the wall. Added once per piece at the eave" : "Horizontal, added to each member"}
          >
            <input id={p("overhang")} name="overhang" inputMode="decimal" className="input" defaultValue={values?.overhang || ""} placeholder="0" />
          </Field>
        ) : null}
      </FormGrid>
      {isMember ? (
        <FormGrid className="md:grid-cols-4">
          <Field
            label="Member size"
            htmlFor={p("memberSizeId")}
            hint={size ? SOLD_AS_LABELS[size.soldAs as keyof typeof SOLD_AS_LABELS] : "Sizes are managed in Settings → Member sizes"}
          >
            <select
              id={p("memberSizeId")}
              name="memberSizeId"
              className="input"
              value={sizeId}
              onChange={(e) => {
                const next = memberSizes.find((m) => m.id === e.target.value) ?? null;
                // Take the new size's stock lengths unless you'd typed your own.
                if (!stockText.trim() || stockText === (size?.stockLengths ?? "")) setStockText(next?.stockLengths ?? "");
                setSizeId(e.target.value);
              }}
            >
              <option value="">{values?.memberSize && !values.memberSizeId ? `${values.memberSize} (not in list)` : "—"}</option>
              {(isHip ? memberSizes.filter((m) => /^2x/i.test(m.name.trim())) : memberSizes).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          {size?.soldAs === "STOCK" || !size ? (
            <Field
              label="Stock lengths (ft)"
              htmlFor={p("stockLengths")}
              className="md:col-span-2"
              hint="What you buy. Each member rounds up to the next length; longer members use several pieces. Blank = even lengths from 8'."
            >
              <input
                id={p("stockLengths")}
                name="stockLengths"
                className="input"
                value={stockText}
                onChange={(e) => setStockText(e.target.value)}
                placeholder="8-24  or  12, 14, 16, 20"
              />
            </Field>
          ) : (
            <p className="self-end pb-2 text-xs text-slate-500 md:col-span-2">
              {size.soldAs === "EXACT_LF"
                ? "Made to order: each member is listed at its exact length (to the inch) and priced per lf."
                : "Listed as one lineal-foot total, priced per lf."}
            </p>
          )}
        </FormGrid>
      ) : null}
      {type === "FRAMING" && (size?.soldAs === "STOCK" || !size) ? (
        <PackingFields
          idPrefix={p("pack")}
          mode={pack}
          setMode={setPack}
          lengthText={packLengthText}
          setLengthText={setPackLengthText}
          stockText={stockText}
          wastePct={values?.wastePct ?? 0}
          packing={values?.packing}
        />
      ) : (
        <input type="hidden" name="packMode" value="WASTE" />
      )}

      {isMember || isAuto ? (
        <CodeRuleFields key={type} type={type} costCodes={costCodes} rules={codeRules} categories={Array.from(new Set(itemOptions.map((i) => i.category))).sort()} />
      ) : null}

      {/* Cost code on its own row, then a wide unit cost (room for the price), markup and waste. */}
      <FormGrid className="md:grid-cols-4">
        {isMember || isAuto ? (
          // Each material carries its own cost code (asked above); the takeoff keeps whatever it had.
          <input type="hidden" name="costCodeId" value={values?.costCodeId ?? ""} />
        ) : (
          <Field label="Cost code" htmlFor={p("costCodeId")} className="md:col-span-4">
            <select id={p("costCodeId")} name="costCodeId" className="input" defaultValue={values?.costCodeId ?? ""}>
              <option value="">—</option>
              {costCodes.map((c) => (
                <option key={c.id} value={c.id}>
                  {costCodeLabel(c)}
                </option>
              ))}
            </select>
          </Field>
        )}
        {isMember || isAuto ? (
          <p className="self-end pb-2 text-xs text-slate-500 md:col-span-3">
            {isAuto ? (
              `Materials are added automatically from the ${isWall ? "walls" : isDoor ? "doors" : isWindow ? "windows" : "openings"} and priced from Settings → Item List.`
            ) : (
              <>Lumber is priced per piece from Settings → Item List (e.g. &ldquo;2x6 × 20&apos;&rdquo;), added automatically from the layout.</>
            )}
          </p>
        ) : (
          <>
            <Field label="Unit cost" htmlFor={p("unitCost")} className="md:col-span-2">
              <input id={p("unitCost")} name="unitCost" inputMode="decimal" className="input" defaultValue={values?.unitCost ?? 0} />
            </Field>
            <Field label="Markup %" htmlFor={p("markupPct")}>
              <input id={p("markupPct")} name="markupPct" inputMode="decimal" className="input" defaultValue={values?.markupPct ?? defaultMarkup} />
            </Field>
          </>
        )}
        <Field
          label="Waste %"
          htmlFor={p("wastePct")}
          hint={isMember ? "Extra pieces, rounded up" : isWall ? "Studs, sheets & baseboard" : isOpening ? "King & jack studs" : isDoor || isWindow ? "Trim" : undefined}
        >
          <input
            key={type}
            id={p("wastePct")}
            name="wastePct"
            inputMode="decimal"
            step="0.5"
            min="0"
            className="input"
            defaultValue={values?.wastePct ?? (isWall || isDoor || isWindow ? 10 : 0)}
          />
        </Field>
      </FormGrid>
      <FormGrid className="md:grid-cols-4">
        <Field label="Estimate group" htmlFor={p("group")} hint="Section heading on the estimate">
          <input id={p("group")} name="group" className="input" defaultValue={values?.group ?? "Takeoff"} />
        </Field>
        <label className="flex items-start gap-2 self-end pb-2 text-sm text-slate-700 md:col-span-3">
          <input type="checkbox" name="referenceOnly" defaultChecked={values?.referenceOnly ?? false} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
          <span>
            <span className="font-medium">Reference only</span>
            <span className="block text-xs text-slate-500">
              Measure it for your information (e.g. Heated &amp; cooled, to check the plan) — it stays off the estimate and the Material list.
            </span>
          </span>
        </label>
      </FormGrid>
      {!values && assemblyItems ? <PendingItems type={type} metric={metric} costCodes={costCodes} items={assemblyItems} defaultMarkup={defaultMarkup} /> : null}
      <div className="flex items-center gap-2">
        <SubmitButton>{values ? "Save takeoff" : "Add takeoff"}</SubmitButton>
        {cancelHref ? (
          <Link href={cancelHref} className={buttonClasses("ghost")}>
            Cancel
          </Link>
        ) : null}
      </div>
    </form>
  );
}

/** "1 × 18', 4 × 32'" */
function boardsText(list: [number, number][]) {
  return list.map(([len, n]) => `${n} × ${num(len)}'`).join(", ");
}

/**
 * Joists/rafters: how the cuts are packed into boards — least waste, cheapest, or one
 * length — with the three side by side (for the drawing as it is, waste included).
 */
function PackingFields({
  idPrefix,
  mode,
  setMode,
  lengthText,
  setLengthText,
  stockText,
  wastePct,
  packing,
}: {
  idPrefix: string;
  mode: PackMode;
  setMode: (m: PackMode) => void;
  lengthText: string;
  setLengthText: (t: string) => void;
  stockText: string;
  wastePct: number;
  packing?: { cuts: number[]; prices: LengthPrices | null };
}) {
  const length = Number(lengthText) > 0 ? Number(lengthText) : null;
  const stock = parseStockLengths(stockText);
  const rows: PackRow[] = packing?.cuts.length
    ? PACK_MODES.map((m): PackRow => {
        if (m === "LENGTH" && !length) return { mode: m, empty: "Enter a board length" };
        const r = packBoards(packing.cuts, stock, { mode: m, length, prices: packing.prices });
        if (m === "CHEAPEST" && r.noPrices) return { mode: m, empty: "No prices yet for this size — price a length in the Item List" };
        const waste = wasteBoards(r.cutList, wastePct);
        const order = withWasteBoards(r.cutList, waste);
        const cost = listCost(order, packing.prices);
        return {
          mode: m,
          boards: boardsText(r.cutList),
          waste: waste ? `+ ${waste.count} × ${num(waste.length)}' waste` : null,
          feet: order.reduce((sum, [len, n]) => sum + len * n, 0),
          cost: cost.cost,
          estimated: cost.estimated,
        };
      })
    : [];
  const cheapestCost = Math.min(...rows.map((r) => ("cost" in r && r.cost != null ? r.cost : Infinity)));
  const leastFeet = Math.min(...rows.map((r) => ("feet" in r ? r.feet : Infinity)));

  return (
    <div className="space-y-2">
      <FormGrid className="md:grid-cols-4">
        <Field label="Packing" htmlFor={`${idPrefix}-mode`} hint="How cuts are combined into the boards you order">
          <select id={`${idPrefix}-mode`} name="packMode" className="input" value={mode} onChange={(e) => setMode(e.target.value as PackMode)}>
            {PACK_MODES.map((m) => (
              <option key={m} value={m}>
                {PACK_MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
        {mode === "LENGTH" ? (
          <Field label="Board length (ft)" htmlFor={`${idPrefix}-length`} hint="Every board this length; a longer piece gets its own board">
            <input
              id={`${idPrefix}-length`}
              name="packLength"
              inputMode="decimal"
              className="input"
              value={lengthText}
              onChange={(e) => setLengthText(e.target.value)}
              placeholder="16"
              required
            />
          </Field>
        ) : null}
        <p className="self-end pb-2 text-xs text-slate-500 md:col-span-2">
          {mode === "WASTE"
            ? "Orders the fewest feet of lumber."
            : mode === "CHEAPEST"
              ? "Orders what costs least, from your prices for each length. Unpriced lengths are estimated from the nearest priced one's price per foot."
              : "Every board is the length you enter."}
        </p>
      </FormGrid>
      {rows.length ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-1.5 font-medium">Packing (this drawing{wastePct > 0 ? `, ${num(wastePct, 1)}% waste` : ""})</th>
                <th className="px-3 py-1.5 font-medium">Boards</th>
                <th className="px-3 py-1.5 text-right font-medium">Feet</th>
                <th className="px-3 py-1.5 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr
                  key={r.mode}
                  className={cn("cursor-pointer align-top hover:bg-slate-50", r.mode === mode && "bg-blue-50/60 hover:bg-blue-50")}
                  onClick={() => setMode(r.mode)}
                  title={`Use ${PACK_MODE_LABELS[r.mode]}`}
                >
                  <td className="whitespace-nowrap px-3 py-1.5 font-medium text-slate-900">
                    <span className={cn("mr-1.5 inline-block h-2 w-2 rounded-full", r.mode === mode ? "bg-blue-700" : "bg-slate-300")} />
                    {PACK_MODE_LABELS[r.mode]}
                    {r.mode === "LENGTH" && length ? ` (${num(length)}')` : ""}
                  </td>
                  {"empty" in r ? (
                    <td colSpan={3} className="px-3 py-1.5 text-slate-400">
                      {r.empty}
                    </td>
                  ) : (
                    <>
                      <td className="px-3 py-1.5 text-slate-700">
                        {r.boards}
                        {r.waste ? <span className="block text-slate-500">{r.waste}</span> : null}
                        {/* Estimated prices only pick the boards — the estimate uses real ones, so unpriced lengths show there at $0. */}
                        {r.mode === "CHEAPEST" && r.estimated.length ? (
                          <span className="mt-0.5 block text-amber-700">
                            Uses {r.estimated.map((l) => `${num(l)}'`).join(", ")} boards you haven&apos;t priced — the estimate shows them at $0 until you do.
                          </span>
                        ) : null}
                      </td>
                      <td className={cn("px-3 py-1.5 text-right tabular-nums", r.feet <= leastFeet + 1e-9 && "font-semibold text-emerald-700")}>{num(r.feet)} lf</td>
                      <td className={cn("px-3 py-1.5 text-right tabular-nums", r.cost != null && r.cost <= cheapestCost + 1e-9 && "font-semibold text-emerald-700")}>
                        {r.cost == null ? "—" : money(r.cost)}
                        {r.estimated.length ? (
                          <span className="block text-[11px] font-normal text-amber-700">{r.estimated.map((l) => `${num(l)}'`).join(", ")} estimated</span>
                        ) : null}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">
            Click a row to use it. Stock length and board length changes show here right away; waste uses the saved Waste %. Save to apply.
          </p>
        </div>
      ) : null}
    </div>
  );
}

type PackRow = { mode: PackMode; empty: string } | { mode: PackMode; boards: string; waste: string | null; feet: number; cost: number | null; estimated: number[] };
