import "server-only";
import { db } from "./db";
import { parseMarkupTable, tableTaxPct } from "./markup";
import { divisionCategories } from "./estimate-categories";

/**
 * Send to subs: a sub bids whole trades from the plans — one line per cost code (1 ls), their price for
 * it — instead of a price per Material list item. The plans they see are the job's own files, picked when
 * sending. The one you take for a trade is filed apart from the material bid for the same cost code
 * ("sub:<code id>"), and its price can go straight onto the estimate (the budget).
 */

export const SUB_AWARD = "sub:";
export const subAwardKey = (codeKey: string) => `${SUB_AWARD}${codeKey}`;
/** The cost code an award is for, sub or material ("sub:abc" → "abc"). */
export const awardCode = (codeKey: string) => (codeKey.startsWith(SUB_AWARD) ? codeKey.slice(SUB_AWARD.length) : codeKey);

/** The job's files a sub bid shares (ids, as saved on the bid). */
export function readPlanIds(s: string | null | undefined): string[] {
  try {
    const v = s ? JSON.parse(s) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 100) : [];
  } catch {
    return [];
  }
}

/** Folders a sub can be sent files from — what a sub needs to bid (not photos, contracts or other bids). */
export const PLAN_FOLDERS = ["Plans", "Documents", "Permits"];

/** The job's files to pick from when sending to subs: plans first, newest first — old plan revisions left out. */
export async function planChoices(projectId: string) {
  const files = await db.fileAsset.findMany({
    where: { projectId, folder: { in: PLAN_FOLDERS } },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, folder: true, size: true, createdAt: true, takeoffPlan: { select: { supersededAt: true } } },
  });
  return files
    .filter((f) => !f.takeoffPlan?.supersededAt)
    .sort((a, b) => PLAN_FOLDERS.indexOf(a.folder) - PLAN_FOLDERS.indexOf(b.folder))
    .map((f) => ({ id: f.id, name: f.name, folder: f.folder, size: f.size }));
}

export type SubCell = { total: number; note: string | null };
export type SubRow = { codeKey: string; codeLabel: string; cells: Record<string, SubCell>; awardBidId: string | null; awardScope: string | null };

/** Every trade sent to subs against every sub bid back with a price for it — and the one you took. */
export async function subComparison(projectId: string) {
  const [bids, awards] = await Promise.all([
    db.bid.findMany({ where: { projectId, kind: "SUB" }, orderBy: { number: "asc" }, include: { lines: { orderBy: { sortOrder: "asc" } } } }),
    db.bidAward.findMany({ where: { projectId, codeKey: { startsWith: SUB_AWARD } } }),
  ]);
  const received = bids.filter((b) => b.status === "RECEIVED");
  const rows = new Map<string, SubRow>();
  for (const b of bids)
    for (const l of b.lines) {
      const row = rows.get(l.codeKey) ?? { codeKey: l.codeKey, codeLabel: l.codeLabel, cells: {}, awardBidId: null, awardScope: null };
      if (b.status === "RECEIVED" && l.unitPrice != null) row.cells[b.id] = { total: l.unitPrice * l.quantity, note: l.note };
      rows.set(l.codeKey, row);
    }
  for (const a of awards) {
    const row = rows.get(a.codeKey.slice(SUB_AWARD.length));
    if (row) {
      row.awardBidId = a.bidId;
      row.awardScope = a.scope;
    }
  }
  const columns = received
    .filter((b) => b.lines.some((l) => l.unitPrice != null))
    .map((b) => ({ id: b.id, number: b.number, vendorName: b.vendorName, receivedAt: b.receivedAt, afterLock: b.afterLock }));
  return { rows: Array.from(rows.values()).sort((a, b) => a.codeLabel.localeCompare(b.codeLabel, undefined, { numeric: true })), columns };
}

export type BudgetResult = { ok: true; version: number; line: string; was: number | null } | { ok: false; why: string };

/**
 * A sub's price for a trade, put on the job's estimate (the budget once it's approved) as that cost code's
 * line: your own line with the code if there is one, else the takeoff's line for it, else a new line.
 * The takeoff stops updating that code on this estimate (the sub's price is the number now — undo it on
 * the estimate's line). Only a draft that isn't locked can change: a sent or approved estimate is what
 * the client saw, so it's left alone.
 */
export async function putSubBidOnEstimate(
  projectId: string,
  o: { codeKey: string; codeLabel: string; total: number; vendorName: string; bidNumber: number },
): Promise<BudgetResult> {
  if (o.codeKey === "none") return { ok: false, why: "it has no cost code" };
  const est = await db.estimate.findFirst({ where: { projectId, status: "DRAFT" }, orderBy: { version: "desc" }, include: { items: true, specs: true } });
  if (!est) {
    const any = await db.estimate.findFirst({ where: { projectId }, orderBy: { version: "desc" }, select: { status: true } });
    return {
      ok: false,
      why: any
        ? `the estimate is ${any.status === "APPROVED" ? "approved" : "sent"} — it only changes by a new version or a change order`
        : "the job has no estimate yet",
    };
  }
  if (est.lockedAt) return { ok: false, why: `estimate v${est.version} is locked — unlock it, then take the bid again` };
  const code = await db.costCode.findUnique({ where: { id: o.codeKey }, select: { id: true, name: true, division: true } });
  if (!code) return { ok: false, why: "that cost code isn't on your list any more" };
  const rollKey = `code:${code.id}`;
  const lines = est.items.filter((i) => i.costCodeId === code.id).sort((a, b) => a.sortOrder - b.sortOrder);
  const own = lines.find((i) => !i.takeoffRollup && !i.takeoffConditionId) ?? lines.find((i) => i.takeoffRollup === rollKey);
  const source = `${o.vendorName} (Bid #${o.bidNumber})`;
  const total = Math.round(o.total * 100) / 100;
  if (own) {
    const was = Math.round(own.quantity * own.unitCost * 100) / 100;
    // Your own line takes the price: a separate takeoff line for the same code would count it twice.
    const extra = lines.find((i) => i.id !== own.id && i.takeoffRollup === rollKey);
    if (extra) {
      if (extra.description.startsWith("From takeoff")) await db.estimateItem.delete({ where: { id: extra.id } });
      else await db.estimateItem.update({ where: { id: extra.id }, data: { unitCost: 0, takeoffRollup: null, takeoffSnapshot: null } });
    }
    await db.estimateItem.update({
      where: { id: own.id },
      data: {
        quantity: 1,
        unit: "ls",
        unitCost: total,
        qtyFormula: null,
        costFormula: null,
        costType: "SUBCONTRACTOR",
        // Off the takeoff for this code: the sub's price stays.
        takeoffRollup: null,
        takeoffSnapshot: null,
        takeoffStopped: rollKey,
        description: own.takeoffRollup ? `${code.name} — ${source}` : own.description,
      },
    });
    return { ok: true, version: est.version, line: own.takeoffRollup ? `${code.name} — ${source}` : own.description, was };
  }
  const filing = await divisionCategories();
  const category = filing.map[code.division] ?? "General";
  let sortOrder = Math.max(-1, ...est.items.map((i) => i.sortOrder), ...est.specs.map((s) => s.sortOrder)) + 1;
  const spec =
    est.specs.find((s) => s.name.trim().toLowerCase() === code.name.trim().toLowerCase()) ??
    (await db.estimateSpec.create({ data: { estimateId: est.id, name: code.name, category, sortOrder: sortOrder++ } }));
  const description = `${code.name} — ${source}`;
  await db.estimateItem.create({
    data: {
      estimateId: est.id,
      specId: spec.id,
      group: spec.category,
      isAllowance: spec.isAllowance,
      costCodeId: code.id,
      description,
      quantity: 1,
      unit: "ls",
      unitCost: total,
      markupPct: est.defaultMarkup,
      costType: "SUBCONTRACTOR",
      taxPct: tableTaxPct(parseMarkupTable(est.markupTable, est.defaultMarkup), "SUBCONTRACTOR"),
      takeoffStopped: rollKey,
      sortOrder: sortOrder++,
    },
  });
  return { ok: true, version: est.version, line: description, was: null };
}
