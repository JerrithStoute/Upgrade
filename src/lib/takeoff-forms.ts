import "server-only";
import { db } from "./db";
import { UNITS } from "./constants";
import { boolField, numField, str, strOrNull } from "./utils";
import { CONDITION_COLORS, CONDITION_TYPES, DEFAULT_METRIC, PITCH_MODES, isMetricFor, parseStockLengths, type ConditionType } from "./takeoff";

/**
 * Form parsing shared by job takeoff conditions and takeoff template conditions,
 * so both editors accept exactly the same fields.
 */
export async function conditionFields(fd: FormData) {
  const name = str(fd, "name");
  if (!name) throw new Error("Condition name is required");
  const typeRaw = str(fd, "type");
  const type: ConditionType = (CONDITION_TYPES as readonly string[]).includes(typeRaw) ? (typeRaw as ConditionType) : "AREA";
  const metricRaw = str(fd, "metric");
  const color = str(fd, "color");
  const pitchMode = str(fd, "pitchMode");
  const costCodeId = strOrNull(fd, "costCodeId");
  if (costCodeId && !(await db.costCode.findUnique({ where: { id: costCodeId }, select: { id: true } }))) throw new Error("Cost code not found");
  const stockLengths = strOrNull(fd, "stockLengths");
  if (stockLengths && !parseStockLengths(stockLengths)) throw new Error("Stock lengths should be feet, e.g. 8, 10, 12 or 8-24");
  const memberSizeId = type === "FRAMING" ? strOrNull(fd, "memberSizeId") : null;
  const size = memberSizeId ? await db.memberSize.findUnique({ where: { id: memberSizeId }, select: { id: true, name: true } }) : null;
  if (memberSizeId && !size) throw new Error("Member size not found");
  return {
    name,
    type,
    memberSizeId: size?.id ?? null,
    memberSize: size?.name ?? null,
    stockLengths: type === "FRAMING" ? (stockLengths?.slice(0, 120) ?? null) : null,
    metric: isMetricFor(type, metricRaw) ? metricRaw : DEFAULT_METRIC[type],
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : CONDITION_COLORS[0],
    group: str(fd, "group") || "Takeoff",
    costCodeId,
    unitCost: Math.max(0, numField(fd, "unitCost", 0)),
    markupPct: numField(fd, "markupPct", 20),
    wastePct: Math.max(0, numField(fd, "wastePct", 0)),
    pitch: Math.max(0, numField(fd, "pitch", 0)),
    pitchMode: (PITCH_MODES as readonly string[]).includes(pitchMode) ? pitchMode : "COMMON",
    height: Math.max(0, numField(fd, "height", 0)),
    depth: Math.max(0, numField(fd, "depth", 0)),
    spacing: Math.max(1, numField(fd, "spacing", 16)),
    overhang: Math.max(0, numField(fd, "overhang", 0)),
  };
}

export async function assemblyFields(fd: FormData, conditionType: string) {
  const description = str(fd, "description");
  if (!description) throw new Error("Description is required");
  const metric = str(fd, "metric");
  if (!isMetricFor(conditionType, metric)) throw new Error("Pick a quantity this condition measures");
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
    markupPct: numField(fd, "markupPct", 20),
  };
}

export type AssemblyFields = Awaited<ReturnType<typeof assemblyFields>>;
