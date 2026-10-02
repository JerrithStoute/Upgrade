"use client";

import { useState } from "react";
import Link from "next/link";
import { Field, FormGrid, SubmitButton, buttonClasses } from "@/components/ui";
import { costCodeLabel } from "@/lib/utils";
import {
  CONDITION_COLORS,
  CONDITION_TYPES,
  CONDITION_TYPE_LABELS,
  DEFAULT_METRIC,
  SOLD_AS_LABELS,
  METRICS_BY_TYPE,
  hipFactor,
  metricLabel,
  slopeFactor,
  type ConditionType,
} from "@/lib/takeoff";
import { OpeningOptionsFields, WallOptionsFields, type ItemChoice } from "./wall-options";

export type ConditionFormValues = {
  id: string;
  name: string;
  type: string;
  metric: string;
  color: string;
  group: string;
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
};

export type MemberSizeOption = { id: string; name: string; kind: string; soldAs: string; stockLengths: string | null };

const TYPE_HINTS: Record<ConditionType, string> = {
  AREA: "Click the corners of a shape. Flooring, drywall, slabs, roofing, siding.",
  LINEAR: "Click along a line. Walls, trim, gutters, rakes, hips and valleys.",
  COUNT: "Click once per item. Outlets, fixtures, doors, windows.",
  FRAMING: "Outline the framed area; joists or rafters are laid out at your spacing.",
  HIP_VALLEY: "Trace each hip, valley or ridge on the roof plan, wall corner to ridge. Every line is one piece of lumber.",
  WALL: "Trace walls corner to corner; double-click to finish a run, or end on the first corner to close it. Name the condition for the wall (\"Ext 2x6 Wall\").",
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
}) {
  const [type, setType] = useState<ConditionType>((values?.type as ConditionType) ?? "AREA");
  const [metric, setMetric] = useState(values?.metric ?? DEFAULT_METRIC[type]);
  const [pitchText, setPitchText] = useState(String(values?.pitch ?? 0));
  const pitch = Math.max(0, Number(pitchText) || 0);
  const [pitch2Text, setPitch2Text] = useState(values?.pitch2 == null ? "" : String(values.pitch2));
  const pitch2 = pitch2Text.trim() === "" ? pitch : Math.max(0, Number(pitch2Text) || 0);
  const [sizeId, setSizeId] = useState(values?.memberSizeId ?? "");
  const [stockText, setStockText] = useState(values?.stockLengths ?? "");
  const size = memberSizes.find((m) => m.id === sizeId) ?? null;
  const metrics = METRICS_BY_TYPE[type];
  const p = (k: string) => `cond-${values?.id ?? "new"}-${k}`;
  const isWall = type === "WALL";
  const isOpening = type === "OPENING";
  const isAuto = isWall || isOpening;
  const showPitch = type !== "COUNT" && !isAuto;
  const isHip = type === "HIP_VALLEY";
  const isMember = type === "FRAMING" || isHip;
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
          <input id={p("name")} name="name" required className="input" defaultValue={values?.name} placeholder={type === "FRAMING" ? "2x10 Floor Joists @ 16\" o.c." : isHip ? "2x10 Hips & Valleys" : isWall ? "Ext 2x6 Wall" : isOpening ? "Window Headers" : "LVP Flooring"} />
        </Field>
        <Field label="Type" htmlFor={p("type")} hint={hasMeasurements ? "Locked — this condition has measurements" : undefined}>
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

      <FormGrid className="md:grid-cols-4">
        <Field label="Quantity" htmlFor={p("metric")} hint="What this condition reports and sends to the estimate">
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
            <input id={p("pitch")} name="pitch" type="number" step="0.25" min="0" className="input" value={pitchText} onChange={(e) => setPitchText(e.target.value)} />
          </Field>
        ) : null}
        {isHip ? (
          <Field label="Pitch, side 2 (rise / 12)" htmlFor={p("pitch2")} hint="The other roof plane. Blank = same as side 1 · 0 & 0 = ridge">
            <input id={p("pitch2")} name="pitch2" type="number" step="0.25" min="0" className="input" value={pitch2Text} onChange={(e) => setPitch2Text(e.target.value)} placeholder={String(pitch)} />
          </Field>
        ) : null}
        {type === "LINEAR" ? (
          <Field label="Height (ft)" htmlFor={p("height")} hint="Length × height = wall area">
            <input id={p("height")} name="height" type="number" step="0.01" min="0" className="input" defaultValue={values?.height || ""} placeholder="8" />
          </Field>
        ) : null}
        {type === "AREA" ? (
          <Field label="Depth (in)" htmlFor={p("depth")} hint="Area × depth = volume (cy)">
            <input id={p("depth")} name="depth" type="number" step="0.25" min="0" className="input" defaultValue={values?.depth || ""} placeholder="4" />
          </Field>
        ) : null}
        {type === "FRAMING" ? (
          <Field label="Spacing (in o.c.)" htmlFor={p("spacing")}>
            <input id={p("spacing")} name="spacing" type="number" step="0.5" min="1" className="input" defaultValue={values?.spacing ?? 16} />
          </Field>
        ) : null}
        {isMember ? (
          <Field
            label="Overhang (in)"
            htmlFor={p("overhang")}
            hint={isHip ? "Horizontal, out from the wall. Added once per piece at the eave" : "Horizontal, added to each member"}
          >
            <input id={p("overhang")} name="overhang" type="number" step="0.5" min="0" className="input" defaultValue={values?.overhang || ""} placeholder="0" />
          </Field>
        ) : null}
      </FormGrid>
      {isMember ? (
        <FormGrid className="md:grid-cols-4">
          <Field label="Member size" htmlFor={p("memberSizeId")} hint={size ? SOLD_AS_LABELS[size.soldAs as keyof typeof SOLD_AS_LABELS] : "Sizes are managed in Settings → Member sizes"}>
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
            <Field label="Stock lengths (ft)" htmlFor={p("stockLengths")} className="md:col-span-2" hint="What you buy. Each member rounds up to the next length; longer members use several pieces. Blank = even lengths from 8'.">
              <input id={p("stockLengths")} name="stockLengths" className="input" value={stockText} onChange={(e) => setStockText(e.target.value)} placeholder="8-24  or  12, 14, 16, 20" />
            </Field>
          ) : (
            <p className="self-end pb-2 text-xs text-slate-500 md:col-span-2">
              {size.soldAs === "EXACT_LF" ? "Made to order: each member is listed at its exact length (to the inch) and priced per lf." : "Listed as one lineal-foot total, priced per lf."}
            </p>
          )}
        </FormGrid>
      ) : null}

      <FormGrid className="md:grid-cols-5">
        <Field label="Cost code" htmlFor={p("costCodeId")} className="md:col-span-2">
          <select id={p("costCodeId")} name="costCodeId" className="input" defaultValue={values?.costCodeId ?? ""}>
            <option value="">—</option>
            {costCodes.map((c) => (
              <option key={c.id} value={c.id}>
                {costCodeLabel(c)}
              </option>
            ))}
          </select>
        </Field>
        {isMember || isAuto ? (
          <p className="self-end pb-2 text-xs text-slate-500 md:col-span-2">
            {isAuto
              ? `Materials are added automatically from the ${isWall ? "walls" : "openings"} and priced from Settings → Item List.`
              : <>Lumber is priced per piece from Settings → Item List (e.g. &ldquo;2x6 × 20&apos;&rdquo;), added automatically from the layout.</>}
          </p>
        ) : (
          <>
            <Field label="Unit cost" htmlFor={p("unitCost")}>
              <input id={p("unitCost")} name="unitCost" type="number" step="0.01" min="0" className="input" defaultValue={values?.unitCost ?? 0} />
            </Field>
            <Field label="Markup %" htmlFor={p("markupPct")}>
              <input id={p("markupPct")} name="markupPct" type="number" step="0.1" className="input" defaultValue={values?.markupPct ?? defaultMarkup} />
            </Field>
          </>
        )}
        <Field label="Waste %" htmlFor={p("wastePct")} hint={isMember ? "Extra pieces, rounded up" : isWall ? "Studs, sheets & baseboard" : isOpening ? "King & jack studs" : undefined}>
          <input key={type} id={p("wastePct")} name="wastePct" type="number" step="0.5" min="0" className="input" defaultValue={values?.wastePct ?? (isWall ? 10 : 0)} />
        </Field>
      </FormGrid>
      <FormGrid className="md:grid-cols-4">
        <Field label="Estimate group" htmlFor={p("group")} hint="Section heading on the estimate">
          <input id={p("group")} name="group" className="input" defaultValue={values?.group ?? "Takeoff"} />
        </Field>
      </FormGrid>
      <div className="flex items-center gap-2">
        <SubmitButton>{values ? "Save condition" : "Add condition"}</SubmitButton>
        {cancelHref ? (
          <Link href={cancelHref} className={buttonClasses("ghost")}>
            Cancel
          </Link>
        ) : null}
      </div>
    </form>
  );
}
