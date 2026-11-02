"use client";

import { useState } from "react";
import { Line, Section, Switch } from "./mini";
import { cn } from "@/lib/utils";
import { itemKind, type ItemKind } from "@/lib/code-groups";
import {
  DEFAULT_DOOR_OPTIONS,
  DEFAULT_WINDOW_OPTIONS,
  WINDOW_STOOL_ITEM,
  type WindowOptions,
  DEFAULT_OPENING_OPTIONS,
  type DoorOptions,
  DEFAULT_WALL_OPTIONS,
  SHEET_SIZES,
  STUD_PRECUTS_IN,
  STUD_STOCK_FT,
  compareMaterialNames,
  defaultStudLength,
  inchesText,
  itemNameKey,
  parseOptions,
  sheetSizeInName,
  withSheetSize,
  type OpeningOptions,
  type TrimUse,
  type WallOptions,
} from "@/lib/takeoff";
import type { MemberSizeOption } from "./condition-form";

/** None / 1 side / Both as one small switch, posted as `name`. */
function Sides({ name, value, onChange, label }: { name: string; value: number; onChange: (n: number) => void; label: string }) {
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Switch
        label={label}
        value={value}
        onChange={onChange}
        options={[
          [0, "None"],
          [1, "1 side"],
          [2, "Both"],
        ]}
      />
    </>
  );
}

export type ItemChoice = { name: string; category: string; kind?: string | null; lengthFt?: number | null; trimUses?: string[] };

const NEW_ITEM = "__new__";

/**
 * Pick one of the Item List items of a `kind` (e.g. sheathing — whatever category
 * you file them under), or type a new one — saving the condition adds it to the
 * Item List as that kind, so it's in this list from then on. Posts `name`.
 * A trim box (`use`) lists only the trim used there before (Baseboard: only base).
 */
function ItemPicker({
  id,
  name,
  label,
  value,
  onChange,
  items,
  kind,
  placeholder,
  disabled,
  use,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  items: ItemChoice[];
  kind: ItemKind;
  placeholder: string;
  disabled?: boolean;
  use?: TrimUse;
}) {
  const list = items.filter((i) => (use ? i.trimUses?.includes(use) : itemKind(i) === kind)).sort((a, b) => compareMaterialNames(a.name, b.name));
  const inList = list.find((i) => itemNameKey(i.name) === itemNameKey(value));
  const [typing, setTyping] = useState(false);
  if (typing) {
    return (
      <span className="flex min-w-28 flex-1 items-center gap-1.5">
        <input type="hidden" name={name} value={value} />
        <input id={id} aria-label={label} autoFocus className="input min-w-0 flex-1" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        <button type="button" className="shrink-0 text-xs text-blue-700 hover:underline" onClick={() => setTyping(false)}>
          Pick from list
        </button>
      </span>
    );
  }
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <select
        id={id}
        aria-label={label}
        className={cn("input !w-auto min-w-24 flex-1", disabled && "opacity-50")}
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
    <>
      <input type="hidden" name="opt_studPrecut" value={precut ? "true" : "false"} />
      <input type="hidden" name="opt_studLengthIn" value={lengthIn} />
      <Switch
        label="Precut or from stock"
        value={precut}
        onChange={(next) => {
          if (precut === next) return;
          // Switching kinds: the length that suits the wall, or a sensible default.
          onChange(next, auto ? (next ? auto.precut : auto.stock) : next ? STUD_PRECUTS_IN[0] : 96);
          auto?.reset();
        }}
        options={[
          [true, "Precut"],
          [false, "From stock"],
        ]}
      />
      <select
        id={id}
        aria-label="Stud length"
        title={auto && autoLen != null && Math.abs(autoLen - lengthIn) < 0.01 ? "Matches the wall height" : undefined}
        className="input !w-auto"
        value={lengthIn}
        onChange={(e) => onChange(precut, Number(e.target.value))}
      >
        {list.map((c) => (
          <option key={c} value={c}>
            {label(c)}
          </option>
        ))}
      </select>
      {auto && autoLen != null && auto.touched && Math.abs(autoLen - lengthIn) > 0.01 ? (
        <button type="button" className="text-blue-700 hover:underline" onClick={auto.reset}>
          Use {label(autoLen)} for this height
        </button>
      ) : null}
    </>
  );
}

const lumber = (sizes: MemberSizeOption[]) => sizes.filter((m) => m.kind === "DIMENSIONAL");

/** A small number box. */
function NumBox({ name, label, value, onChange, step = "1", width = "!w-11", placeholder, title, text }: {
  name: string;
  label: string;
  value: number | string;
  onChange: (v: string) => void;
  step?: string;
  width?: string;
  placeholder?: string;
  title?: string;
  /** Free text (stock lengths like "8-16"), not just a number. */
  text?: boolean;
}) {
  return (
    <input
      name={name}
      aria-label={label}
      title={title}
      type={text ? "text" : "number"}
      step={text ? undefined : step}
      min={text ? undefined : "0"}
      className={cn("input", width)}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

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
    <select id={p(k)} name={`opt_${k}`} aria-label={label} className="input !w-auto" value={o[k]} onChange={(e) => set(k, e.target.value)}>
      <option value="">Like studs{studSize ? ` (${studSize})` : ""}</option>
      {sizes.map((m) => (
        <option key={m.id} value={m.name}>
          {m.name}
        </option>
      ))}
    </select>
  );
  const countSelect = (k: "topPlates" | "bottomPlates", label: string, max: number) => (
    <select id={p(k)} name={`opt_${k}`} aria-label={label} className="input !w-11" value={o[k]} onChange={(e) => set(k, Number(e.target.value))}>
      {Array.from({ length: max + 1 }, (_, n) => n).map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
  const sheetSelect = (k: "sheathingSheet" | "drywallSheet", item: "sheathingItem" | "drywallItem", label: string) => (
    <select id={p(k)} name={`opt_${k}`} aria-label={label} className="input !w-16" value={o[k]} onChange={(e) => setSheetSize(item, k, e.target.value)}>
      {Object.keys(SHEET_SIZES).map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <Section title="Studs">
        <Line>
          <select id={p("memberSizeId")} name="memberSizeId" aria-label="Stud size" required className="input !w-auto" value={studId} onChange={(e) => setStudId(e.target.value)}>
            <option value="">—</option>
            {sizes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          @
          <select id={p("spacing")} name="spacing" aria-label="Stud spacing" className="input !w-auto" value={spacing} onChange={(e) => setSpacing(e.target.value)}>
            {["12", "16", "19.2", "24"].map((s) => (
              <option key={s} value={s}>
                {s}&quot; o.c.
              </option>
            ))}
          </select>
          <NumBox name="height" label="Wall height (ft)" step="0.25" value={heightText} onChange={setHeightText} />
          ft high
        </Line>
        <Line>
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
          <NumBox name="opt_cornerStuds" label="Extra studs per corner" width="!w-10" value={o.cornerStuds} onChange={(v) => set("cornerStuds", Number(v) || 0)} />
          <span title="Extra studs at each corner">per corner</span>
        </Line>
      </Section>

      <Section title="Plates">
        <Line>
          <span className="w-11">Top</span>
          {countSelect("topPlates", "Top plates", 10)}
          {sizeSelect("topPlateSize", "Top plate size")}
          <NumBox name="opt_topPlateStock" label="Top plate stock (ft)" width="!w-12" placeholder="16" text value={o.topPlateStock} onChange={(v) => set("topPlateStock", v)} />
          <span title="Stock length">ft</span>
        </Line>
        <Line>
          <span className="w-11">Bottom</span>
          {countSelect("bottomPlates", "Bottom plates", 3)}
          {sizeSelect("bottomPlateSize", "Bottom plate size")}
          <NumBox name="opt_bottomPlateStock" label="Bottom plate stock (ft)" width="!w-12" placeholder="16" text value={o.bottomPlateStock} onChange={(v) => set("bottomPlateStock", v)} />
          <span title="Stock length">ft</span>
          <label className="flex items-center gap-1 text-slate-700">
            <input type="checkbox" name="opt_treatedBottom" checked={o.treatedBottom} onChange={(e) => set("treatedBottom", e.target.checked)} /> Treated
          </label>
        </Line>
      </Section>

      <Section title="Sheathing">
        <Line>
          <Sides name="opt_sheathingSides" label="Sheathing sides" value={o.sheathingSides} onChange={(n) => set("sheathingSides", n)} />
          <ItemPicker
            id={p("sheathingItem")}
            name="opt_sheathingItem"
            label="Sheathing item"
            value={o.sheathingItem}
            onChange={(v) => setSheetItem("sheathingItem", "sheathingSheet", v)}
            placeholder='7/16" ZIP System sheathing 4x8'
            items={items}
            kind="sheathing"
            disabled={o.sheathingSides === 0}
          />
          {sheetSelect("sheathingSheet", "sheathingItem", "Sheathing sheet size")}
        </Line>
      </Section>
      <Section title="Drywall">
        <Line>
          <Sides name="opt_drywallSides" label="Drywall sides" value={o.drywallSides} onChange={(n) => set("drywallSides", n)} />
          <ItemPicker
            id={p("drywallItem")}
            name="opt_drywallItem"
            label="Drywall item"
            value={o.drywallItem}
            onChange={(v) => setSheetItem("drywallItem", "drywallSheet", v)}
            placeholder='5/8" Type X Drywall 4x12'
            items={items}
            kind="drywall"
            disabled={o.drywallSides === 0}
          />
          {sheetSelect("drywallSheet", "drywallItem", "Drywall sheet size")}
        </Line>
      </Section>
      <Section title="Baseboard">
        <Line>
          <Sides name="opt_baseSides" label="Baseboard sides" value={o.baseSides} onChange={(n) => set("baseSides", n)} />
          <ItemPicker
            id={p("baseItem")}
            name="opt_baseItem"
            label="Baseboard item"
            value={o.baseItem}
            onChange={(v) => set("baseItem", v)}
            placeholder='3-1/4" MDF colonial base'
            items={items}
            kind="trim"
            use="base"
            disabled={o.baseSides === 0}
          />
          <NumBox
            name="opt_basePieceFt"
            label="Baseboard stick (ft)"
            width="!w-11"
            title="When the item is priced each: how long a stick is (a length in its name, like × 16', wins)"
            value={o.basePieceFt}
            onChange={(v) => set("basePieceFt", Number(v) || 16)}
          />
          ft sticks
        </Line>
      </Section>
    </>
  );
}

/** A trim item from the Item List (Trim) and its stick length, which fills in from the item. */
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
  use,
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
  use: TrimUse;
}) {
  return (
    <>
      <ItemPicker
        id={`${id}-item`}
        name={itemName}
        label={label}
        value={item}
        onChange={(name) => {
          const len = items.find((i) => itemNameKey(i.name) === itemNameKey(name))?.lengthFt;
          onItem(name, len && len > 0 ? len : null);
        }}
        placeholder={placeholder}
        items={items}
        kind="trim"
        use={use}
        disabled={disabled}
      />
      <NumBox name={stickName} label={`${label} stick (ft)`} step="0.5" width="!w-11" placeholder="8" title="Blank = by the foot" value={stick || ""} onChange={(v) => onStick(Number(v) || 0)} />
      <span>ft sticks</span>
    </>
  );
}

/** Doors: the casing — leg trim and head trim (when different), 1 or 2 sides, with their sticks. */
export function DoorOptionsFields({ idPrefix, values, items }: { idPrefix: string; values?: { options?: string | null }; items: ItemChoice[] }) {
  const [o, setO] = useState<DoorOptions>(parseOptions(values?.options, DEFAULT_DOOR_OPTIONS));
  const p = (k: string) => `${idPrefix}-${k}`;
  return (
    <Section title="Casing">
      <Line>
        <Sides name="opt_casingSides" label="Casing sides" value={o.casingSides} onChange={(n) => setO((cur) => ({ ...cur, casingSides: n }))} />
        per door: 2 legs and a head, from whole sticks
      </Line>
      <Line>
        <span className="w-11">Legs</span>
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
          use="casing"
          disabled={o.casingSides === 0}
        />
      </Line>
      <Line>
        <span className="w-11">Head</span>
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
          placeholder="Blank = same as the legs"
          use="casing"
          disabled={o.casingSides === 0}
        />
      </Line>
    </Section>
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
  const trim = (k: "apron" | "casing" | "head" | "lining", label: string, placeholder: string) => {
    const use: TrimUse = k === "apron" ? "apron" : k === "lining" ? "lining" : "casing";
    const item = `${k}Item` as "apronItem" | "casingItem" | "headItem" | "liningItem";
    const stick = `${k}StickFt` as "apronStickFt" | "casingStickFt" | "headStickFt" | "liningStickFt";
    return (
      <TrimPicker
        id={p(k)}
        label={label}
        itemName={`opt_${item}`}
        stickName={`opt_${stick}`}
        item={o[item]}
        stick={o[stick]}
        onItem={(name, len) => setO((cur) => ({ ...cur, [item]: name, [stick]: len ?? cur[stick] }))}
        onStick={(ft) => set(stick, ft)}
        items={items}
        placeholder={placeholder}
        use={use}
      />
    );
  };
  return (
    <>
      <Section title="Stool">
        <Line>
          <NumBox name="opt_stoolExtraIn" label="Stool longer than the window by (in)" step="0.25" width="!w-11" value={o.stoolExtraIn} onChange={(v) => set("stoolExtraIn", Number(v) || 0)} />
          in longer ·
          <NumBox
            name="opt_stoolStickFt"
            label="Stool stick (ft)"
            step="0.5"
            width="!w-11"
            placeholder={stoolLen ? String(stoolLen) : "8"}
            title={`Ordered as "${WINDOW_STOOL_ITEM}". ${stoolLen ? `${stoolLen}' on the Item List` : "Blank = by the foot"}`}
            value={o.stoolStickFt || ""}
            onChange={(v) => set("stoolStickFt", Number(v) || 0)}
          />
          ft sticks
        </Line>
      </Section>
      <Section title="Apron">
        <Line>
          <NumBox name="opt_apronExtraIn" label="Apron longer than the window by (in)" step="0.25" width="!w-11" value={o.apronExtraIn} onChange={(v) => set("apronExtraIn", Number(v) || 0)} />
          <span>in longer ·</span>
          {trim("apron", "Apron trim", "Apron trim")}
        </Line>
      </Section>
      <Section title="Cased">
        <Line>
          <span className="w-11">Legs</span>
          {trim("casing", "Leg trim", "1x4 casing")}
        </Line>
        <Line>
          <span className="w-11">Head</span>
          {trim("head", "Head trim", "Blank = same as the legs")}
        </Line>
        <Line>
          <span className="w-11">Lining</span>
          {trim("lining", "Lining", "1x6 primed")}
        </Line>
      </Section>
    </>
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

  return (
    <>
      <Section title="Header">
        <Line>
          <select
            id={p("memberSizeId")}
            name="memberSizeId"
            aria-label="Header size"
            className="input !w-auto"
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
          ×
          <select id={p("headerPlies")} name="opt_headerPlies" aria-label="Header plies" className="input !w-12" value={o.headerPlies} onChange={(e) => set("headerPlies", Number(e.target.value))}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          plies, width +
          <NumBox name="opt_headerExtraIn" label="Extra header length (in)" step="0.5" width="!w-11" title="Bearing, added to the width" value={o.headerExtraIn} onChange={(v) => set("headerExtraIn", Number(v) || 0)} />
          in
        </Line>
        <Line>
          <input
            id={p("stockLengths")}
            name="stockLengths"
            aria-label="Header stock lengths (ft)"
            title="Blank = even lengths from 8'"
            className="input !w-20"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            placeholder="8-20"
          />
          ft stock
        </Line>
      </Section>
      <Section title="Studs">
        <Line>
          <NumBox name="opt_kingStuds" label="King studs" width="!w-10" value={o.kingStuds} onChange={(v) => set("kingStuds", Number(v) || 0)} />
          kings ·
          <NumBox name="opt_jackStuds" label="Jack studs" width="!w-10" value={o.jackStuds} onChange={(v) => set("jackStuds", Number(v) || 0)} />
          jacks per opening ·
          <select id={p("studSize")} name="opt_studSize" aria-label="Stud size" className="input !w-auto" value={o.studSize} onChange={(e) => set("studSize", e.target.value)}>
            {lumber(memberSizes).map((m) => (
              <option key={m.id} value={m.name}>
                {m.name}
              </option>
            ))}
            {lumber(memberSizes).some((m) => m.name === o.studSize) ? null : <option value={o.studSize}>{o.studSize}</option>}
          </select>
        </Line>
        <Line>
          <StudPicker id={p("studLen")} precut={o.studPrecut} lengthIn={o.studLengthIn} onChange={(pc, len) => setO((cur) => ({ ...cur, studPrecut: pc, studLengthIn: len }))} />
        </Line>
      </Section>
    </>
  );
}
