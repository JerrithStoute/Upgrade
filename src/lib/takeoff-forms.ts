import "server-only";
import { db } from "./db";
import { newItemPlacement, saveCodeRulesFromForm } from "./item-codes";
import type { ItemKind } from "./code-groups";
import { UNITS } from "./constants";
import { boolField, numField, str, strOrNull } from "./utils";
import {
  CONDITION_COLORS,
  CONDITION_TYPES,
  DEFAULT_METRIC,
  DEFAULT_DOOR_OPTIONS,
  DEFAULT_OPENING_OPTIONS,
  DEFAULT_WINDOW_OPTIONS,
  DEFAULT_WALL_OPTIONS,
  isMemberType,
  isMetricFor,
  itemNameKey,
  parseStockLengths,
  withSheetSize,
  WINDOW_STOOL_ITEM,
  type ConditionType,
  type DoorOptions,
  type WallOptions,
  type WindowOptions,
  packMode,
  beamOptions,
  DEFAULT_BEAM_OPTIONS,
  DEFAULT_FRAMING_OPTIONS,
  framingOptions,
  type TrimUse,
} from "./takeoff";

/**
 * Form parsing shared by job takeoff conditions and takeoff template conditions,
 * so both editors accept exactly the same fields.
 */
export async function conditionFields(fd: FormData) {
  const name = str(fd, "name");
  if (!name) throw new Error("Takeoff name is required");
  const typeRaw = str(fd, "type");
  const type: ConditionType = (CONDITION_TYPES as readonly string[]).includes(typeRaw) ? (typeRaw as ConditionType) : "AREA";
  const metricRaw = str(fd, "metric");
  const color = str(fd, "color");
  const costCodeId = strOrNull(fd, "costCodeId");
  if (costCodeId && !(await db.costCode.findUnique({ where: { id: costCodeId }, select: { id: true } }))) throw new Error("Cost code not found");
  const stockLengths = strOrNull(fd, "stockLengths");
  if (stockLengths && !parseStockLengths(stockLengths)) throw new Error("Stock lengths should be feet, e.g. 8, 10, 12 or 8-24");
  const pack = packMode(str(fd, "packMode"));
  const packLengthFt = numField(fd, "packLength", 0);
  if (type === "FRAMING" && pack === "LENGTH" && !(packLengthFt > 0 && packLengthFt <= 100)) throw new Error("Enter the board length to pack into, in feet (e.g. 16)");
  // Member size: joist/rafter/hip lumber, wall studs, or opening headers.
  const usesSize = isMemberType(type) || type === "WALL" || type === "OPENING";
  const memberSizeId = usesSize ? strOrNull(fd, "memberSizeId") : null;
  if (type === "WALL" && !memberSizeId) throw new Error("Pick a stud size");
  for (const k of ["opt_topPlateStock", "opt_bottomPlateStock"]) {
    const v = str(fd, k);
    if (v && !parseStockLengths(v)) throw new Error("Plate stock lengths should be feet, e.g. 16 or 12, 16");
  }
  const size = memberSizeId ? await db.memberSize.findUnique({ where: { id: memberSizeId }, select: { id: true, name: true } }) : null;
  if (memberSizeId && !size) throw new Error("Member size not found");
  // Joists/rafters: sized by a span table instead (each shape gets the size its span calls for).
  const spanTableId = type === "FRAMING" ? strOrNull(fd, "spanTableId") : null;
  if (spanTableId && !(await db.spanTable.findUnique({ where: { id: spanTableId }, select: { id: true } }))) throw new Error("Span table not found");
  const options =
    type === "WALL"
      ? wallOptions(fd)
      : type === "OPENING"
        ? optionsJson(fd, DEFAULT_OPENING_OPTIONS)
        : type === "DOOR"
          ? optionsJson(fd, DEFAULT_DOOR_OPTIONS)
          : type === "WINDOW"
            ? optionsJson(fd, DEFAULT_WINDOW_OPTIONS)
            : type === "BEAM"
              ? JSON.stringify(beamOptions(optionsJson(fd, DEFAULT_BEAM_OPTIONS)))
              : type === "FRAMING"
                ? JSON.stringify(framingOptions(optionsJson(fd, DEFAULT_FRAMING_OPTIONS)))
                : null;
  // "Do all windows use the same cost code?" — answered on the form, remembered for next time.
  await saveCodeRulesFromForm(fd);
  if (type === "WALL" && options) await rememberItems(options);
  // Door / window trim goes on the Item List (Trim) when saved, with its stick length.
  const trim: [string, number, TrimUse | null][] = [];
  if (type === "DOOR" && options) {
    const o = JSON.parse(options) as DoorOptions;
    if (o.casingSides > 0) trim.push([o.casingItem, o.casingStickFt, "casing"], [o.headItem, o.headStickFt, "casing"]);
  }
  if (type === "WINDOW" && options) {
    const o = JSON.parse(options) as WindowOptions;
    trim.push(
      [o.casingItem, o.casingStickFt, "casing"],
      [o.headItem, o.headStickFt, "casing"],
      [o.liningItem, o.liningStickFt, "lining"],
      [WINDOW_STOOL_ITEM, o.stoolStickFt, null],
      [o.apronItem, o.apronStickFt, "apron"],
    );
  }
  for (const [item, stick, use] of trim) await rememberCasing(item, stick, use);
  return {
    name,
    type,
    memberSizeId: size?.id ?? null,
    options,
    memberSize: size?.name ?? null,
    spanTableId,
    stockLengths: isMemberType(type) || type === "OPENING" ? (stockLengths?.slice(0, 120) ?? null) : null,
    // Joists/rafters: least waste, cheapest, or one board length.
    packMode: type === "FRAMING" ? pack : "WASTE",
    packLength: type === "FRAMING" && pack === "LENGTH" ? packLengthFt : null,
    metric: isMetricFor(type, metricRaw) ? metricRaw : DEFAULT_METRIC[type],
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : CONDITION_COLORS[0],
    group: str(fd, "group") || "Takeoff",
    referenceOnly: boolField(fd, "referenceOnly"),
    costCodeId,
    unitCost: Math.max(0, numField(fd, "unitCost", 0)),
    wastePct: Math.max(0, numField(fd, "wastePct", 0)),
    pitch: type === "BEAM" ? 0 : Math.max(0, numField(fd, "pitch", 0)),
    // Hips & valleys have their own condition type now; Linear pitch is always the common slope.
    pitchMode: "COMMON",
    // Hips & valleys: the other roof plane's pitch; blank = same as side 1.
    pitch2: type === "HIP_VALLEY" && str(fd, "pitch2") !== "" ? Math.max(0, numField(fd, "pitch2", 0)) : null,
    height: Math.max(0, numField(fd, "height", 0)),
    depth: Math.max(0, numField(fd, "depth", 0)),
    spacing: Math.max(1, numField(fd, "spacing", 16)),
    overhang: type === "BEAM" ? 0 : Math.max(0, numField(fd, "overhang", 0)),
  };
}

/**
 * Walls / openings settings from "opt_<key>" fields, typed by the defaults:
 * numbers (≥ 0), checkboxes, and text. Missing fields keep the default.
 */
function optionsJson<T extends Record<string, unknown>>(fd: FormData, defaults: T) {
  const out: Record<string, unknown> = {};
  for (const [k, d] of Object.entries(defaults)) {
    const name = `opt_${k}`;
    if (typeof d === "boolean") out[k] = boolField(fd, name);
    else if (!fd.has(name)) out[k] = d;
    else if (typeof d === "number") out[k] = Math.max(0, numField(fd, name, d));
    else out[k] = str(fd, name).replace(/\s+/g, " ").slice(0, 120);
  }
  return JSON.stringify(out);
}

/** Walls: the sheet goods' names carry the sheet size picked ('1/2" Drywall 4x8' on 4x12 sheets → '… 4x12'). */
function wallOptions(fd: FormData) {
  const o = JSON.parse(optionsJson(fd, DEFAULT_WALL_OPTIONS)) as WallOptions;
  o.sheathingItem = withSheetSize(o.sheathingItem, o.sheathingSheet);
  o.drywallItem = withSheetSize(o.drywallItem, o.drywallSheet);
  return JSON.stringify(o);
}

/**
 * Adds the sheathing, drywall or baseboard a wall names to the Item List (under
 * that category) as soon as it's saved, so it's in the picker next time — not only
 * once walls are drawn with it.
 */
async function rememberItems(json: string) {
  const wanted: { name: string; kind: ItemKind; unit: string; use?: TrimUse }[] = [];
  const o = JSON.parse(json) as WallOptions;
  if (o.sheathingSides > 0 && o.sheathingItem.trim()) wanted.push({ name: o.sheathingItem.trim(), kind: "sheathing", unit: "ea" });
  if (o.drywallSides > 0 && o.drywallItem.trim()) wanted.push({ name: o.drywallItem.trim(), kind: "drywall", unit: "ea" });
  if (o.baseItem.trim()) wanted.push({ name: o.baseItem.trim(), kind: "trim", unit: "lf", use: "base" });
  if (!wanted.length) return;
  for (const w of wanted) {
    const nameKey = itemNameKey(w.name);
    const existing = await db.materialItem.findFirst({ where: { nameKey }, select: { id: true, trimUses: true } });
    if (existing) {
      // Picked (or typed) in the Baseboard box: listed there from now on.
      if (w.use && !existing.trimUses.includes(w.use)) await db.materialItem.update({ where: { id: existing.id }, data: { trimUses: { push: w.use } } });
      continue;
    }
    // Only a used baseboard goes on the list; one just sitting in the box (no sides) waits.
    if (w.use && o.baseSides === 0) continue;
    const place = await newItemPlacement(w.kind);
    await db.materialItem.create({
      data: {
        name: w.name,
        nameKey,
        category: place.category,
        kind: place.kind,
        unit: w.unit,
        unitCost: 0,
        roundUp: w.unit === "ea",
        costCodeId: place.costCodeId,
        trimUses: w.use ? [w.use] : [],
      },
    });
  }
}

/**
 * A Doors / Windows takeoff's trim goes on the Item List (as trim) when saved, with its stick
 * length — listed from then on in the box it was picked in (`use`: casing, apron, lining).
 */
async function rememberCasing(item: string, stickFt: number, use: TrimUse | null) {
  const name = item.trim();
  if (!name) return;
  const nameKey = itemNameKey(name);
  const existing = await db.materialItem.findFirst({ where: { nameKey }, select: { id: true, lengthFt: true, trimUses: true } });
  if (existing) {
    const data: { lengthFt?: number; trimUses?: { push: string } } = {};
    if (!existing.lengthFt && stickFt > 0) data.lengthFt = stickFt;
    if (use && !existing.trimUses.includes(use)) data.trimUses = { push: use };
    if (Object.keys(data).length) await db.materialItem.update({ where: { id: existing.id }, data });
    return;
  }
  const sticks = stickFt > 0;
  const place = await newItemPlacement("trim");
  await db.materialItem.create({
    data: {
      name,
      nameKey,
      category: place.category,
      kind: place.kind,
      unit: sticks ? "ea" : "lf",
      roundUp: sticks,
      unitCost: 0,
      costCodeId: place.costCodeId,
      lengthFt: sticks ? stickFt : null,
      trimUses: use ? [use] : [],
    },
  });
}

export async function assemblyFields(fd: FormData, conditionType: string) {
  const description = str(fd, "description");
  if (!description) throw new Error("Description is required");
  const metric = str(fd, "metric");
  if (!isMetricFor(conditionType, metric)) throw new Error("Pick a quantity this takeoff measures");
  const unit = str(fd, "unit");
  const costCodeId = strOrNull(fd, "costCodeId");
  if (costCodeId && !(await db.costCode.findUnique({ where: { id: costCodeId }, select: { id: true } }))) throw new Error("Cost code not found");
  return {
    description,
    costCodeId,
    metric,
    qty: Math.max(0, numField(fd, "qty", 1)),
    per: Math.max(0.0001, numField(fd, "per", 1)),
    unit: (UNITS as readonly string[]).includes(unit) ? unit : "ea",
    roundUp: boolField(fd, "roundUp"),
    wastePct: Math.max(0, numField(fd, "wastePct", 0)),
    unitCost: Math.max(0, numField(fd, "unitCost", 0)),
  };
}

export type AssemblyFields = Awaited<ReturnType<typeof assemblyFields>>;
