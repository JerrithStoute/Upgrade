"use client";

import { useRef, useState } from "react";
import Link from "@/components/link";
import { BookMarked, ChevronDown } from "lucide-react";
import { SubmitButton, buttonClasses } from "@/components/ui";
import { cn, money, num } from "@/lib/utils";
import {
  CONDITION_COLORS,
  CONDITION_TYPES,
  CONDITION_TYPE_LABELS,
  DEFAULT_METRIC,
  METRICS_BY_TYPE,
  hipFactor,
  beamOptions,
  framingOptions,
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
import { NewMemberSize } from "./new-member-size";
import { PendingItems } from "./pending-items";
import { Line, SMALL_BOXES, Section } from "./mini";
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
  /** Joists/rafters: the span table that sizes each area (null = one size for all). */
  spanTableId?: string | null;
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
  memberSizes: sizeList,
  itemOptions = [],
  values,
  hasMeasurements,
  cancelHref,
  onCancel,
  nextColor,
  codeRules = {},
  assemblyItems,
  toolbox,
  spanTables = [],
  title,
  headExtra,
  initialType,
}: {
  action: (fd: FormData) => Promise<void>;
  /** Hidden fields identifying where the condition lives (projectId, or templateId). */
  hidden: Record<string, string>;
  costCodes: { id: string; code: string | null; name: string }[];
  memberSizes: MemberSizeOption[];
  /** Item List items, offered for sheathing, drywall and baseboard. */
  itemOptions?: ItemChoice[];
  values?: ConditionFormValues;
  hasMeasurements?: boolean;
  cancelHref?: string;
  /** Cancel runs this instead of following cancelHref. */
  onCancel?: () => void;
  nextColor?: string;
  /** Remembered "same cost code for all windows / lumber / …" answers. */
  codeRules?: CodeRules;
  /** New takeoffs: Item List entries for adding assembly items before the first save. */
  assemblyItems?: ItemOption[];
  /** Admins: your takeoff templates, for "Add / Save + save to Library". */
  toolbox?: { id: string; name: string }[];
  /** Catalog → Span tables, for "Size by span table" on joists / rafters. */
  spanTables?: { id: string; name: string; use: string }[];
  /** In the plan's side panel: its heading, in a bar that stays at the top as you scroll. */
  title?: string;
  /** More buttons beside the Save at the bottom (Make a copy). */
  headExtra?: React.ReactNode;
  /** A new takeoff: the type picked from New takeoff ▾. */
  initialType?: ConditionType;
}) {
  const [type, setType] = useState<ConditionType>((values?.type as ConditionType) ?? initialType ?? "AREA");
  const [metric, setMetric] = useState(values?.metric ?? DEFAULT_METRIC[type]);
  const [pitchText, setPitchText] = useState(String(values?.pitch ?? 0));
  const pitch = Math.max(0, Number(pitchText) || 0);
  const [pitch2Text, setPitch2Text] = useState(values?.pitch2 == null ? "" : String(values.pitch2));
  const pitch2 = pitch2Text.trim() === "" ? pitch : Math.max(0, Number(pitch2Text) || 0);
  const [sizeId, setSizeId] = useState(values?.memberSizeId ?? "");
  // Sizes added here with "+ New size…" (the list from the page doesn't have them until it reloads).
  const [added, setAdded] = useState<MemberSizeOption[]>([]);
  const memberSizes = [...sizeList, ...added.filter((a) => !sizeList.some((m) => m.id === a.id))];
  const [newSize, setNewSize] = useState(false);
  const [spanTableId, setSpanTableId] = useState(values?.spanTableId ?? "");
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
  const framing = framingOptions(values?.options);
  const factor = isHip ? hipFactor(pitch, pitch2) : slopeFactor(pitch);
  const pitchHint = isHip
    ? pitch > 0 && pitch2 > 0
      ? `${pitch}/12 & ${pitch2}/12 → plan × ${factor.toFixed(3)}`
      : "0 on either side = level (ridges)"
    : pitch > 0
      ? `${pitch}/12 → plan × ${factor.toFixed(3)}`
      : "0 = flat";

  // What the takeoff reports and sends to the estimate.
  const report =
    metrics.length > 1 ? (
      <select id={p("metric")} name="metric" aria-label="Report" title="What this takeoff reports and sends to the estimate" className="input !w-auto" value={metric} onChange={(e) => setMetric(e.target.value)}>
        {metrics.map((m) => (
          <option key={m} value={m}>
            {metricLabel(m)}
          </option>
        ))}
      </select>
    ) : null;
  const metricHidden = metrics.length > 1 ? null : <input type="hidden" name="metric" value={metric} />;
  const pitchBox = showPitch ? (
    <input id={p("pitch")} name="pitch" inputMode="decimal" aria-label={isHip ? "Pitch, side 1" : "Pitch"} title={pitchHint} className="input !w-11" value={pitchText} onChange={(e) => setPitchText(e.target.value)} />
  ) : null;
  const sizeBox = isMember ? (
    <select
      id={p("memberSizeId")}
      name="memberSizeId"
      aria-label={type === "FRAMING" && spanTableId ? "This takeoff's size" : "Size"}
      title={type === "FRAMING" && spanTableId ? "Leave blank: you draw with this takeoff, and each area goes to a takeoff of its size (made for you)" : "Sizes are managed in Catalog → Member sizes"}
      className="input !w-auto"
      value={sizeId}
      onChange={(e) => {
        if (e.target.value === "__new") return setNewSize(true);
        const next = memberSizes.find((m) => m.id === e.target.value) ?? null;
        // Take the new size's stock lengths unless you'd typed your own.
        if (!stockText.trim() || stockText === (size?.stockLengths ?? "")) setStockText(next?.stockLengths ?? "");
        setSizeId(e.target.value);
      }}
    >
      <option value="">{values?.memberSize && !values.memberSizeId ? `${values.memberSize} (not in list)` : "Size —"}</option>
      {(isHip ? memberSizes.filter((m) => /^2x/i.test(m.name.trim())) : memberSizes).map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
      {isHip ? null : <option value="__new">+ New size…</option>}
    </select>
  ) : null;
  const pickSize = (m: MemberSizeOption) => {
    setAdded((a) => (a.some((x) => x.id === m.id) ? a : [...a, m]));
    if (!stockText.trim() || stockText === (size?.stockLengths ?? "")) setStockText(m.stockLengths ?? "");
    setSizeId(m.id);
    setNewSize(false);
  };
  const newSizeBox = newSize && isMember && !isHip ? <NewMemberSize sizes={memberSizes} onAdded={pickSize} onCancel={() => setNewSize(false)} /> : null;
  const wasteBox = (
    <input
      key={type}
      id={p("wastePct")}
      name="wastePct"
      inputMode="decimal"
      aria-label={isMember ? "Extra boards %" : "Waste %"}
      title={isMember ? "Whole extra boards, of the length you order most" : undefined}
      className="input !w-11"
      defaultValue={values?.wastePct ?? (isWall || isDoor || isWindow ? 10 : 0)}
    />
  );
  const submitText = values ? "Save" : "Add takeoff";

  return (
    <form action={action} className={SMALL_BOXES}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {values ? <input type="hidden" name="id" value={values.id} /> : null}
      {metricHidden}

      {/* Cancel and Add / Save at the top. Add / Save comes first in the page, so Enter in a box does that. */}
      <div className={cn("flex flex-wrap items-center gap-2", title ? "sticky top-0 z-10 -mx-4 border-b border-slate-200 bg-white px-4 py-2" : "pb-1")}>
        {title ? (
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900" title={title}>
            {title}
          </p>
        ) : (
          <span className="flex-1" />
        )}
        <SubmitButton size="xs" className="order-last" pendingText={values ? "Saving…" : "Adding…"}>
          {submitText}
        </SubmitButton>
        {onCancel ? (
          <button type="button" onClick={onCancel} className={buttonClasses("secondary", "xs")}>
            Cancel
          </button>
        ) : cancelHref ? (
          <Link href={cancelHref} scroll={false} className={buttonClasses("secondary", "xs")}>
            Cancel
          </Link>
        ) : null}
        {toolbox ? <LibraryButton templates={toolbox} label="+ Library" /> : null}
      </div>

      <div className="flex items-center gap-1.5 py-2.5">
        <input
          id={p("color")}
          name="color"
          type="color"
          aria-label="Color"
          title="Its color on the plan"
          defaultValue={values?.color ?? nextColor ?? CONDITION_COLORS[0]}
          className="h-7 w-7 shrink-0 cursor-pointer rounded border border-slate-300 bg-white p-0.5 pointer-coarse:h-9 pointer-coarse:w-9"
        />
        <input type="hidden" name="type" value={type} />
        {hasMeasurements ? (
          <span className="shrink-0 text-xs text-slate-500" title="Locked — this takeoff has measurements">
            {CONDITION_TYPE_LABELS[type]}
          </span>
        ) : (
          // The type: set by New takeoff ▾, changeable until the takeoff has measurements.
          <select
            aria-label="Type"
            title={TYPE_HINTS[type]}
            className="input !w-auto shrink-0"
            value={type}
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
        )}
        <input
          id={p("name")}
          name="name"
          required
          autoFocus={!values}
          aria-label="Name"
          className="input min-w-0 flex-1"
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
                      : isDoor
                        ? "Interior Doors"
                        : isWindow
                          ? "Windows"
                          : type === "LINEAR"
                            ? "Gutters"
                            : type === "COUNT"
                              ? "Outlets"
                              : "LVP Flooring"
          }
        />
      </div>

      {isWall ? <WallOptionsFields idPrefix={p("wall")} values={values} memberSizes={memberSizes} items={itemOptions} /> : null}
      {isOpening ? <OpeningOptionsFields idPrefix={p("open")} values={values} memberSizes={memberSizes} /> : null}
      {isDoor ? <DoorOptionsFields idPrefix={p("door")} values={values} items={itemOptions} /> : null}
      {isWindow ? <WindowOptionsFields idPrefix={p("window")} values={values} items={itemOptions} /> : null}
      {isAuto ? (
        <Section title="Waste">
          <Line>
            {wasteBox}
            <span title={isWall ? "On studs, sheathing, drywall and base" : isOpening ? "On king and jack studs" : "On the casing and trim"}>%</span>
            {report ? (
              <>
                <span>· report</span>
                {report}
              </>
            ) : null}
          </Line>
        </Section>
      ) : null}

      {type === "AREA" || type === "LINEAR" || type === "COUNT" ? (
        <Section title="Measures">
          <Line>
            {type === "COUNT" ? <span>Counts each click (ea)</span> : null}
            {report ? (
              <>
                <span>Report</span>
                {report}
              </>
            ) : null}
            {pitchBox ? (
              <>
                · pitch {pitchBox} /12 <span className="text-slate-400">({pitchHint})</span>
              </>
            ) : null}
          </Line>
          {type === "LINEAR" ? (
            <Line>
              <input id={p("height")} name="height" inputMode="decimal" aria-label="Height (ft)" title="Length × height = wall area" className="input !w-11" defaultValue={values?.height || ""} placeholder="8" />
              ft high (for wall area)
            </Line>
          ) : null}
          {type === "AREA" ? (
            <Line>
              <input id={p("depth")} name="depth" inputMode="decimal" aria-label="Depth (in)" title="Area × depth = volume (cy)" className="input !w-11" defaultValue={values?.depth || ""} placeholder="4" />
              in deep (for volume)
            </Line>
          ) : null}
        </Section>
      ) : null}

      {type === "FRAMING" ? (
        <Section title="Layout">
          <Line>
            <select
              id={p("spanTableId")}
              name="spanTableId"
              aria-label="Sized by"
              title={spanTables.length ? "One size for all, or let a span table pick the size for each area" : "Make a span table in Catalog → Span tables to have sizes picked for you"}
              className="input !w-auto"
              value={spanTableId}
              onChange={(e) => setSpanTableId(e.target.value)}
            >
              <option value="">One size</option>
              {spanTables.map((t) => (
                <option key={t.id} value={t.id}>
                  Span table: {t.name}
                </option>
              ))}
            </select>
            {sizeBox}@
            <input id={p("spacing")} name="spacing" inputMode="decimal" aria-label="Spacing (in o.c.)" className="input !w-11" defaultValue={values?.spacing ?? 16} />
            in o.c.
          </Line>
          {newSizeBox}
          {spanTableId ? <Line>Each area gets the size its span calls for, in that size&apos;s takeoff (made for you).</Line> : null}
          <Line>
            Pitch {pitchBox} /12 ·
            <input id={p("overhang")} name="overhang" inputMode="decimal" aria-label="Overhang (in)" title="Horizontal, added to each member" className="input !w-11" defaultValue={values?.overhang || ""} placeholder="0" />
            in overhang ·
            <input
              id={p("lap")}
              name="opt_lapIn"
              inputMode="decimal"
              aria-label="Lap over walls (in)"
              title="Where a wall or beam you've traced holds a joist up partway, it's two pieces lapped over it by this much (IRC: at least 3)"
              className="input !w-11"
              defaultValue={framing.lapIn}
            />
            in lap
          </Line>
        </Section>
      ) : null}
      {isHip ? (
        <Section title="Layout">
          <Line>
            {sizeBox}· pitch {pitchBox} &amp;
            <input
              id={p("pitch2")}
              name="pitch2"
              inputMode="decimal"
              aria-label="Pitch, side 2"
              title="The other roof plane. Blank = same as side 1 · 0 & 0 = ridge"
              className="input !w-11"
              value={pitch2Text}
              onChange={(e) => setPitch2Text(e.target.value)}
              placeholder={String(pitch)}
            />
            /12
          </Line>
          <Line>
            <input id={p("overhang")} name="overhang" inputMode="decimal" aria-label="Overhang (in)" title="Horizontal, out from the wall. Added once per piece at the eave" className="input !w-11" defaultValue={values?.overhang || ""} placeholder="0" />
            in overhang <span className="text-slate-400">({pitchHint})</span>
          </Line>
        </Section>
      ) : null}
      {isBeam ? (
        <Section title="Beam">
          <Line>
            {sizeBox}×
            <input id={p("plies")} name="opt_plies" type="number" min={1} max={6} step={1} aria-label="Plies" title="1 for a glulam; 2 or 3 for built-up LVLs" className="input !w-11" defaultValue={beam.plies} />
            plies
          </Line>
          {newSizeBox}
          <Line>
            <input id={p("bearing")} name="opt_bearingIn" inputMode="decimal" aria-label="Bearing each end (in)" title="Added to both ends of every beam (3 = 6 in. longer)" className="input !w-11" defaultValue={beam.bearingIn} />
            in. bearing each end
          </Line>
        </Section>
      ) : null}
      {isMember ? (
        <Section title="Boards">
          <Line>
            {size?.soldAs === "STOCK" || !size ? (
              <>
                <input
                  id={p("stockLengths")}
                  name="stockLengths"
                  aria-label="Stock lengths (ft)"
                  title="What you buy. Each member rounds up to the next length; longer members use several pieces. Blank = even lengths from 8'."
                  className="input !w-20"
                  value={stockText}
                  onChange={(e) => setStockText(e.target.value)}
                  placeholder="8-24"
                />
                ft stock ·
              </>
            ) : (
              <span>{size.soldAs === "EXACT_LF" ? "Made to order, priced per lf ·" : "One lf total, priced per lf ·"}</span>
            )}
            {wasteBox}
            <span>% extra boards</span>
            {report ? (
              <>
                <span>· report</span>
                {report}
              </>
            ) : null}
          </Line>
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
          ) : null}
        </Section>
      ) : null}
      {type === "FRAMING" && (size?.soldAs === "STOCK" || !size) ? null : <input type="hidden" name="packMode" value="WASTE" />}

      {isMember || isAuto ? (
        <CodeRuleFields key={type} type={type} costCodes={costCodes} rules={codeRules} />
      ) : (
        <input type="hidden" name="wastePct" value={values?.wastePct ?? 0} />
      )}

      {/* A takeoff is priced by its items only; these older settings are kept as they were, unused. */}
      <input type="hidden" name="costCodeId" value={values?.costCodeId ?? ""} />
      <input type="hidden" name="unitCost" value={values?.unitCost ?? 0} />
      <input type="hidden" name="group" value={values?.group ?? "Takeoff"} />

      {!values && assemblyItems ? (
        <PendingItems
          type={type}
          metric={metric}
          costCodes={costCodes}
          items={assemblyItems}
          title={isMember || isAuto ? "Add-ons" : "Orders"}
          empty={isMember || isAuto ? "None — hangers, ties, blocking…" : "Nothing yet — what this takeoff orders"}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
        <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-slate-700" title="Measured for your information — not on the estimate or Material list">
          <input type="checkbox" name="referenceOnly" defaultChecked={values?.referenceOnly ?? false} className="h-4 w-4 shrink-0 rounded border-slate-300" />
          Reference only
        </label>
        {headExtra}
        <SubmitButton size="xs" pendingText={values ? "Saving…" : "Adding…"}>
          {submitText}
        </SubmitButton>
      </div>
    </form>
  );
}

/**
 * Admins: "Add / Save + save to Library" — the takeoff, settings and items, into one of
 * your takeoff templates too (one there by this name is updated), so any job can pull it.
 * One template: straight in. More (or none): pick one, or name a new one.
 */
function LibraryButton({ templates, label }: { templates: { id: string; name: string }[]; label: string }) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const saveNew = useRef<HTMLButtonElement>(null);
  if (templates.length === 1)
    return (
      <SubmitButton name="toTemplate" value={templates[0].id} variant="secondary" size="xs" pendingText="Saving…" title={`Also into your "${templates[0].name}" template, items and all`}>
        <BookMarked className="h-3.5 w-3.5" /> {label}
      </SubmitButton>
    );
  return (
    <div className="relative">
      <button type="button" aria-expanded={open} className={buttonClasses("secondary", "xs")} onClick={() => setOpen((o) => !o)}>
        <BookMarked className="h-3.5 w-3.5" /> {label} <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-1 text-xs shadow-xl">
          <p className="px-2 py-1 text-slate-500">Into which template?</p>
          {templates.map((t) => (
            <button key={t.id} type="submit" name="toTemplate" value={t.id} className="block w-full truncate rounded px-2 py-1.5 text-left text-slate-800 hover:bg-blue-50">
              {t.name}
            </button>
          ))}
          <div className="mt-1 flex items-center gap-1 border-t border-slate-100 px-1 pt-1.5 pb-0.5">
            <input
              name="newTemplate"
              aria-label="New template name"
              placeholder="Or a new template"
              className="input min-w-0 flex-1"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (newName.trim()) saveNew.current?.click();
                }
              }}
            />
            <button ref={saveNew} type="submit" name="toTemplate" value="new" disabled={!newName.trim()} className={buttonClasses("secondary", "xs")}>
              Save
            </button>
          </div>
        </div>
      ) : null}
    </div>
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
    <div className="space-y-1.5">
      <Line>
        Packing
        <select id={`${idPrefix}-mode`} name="packMode" aria-label="Packing" title="How cuts are combined into the boards you order" className="input !w-auto" value={mode} onChange={(e) => setMode(e.target.value as PackMode)}>
            {PACK_MODES.map((m) => (
              <option key={m} value={m}>
                {PACK_MODE_LABELS[m]}
              </option>
            ))}
          </select>
        {mode === "LENGTH" ? (
          <>
            <input
              id={`${idPrefix}-length`}
              name="packLength"
              inputMode="decimal"
              aria-label="Board length (ft)"
              title="Every board this length; a longer piece gets its own board"
              className="input !w-11"
              value={lengthText}
              onChange={(e) => setLengthText(e.target.value)}
              placeholder="16"
              required
            />
            ft boards
          </>
        ) : null}
        <span className="min-w-0 flex-1 basis-full" title={mode === "CHEAPEST" ? "Unpriced lengths are estimated from the nearest priced one's price per foot. A joist that crosses a wall is one long board over it when that costs less than two pieces broken on the wall — only when every board involved has its own price." : undefined}>
          {mode === "WASTE"
            ? "Orders the fewest feet of lumber."
            : mode === "CHEAPEST"
              ? "Orders what costs least, from your prices for each length."
              : "Every board is the length you enter."}
        </span>
      </Line>
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
