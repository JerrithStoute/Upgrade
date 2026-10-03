"use client";

import { useState } from "react";
import { Field } from "@/components/ui";
import { cn } from "@/lib/utils";
import { itemKind, type ItemKind } from "@/lib/code-groups";
import {
  DEFAULT_DOOR_OPTIONS,
  DEFAULT_WINDOW_OPTIONS,
  WINDOW_STOOL_ITEM,
  windowSummary,
  type WindowOptions,
  DEFAULT_OPENING_OPTIONS,
  doorSummary,
  type DoorOptions,
  DEFAULT_WALL_OPTIONS,
  SHEET_SIZES,
  STUD_PRECUTS_IN,
  STUD_STOCK_FT,
  compareMaterialNames,
  defaultStudLength,
  inchesText,
  itemNameKey,
  openingSummary,
  parseOptions,
  sheetSizeInName,
  wallSummary,
  withSheetSize,
  type OpeningOptions,
  type WallOptions,
} from "@/lib/takeoff";
import type { MemberSizeOption } from "./condition-form";

/** None / 1 side / Both sides as three buttons, posted as `name`. */
function Sides({ name, value, onChange, label }: { name: string; value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div>
      <input type="hidden" name={name} value={value} />
      <div role="radiogroup" aria-label={label} className="inline-flex overflow-hidden rounded-md border border-slate-300">
        {[
          [0, "None"],
          [1, "1 side"],
          [2, "Both sides"],
        ].map(([n, text]) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(n as number)}
            className={cn("px-3 py-1.5 text-xs font-medium", value === n ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50")}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Section({ title, children, hint }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-slate-200 bg-white p-3">
      <legend className="px-1 text-sm font-semibold text-slate-900">{title}</legend>
      {hint ? <p className="mb-2 text-xs text-slate-500">{hint}</p> : null}
      <div className="flex flex-wrap items-end gap-3">{children}</div>
    </fieldset>
  );
}

export type ItemChoice = { name: string; category: string; kind?: string | null; lengthFt?: number | null };

const NEW_ITEM = "__new__";

/**
 * Pick one of the Item List items of a `kind` (e.g. sheathing — whatever category
 * you file them under), or type a new one — saving the condition adds it to the
 * Item List as that kind, so it's in this list from then on. Posts `name`.
 */
function ItemPicker({
  id,
  name,
  value,
  onChange,
  items,
  kind,
  placeholder,
  disabled,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  items: ItemChoice[];
  kind: ItemKind;
  placeholder: string;
  disabled?: boolean;
}) {
  const list = items.filter((i) => itemKind(i) === kind).sort((a, b) => compareMaterialNames(a.name, b.name));
  const inList = list.find((i) => itemNameKey(i.name) === itemNameKey(value));
  const [typing, setTyping] = useState(false);
  if (typing) {
    return (
      <div className="flex items-center gap-2">
        <input type="hidden" name={name} value={value} />
        <input id={id} autoFocus className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        <button type="button" className="shrink-0 text-xs text-blue-700 hover:underline" onClick={() => setTyping(false)}>
          Pick from list
        </button>
      </div>
    );
  }
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <select
        id={id}
        className={cn("input", disabled && "opacity-50")}
        value={inList?.name ?? value}
        onChange={(e) => {
          if (e.target.value === NEW_ITEM) {
            setTyping(true);
            onChange("");
          } else onChange(e.target.value);
        }}
      >
        {!inList ? <option value={value}>{value ? `${value} (new — saved to the list with this takeoff)` : "—"}</option> : null}
        {list.map((i) => (
          <option key={i.name} value={i.name}>
            {i.name}
          </option>
        ))}
        <option value={NEW_ITEM}>+ New item…</option>
      </select>
    </>
  );
}

/** Which precut each wall height uses, for the dropdown labels. */
const PRECUT_FOR: Record<string, string> = { "92.625": "8' wall", "104.625": "9' wall", "116.625": "10' wall" };

/**
 * Precut studs or studs cut from stock, from a short list of lengths. Posts
 * opt_studPrecut and opt_studLengthIn (inches). `auto` is the length that matches
 * the wall height, offered first when there is one.
 */
function StudPicker({
  id,
  precut,
  lengthIn,
  onChange,
  auto,
}: {
  id: string;
  precut: boolean;
  lengthIn: number;
  onChange: (precut: boolean, lengthIn: number) => void;
  auto?: { precut: number; stock: number; touched: boolean; reset: () => void };
}) {
  const choices = precut ? STUD_PRECUTS_IN : STUD_STOCK_FT.map((f) => f * 12);
  const list = choices.some((c) => Math.abs(c - lengthIn) < 0.01) ? choices : [...choices, lengthIn].sort((a, b) => a - b);
  const label = (inches: number) => (precut ? `${inchesText(inches)}${PRECUT_FOR[String(inches)] ? ` (${PRECUT_FOR[String(inches)]})` : ""}` : `${inches / 12}'`);
  const autoLen = auto ? (precut ? auto.precut : auto.stock) : null;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="opt_studPrecut" value={precut ? "true" : "false"} />
      <input type="hidden" name="opt_studLengthIn" value={lengthIn} />
      <div>
        <p className="label">Stud type</p>
        <div role="radiogroup" aria-label="Stud kind" className="inline-flex overflow-hidden rounded-md border border-slate-300">
          {[
            [true, "Precut"],
            [false, "Cut from stock"],
          ].map(([v, text]) => (
            <button
              key={String(v)}
              type="button"
              role="radio"
              aria-checked={precut === v}
              onClick={() => {
                if (precut === v) return;
                const next = v as boolean;
                // Switching kinds: the length that suits the wall, or a sensible default.
                onChange(next, auto ? (next ? auto.precut : auto.stock) : next ? STUD_PRECUTS_IN[0] : 96);
                auto?.reset();
              }}
              className={cn("px-3 py-1.5 text-xs font-medium", precut === v ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50")}
            >
              {text as string}
            </button>
          ))}
        </div>
      </div>
      <Field
        label={precut ? "Precut length" : "Stock length"}
        htmlFor={id}
        hint={
          auto && autoLen != null ? (
            auto.touched && Math.abs(autoLen - lengthIn) > 0.01 ? (
              <button type="button" className="text-blue-700 hover:underline" onClick={auto.reset}>
                Use {label(autoLen)} for this height
              </button>
            ) : (
              "Matches the wall height"
            )
          ) : undefined
        }
      >
        <select id={id} className="input !w-44" value={lengthIn} onChange={(e) => onChange(precut, Number(e.target.value))}>
          {list.map((c) => (
            <option key={c} value={c}>
              {label(c)}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

const lumber = (sizes: MemberSizeOption[]) => sizes.filter((m) => m.kind === "DIMENSIONAL");

/**
 * Walls: studs, top plate, bottom plate, sheathing, drywall and baseboard. Posts
 * memberSizeId (studs), spacing, height and "opt_<key>" fields (parsed by conditionFields).
 */
export function WallOptionsFields({
  idPrefix,
  values,
  memberSizes,
  items,
}: {
  idPrefix: string;
  values?: { memberSizeId: string | null; spacing: number; height: number; options?: string | null };
  memberSizes: MemberSizeOption[];
  items: ItemChoice[];
}) {
  const start = parseOptions(values?.options, DEFAULT_WALL_OPTIONS);
  const sizes = lumber(memberSizes);
  const [o, setO] = useState<WallOptions>(start);
  const set = <K extends keyof WallOptions>(k: K, v: WallOptions[K]) => setO((cur) => ({ ...cur, [k]: v }));
  // Sheet goods: the item's name and the sheet size stay in step.
  const setSheetItem = (item: "sheathingItem" | "drywallItem", sheet: "sheathingSheet" | "drywallSheet", v: string) => {
    const size = sheetSizeInName(v);
    setO((cur) => ({ ...cur, [item]: v, ...(size && SHEET_SIZES[size] ? { [sheet]: size } : {}) }));
  };
  const setSheetSize = (item: "sheathingItem" | "drywallItem", sheet: "sheathingSheet" | "drywallSheet", v: string) =>
    setO((cur) => ({ ...cur, [sheet]: v, [item]: withSheetSize(cur[item], v) }));
  const [studId, setStudId] = useState(values?.memberSizeId ?? sizes.find((m) => m.name === "2x4")?.id ?? "");
  const [spacing, setSpacing] = useState(String(values?.spacing ?? 16));
  const [heightText, setHeightText] = useState(String(values?.height || 8));
  const height = Number(heightText) || 0;
  // The stud follows the wall height until you pick one. Precuts assume the usual double top +
  // single bottom plate; extra top plates are counted as material (bracing), not stacked in the wall.
  const [studPrecut, setStudPrecut] = useState(start.studPrecut);
  const [studPicked, setStudPicked] = useState(start.studLengthIn);
  const [studTouched, setStudTouched] = useState(!!values && Math.abs(defaultStudLength(values.height || 8, start.studPrecut) - start.studLengthIn) > 0.01);
  const studLen = studTouched ? studPicked : defaultStudLength(height, studPrecut);
  const studSize = sizes.find((m) => m.id === studId)?.name ?? "";
  const p = (k: string) => `${idPrefix}-${k}`;
  const sizeSelect = (k: "topPlateSize" | "bottomPlateSize", label: string) => (
    <Field label={label} htmlFor={p(k)}>
      <select id={p(k)} name={`opt_${k}`} className="input !w-40" value={o[k]} onChange={(e) => set(k, e.target.value)}>
        <option value="">Same as studs{studSize ? ` (${studSize})` : ""}</option>
        {sizes.map((m) => (
          <option key={m.id} value={m.name}>
            {m.name}
          </option>
        ))}
      </select>
    </Field>
  );
  const countSelect = (k: "topPlates" | "bottomPlates", label: string, max: number) => (
    <Field label={label} htmlFor={p(k)}>
      <select id={p(k)} name={`opt_${k}`} className="input !w-24" value={o[k]} onChange={(e) => set(k, Number(e.target.value))}>
        {Array.from({ length: max + 1 }, (_, n) => n).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </Field>
  );
  const sheetSelect = (k: "sheathingSheet" | "drywallSheet", item: "sheathingItem" | "drywallItem") => (
    <Field label="Sheet" htmlFor={p(k)}>
      <select id={p(k)} name={`opt_${k}`} className="input !w-24" value={o[k]} onChange={(e) => setSheetSize(item, k, e.target.value)}>
        {Object.keys(SHEET_SIZES).map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <div className="space-y-3 rounded-lg border border-teal-200 bg-teal-50/40 p-3">
      <p className="text-sm text-teal-900">
        {wallSummary({ studSize, spacing: Number(spacing) || 16, heightFt: height }, { ...o, studPrecut, studLengthIn: studLen })}
      </p>

      <Section title="Studs" hint="One per spacing along each wall, one to close an open run, and the extras at each corner.">
        <Field label="Stud size" htmlFor={p("memberSizeId")}>
          <select id={p("memberSizeId")} name="memberSizeId" required className="input !w-32" value={studId} onChange={(e) => setStudId(e.target.value)}>
            <option value="">—</option>
            {sizes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Spacing" htmlFor={p("spacing")}>
          <select id={p("spacing")} name="spacing" className="input !w-28" value={spacing} onChange={(e) => setSpacing(e.target.value)}>
            {["12", "16", "19.2", "24"].map((s) => (
              <option key={s} value={s}>
                {s}&quot; o.c.
              </option>
            ))}
          </select>
        </Field>
        <Field label="Wall height (ft)" htmlFor={p("height")}>
          <input id={p("height")} name="height" type="number" step="0.25" min="1" className="input !w-24" value={heightText} onChange={(e) => setHeightText(e.target.value)} />
        </Field>
        <StudPicker
          id={p("studLen")}
          precut={studPrecut}
          lengthIn={studLen}
          onChange={(pc, len) => {
            setStudPrecut(pc);
            setStudPicked(len);
            setStudTouched(true);
          }}
          auto={{ precut: defaultStudLength(height, true), stock: defaultStudLength(height, false), touched: studTouched, reset: () => setStudTouched(false) }}
        />
        <Field label="Extra studs per corner" htmlFor={p("cornerStuds")}>
          <input id={p("cornerStuds")} name="opt_cornerStuds" type="number" step="1" min="0" className="input !w-24" value={o.cornerStuds} onChange={(e) => set("cornerStuds", Number(e.target.value) || 0)} />
        </Field>
      </Section>

      <div className="grid gap-3 lg:grid-cols-2">
        <Section title="Top plate">
          {countSelect("topPlates", "How many", 10)}
          {sizeSelect("topPlateSize", "Size")}
          <Field label="Stock lengths (ft)" htmlFor={p("topStock")}>
            <input id={p("topStock")} name="opt_topPlateStock" className="input !w-28" value={o.topPlateStock} onChange={(e) => set("topPlateStock", e.target.value)} placeholder="16" />
          </Field>
        </Section>
        <Section title="Bottom plate">
          {countSelect("bottomPlates", "How many", 3)}
          {sizeSelect("bottomPlateSize", "Size")}
          <Field label="Stock lengths (ft)" htmlFor={p("bottomStock")}>
            <input id={p("bottomStock")} name="opt_bottomPlateStock" className="input !w-28" value={o.bottomPlateStock} onChange={(e) => set("bottomPlateStock", e.target.value)} placeholder="16" />
          </Field>
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
            <input type="checkbox" name="opt_treatedBottom" checked={o.treatedBottom} onChange={(e) => set("treatedBottom", e.target.checked)} /> Treated
          </label>
        </Section>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Section title="Sheathing" hint="Wall length × height × sides, in sheets.">
          <Sides name="opt_sheathingSides" label="Sheathing sides" value={o.sheathingSides} onChange={(n) => set("sheathingSides", n)} />
          <Field label="Item" htmlFor={p("sheathingItem")} className="min-w-48 flex-1">
            <ItemPicker
              id={p("sheathingItem")}
              name="opt_sheathingItem"
              value={o.sheathingItem}
              onChange={(v) => setSheetItem("sheathingItem", "sheathingSheet", v)}
              placeholder='7/16" ZIP System sheathing 4x8'
              items={items}
              kind="sheathing"
              disabled={o.sheathingSides === 0}
            />
          </Field>
          {sheetSelect("sheathingSheet", "sheathingItem")}
        </Section>
        <Section title="Drywall" hint="Wall length × height × sides, in sheets.">
          <Sides name="opt_drywallSides" label="Drywall sides" value={o.drywallSides} onChange={(n) => set("drywallSides", n)} />
          <Field label="Item" htmlFor={p("drywallItem")} className="min-w-48 flex-1">
            <ItemPicker
              id={p("drywallItem")}
              name="opt_drywallItem"
              value={o.drywallItem}
              onChange={(v) => setSheetItem("drywallItem", "drywallSheet", v)}
              placeholder='5/8" Type X Drywall 4x12'
              items={items}
              kind="drywall"
              disabled={o.drywallSides === 0}
            />
          </Field>
          {sheetSelect("drywallSheet", "drywallItem")}
        </Section>
      </div>

      <Section title="Baseboard" hint="Wall length × sides, in lineal feet.">
        <Sides name="opt_baseSides" label="Baseboard sides" value={o.baseSides} onChange={(n) => set("baseSides", n)} />
        <Field label="Item" htmlFor={p("baseItem")} className="min-w-48 flex-1">
          <ItemPicker
            id={p("baseItem")}
            name="opt_baseItem"
            value={o.baseItem}
            onChange={(v) => set("baseItem", v)}
            placeholder='3-1/4" MDF colonial base'
            items={items}
            kind="trim"
            disabled={o.baseSides === 0}
          />
        </Field>
      </Section>
    </div>
  );
}

/** A trim item from the Item List (Trim) with its stick length, which fills in from the item. */
function TrimPicker({
  id,
  label,
  itemName,
  stickName,
  item,
  stick,
  onItem,
  onStick,
  items,
  placeholder,
  disabled,
}: {
  id: string;
  label: string;
  itemName: string;
  stickName: string;
  item: string;
  stick: number;
  onItem: (name: string, stickFt: number | null) => void;
  onStick: (ft: number) => void;
  items: ItemChoice[];
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <>
      <Field label={label} htmlFor={`${id}-item`} className="min-w-48 flex-1">
        <ItemPicker
          id={`${id}-item`}
          name={itemName}
          value={item}
          onChange={(name) => {
            const len = items.find((i) => itemNameKey(i.name) === itemNameKey(name))?.lengthFt;
            onItem(name, len && len > 0 ? len : null);
          }}
          placeholder={placeholder}
          items={items}
          kind="trim"
          disabled={disabled}
        />
      </Field>
      <Field label="Stick (ft)" htmlFor={`${id}-stick`} hint="Blank = by the foot">
        <input
          id={`${id}-stick`}
          name={stickName}
          type="number"
          step="0.5"
          min="0"
          className="input !w-20"
          value={stick || ""}
          onChange={(e) => onStick(Number(e.target.value) || 0)}
          placeholder="8"
        />
      </Field>
    </>
  );
}

/** Doors: the casing — leg trim and head trim (when different), 1 or 2 sides, with their sticks. */
export function DoorOptionsFields({ idPrefix, values, items }: { idPrefix: string; values?: { options?: string | null }; items: ItemChoice[] }) {
  const [o, setO] = useState<DoorOptions>(parseOptions(values?.options, DEFAULT_DOOR_OPTIONS));
  const p = (k: string) => `${idPrefix}-${k}`;
  return (
    <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/40 p-3">
      <p className="text-sm text-sky-900">
        Click each door on the plan, then pick which door it is (filter by height, width, interior / exterior). Doors are counted by name; {doorSummary(o).toLowerCase()}.
      </p>
      <Section title="Casing" hint="Per door per side: 2 legs (the height) and a head (the width). Each piece is cut from whole sticks and rounded up.">
        <Sides name="opt_casingSides" label="Casing sides" value={o.casingSides} onChange={(n) => setO((cur) => ({ ...cur, casingSides: n }))} />
      </Section>
      <Section title="Legs">
        <TrimPicker
          id={p("casing")}
          label="Leg trim"
          itemName="opt_casingItem"
          stickName="opt_casingStickFt"
          item={o.casingItem}
          stick={o.casingStickFt}
          onItem={(name, len) => setO((cur) => ({ ...cur, casingItem: name, casingStickFt: len ?? cur.casingStickFt }))}
          onStick={(ft) => setO((cur) => ({ ...cur, casingStickFt: ft }))}
          items={items}
          placeholder="1x4 casing"
          disabled={o.casingSides === 0}
        />
      </Section>
      <Section title="Head" hint="Leave blank to use the leg trim for the head too.">
        <TrimPicker
          id={p("head")}
          label="Head trim"
          itemName="opt_headItem"
          stickName="opt_headStickFt"
          item={o.headItem}
          stick={o.headStickFt}
          onItem={(name, len) => setO((cur) => ({ ...cur, headItem: name, headStickFt: len ?? cur.headStickFt }))}
          onStick={(ft) => setO((cur) => ({ ...cur, headStickFt: ft }))}
          items={items}
          placeholder="1x6 head (blank = same as legs)"
          disabled={o.casingSides === 0}
        />
      </Section>
    </div>
  );
}

/**
 * Windows: every window gets a stool (always "Window stool") and an apron; cased
 * windows (set on each window) also get leg trim, a head and a lining.
 */
export function WindowOptionsFields({ idPrefix, values, items }: { idPrefix: string; values?: { options?: string | null }; items: ItemChoice[] }) {
  const [o, setO] = useState<WindowOptions>(parseOptions(values?.options, DEFAULT_WINDOW_OPTIONS));
  const p = (k: string) => `${idPrefix}-${k}`;
  const stoolLen = items.find((i) => itemNameKey(i.name) === itemNameKey(WINDOW_STOOL_ITEM))?.lengthFt ?? null;
  const set = <K extends keyof WindowOptions>(k: K, v: WindowOptions[K]) => setO((cur) => ({ ...cur, [k]: v }));
  return (
    <div className="space-y-3 rounded-lg border border-cyan-200 bg-cyan-50/40 p-3">
      <p className="text-sm text-cyan-900">
        Click each window on the plan, then pick which window it is (filter by type, height and width) and whether it&apos;s cased. Windows are counted by name.{" "}
        {windowSummary(o)}.
      </p>
      <Section title="Every window">
        <Field label="Stool longer than the window by (in)" htmlFor={p("stoolExtraIn")} hint={`Ordered as "${WINDOW_STOOL_ITEM}"`}>
          <input
            id={p("stoolExtraIn")}
            name="opt_stoolExtraIn"
            type="number"
            step="0.25"
            min="0"
            className="input !w-24"
            value={o.stoolExtraIn}
            onChange={(e) => set("stoolExtraIn", Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Stool stick (ft)" htmlFor={p("stoolStickFt")} hint={stoolLen ? `${stoolLen}' on the Item List` : "Blank = by the foot"}>
          <input
            id={p("stoolStickFt")}
            name="opt_stoolStickFt"
            type="number"
            step="0.5"
            min="0"
            className="input !w-20"
            value={o.stoolStickFt || ""}
            onChange={(e) => set("stoolStickFt", Number(e.target.value) || 0)}
            placeholder={stoolLen ? String(stoolLen) : "8"}
          />
        </Field>
        <TrimPicker
          id={p("apron")}
          label="Apron trim"
          itemName="opt_apronItem"
          stickName="opt_apronStickFt"
          item={o.apronItem}
          stick={o.apronStickFt}
          onItem={(name, len) => setO((cur) => ({ ...cur, apronItem: name, apronStickFt: len ?? cur.apronStickFt }))}
          onStick={(ft) => set("apronStickFt", ft)}
          items={items}
          placeholder="Apron trim"
        />
        <Field label="Apron longer than the window by (in)" htmlFor={p("apronExtraIn")}>
          <input
            id={p("apronExtraIn")}
            name="opt_apronExtraIn"
            type="number"
            step="0.25"
            min="0"
            className="input !w-24"
            value={o.apronExtraIn}
            onChange={(e) => set("apronExtraIn", Number(e.target.value) || 0)}
          />
        </Field>
      </Section>
      <Section title="Cased windows" hint="Legs (the height ×2) and a head (the width), plus the lining inside the opening (2 × height + width).">
        <TrimPicker
          id={p("casing")}
          label="Leg trim"
          itemName="opt_casingItem"
          stickName="opt_casingStickFt"
          item={o.casingItem}
          stick={o.casingStickFt}
          onItem={(name, len) => setO((cur) => ({ ...cur, casingItem: name, casingStickFt: len ?? cur.casingStickFt }))}
          onStick={(ft) => set("casingStickFt", ft)}
          items={items}
          placeholder="1x4 casing"
        />
        <TrimPicker
          id={p("head")}
          label="Head trim"
          itemName="opt_headItem"
          stickName="opt_headStickFt"
          item={o.headItem}
          stick={o.headStickFt}
          onItem={(name, len) => setO((cur) => ({ ...cur, headItem: name, headStickFt: len ?? cur.headStickFt }))}
          onStick={(ft) => set("headStickFt", ft)}
          items={items}
          placeholder="1x6 head (blank = same as legs)"
        />
        <TrimPicker
          id={p("lining")}
          label="Lining"
          itemName="opt_liningItem"
          stickName="opt_liningStickFt"
          item={o.liningItem}
          stick={o.liningStickFt}
          onItem={(name, len) => setO((cur) => ({ ...cur, liningItem: name, liningStickFt: len ?? cur.liningStickFt }))}
          onStick={(ft) => set("liningStickFt", ft)}
          items={items}
          placeholder="1x6 primed"
        />
      </Section>
    </div>
  );
}

/** Openings: header (size, plies, extra length, stock) and king & jack studs. */
export function OpeningOptionsFields({
  idPrefix,
  values,
  memberSizes,
}: {
  idPrefix: string;
  values?: { memberSizeId: string | null; stockLengths: string | null; options?: string | null };
  memberSizes: MemberSizeOption[];
}) {
  const [o, setO] = useState<OpeningOptions>(parseOptions(values?.options, DEFAULT_OPENING_OPTIONS));
  const set = <K extends keyof OpeningOptions>(k: K, v: OpeningOptions[K]) => setO((cur) => ({ ...cur, [k]: v }));
  const headerSizes = memberSizes.filter((m) => m.kind === "DIMENSIONAL" || m.kind === "ENGINEERED");
  const [headerId, setHeaderId] = useState(values?.memberSizeId ?? "");
  const header = headerSizes.find((m) => m.id === headerId) ?? null;
  const [stock, setStock] = useState(values?.stockLengths ?? "");
  const p = (k: string) => `${idPrefix}-${k}`;
  const num = (k: "headerPlies" | "headerExtraIn" | "kingStuds" | "jackStuds", label: string, step = "1", hint?: string) => (
    <Field label={label} htmlFor={p(k)} hint={hint}>
      <input id={p(k)} name={`opt_${k}`} type="number" step={step} min="0" className="input !w-24" value={o[k]} onChange={(e) => set(k, Number(e.target.value) || 0)} />
    </Field>
  );

  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
      <p className="text-sm text-amber-900">
        Draw a line across each opening — one line is one opening, and its length is the width. {openingSummary(header?.name ?? null, o)}
      </p>
      <Section title="Header" hint="Each opening gets plies × (width + extra), cut from your stock lengths.">
        <Field label="Size" htmlFor={p("memberSizeId")}>
          <select
            id={p("memberSizeId")}
            name="memberSizeId"
            className="input !w-48"
            value={headerId}
            onChange={(e) => {
              const next = headerSizes.find((m) => m.id === e.target.value) ?? null;
              if (!stock.trim() || stock === (header?.stockLengths ?? "")) setStock(next?.stockLengths ?? "");
              setHeaderId(e.target.value);
            }}
          >
            <option value="">No header</option>
            {headerSizes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Plies" htmlFor={p("headerPlies")}>
          <select id={p("headerPlies")} name="opt_headerPlies" className="input !w-20" value={o.headerPlies} onChange={(e) => set("headerPlies", Number(e.target.value))}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        {num("headerExtraIn", "Extra length (in)", "0.5", "Bearing, added to the width")}
        <Field label="Stock lengths (ft)" htmlFor={p("stockLengths")} hint="Blank = even lengths from 8'">
          <input id={p("stockLengths")} name="stockLengths" className="input !w-36" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="8-20" />
        </Field>
      </Section>

      <Section title="King & jack studs" hint="Per opening.">
        {num("kingStuds", "King studs")}
        {num("jackStuds", "Jack studs")}
        <Field label="Stud size" htmlFor={p("studSize")}>
          <select id={p("studSize")} name="opt_studSize" className="input !w-28" value={o.studSize} onChange={(e) => set("studSize", e.target.value)}>
            {lumber(memberSizes).map((m) => (
              <option key={m.id} value={m.name}>
                {m.name}
              </option>
            ))}
            {lumber(memberSizes).some((m) => m.name === o.studSize) ? null : <option value={o.studSize}>{o.studSize}</option>}
          </select>
        </Field>
        <StudPicker
          id={p("studLen")}
          precut={o.studPrecut}
          lengthIn={o.studLengthIn}
          onChange={(pc, len) => setO((cur) => ({ ...cur, studPrecut: pc, studLengthIn: len }))}
        />
      </Section>
    </div>
  );
}
