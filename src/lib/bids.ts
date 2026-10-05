import "server-only";
import { db } from "./db";
import { buildMaterialList, type MaterialLine } from "./takeoff-materials";
import { DEFAULT_STOCK_LENGTHS, itemNameKey, lumberItemName, parseStockLengths } from "./takeoff";
import { loadConditions } from "./takeoff-data";
export { bidLineFor, bidWorkbook, parsePrice, readBidWorkbook, type ReturnedLine } from "./bid-file";
import { bidLineFor } from "./bid-file";

/**
 * Bids: the job's Material list, by cost code, sent to vendors as an Excel file they
 * price and send back. Each returned file is matched line by line (a hidden line id),
 * compared at today's quantities, and the bid you take per cost code sets the prices
 * — this job only, or the Item List for every job.
 */

/** A re-bid this much over the bid you took (same items, today's quantities) gets a warning. */
export const OVER_WARNING = 0.1;

/** Price list lines (the price ladder): other lengths of a lumber size, priced per board, no quantity. */
export const LADDER_PREFIX = "ladder:";
export const isLadderLine = (l: { key: string }) => l.key.startsWith(LADDER_PREFIX);

/** The Material list lines worth bidding (something to buy), with their cost codes. */
export async function biddableLines(projectId: string) {
  const { lines } = await buildMaterialList(projectId);
  return lines.filter((l) => l.quantity > 0);
}

/** Cost codes on the Material list: how many items each, and what they cost the job now. */
export function codeGroups(lines: MaterialLine[]) {
  const groups = new Map<string, { codeKey: string; codeLabel: string; count: number; extended: number }>();
  for (const l of lines) {
    const g = groups.get(l.codeKey) ?? { codeKey: l.codeKey, codeLabel: l.codeLabel, count: 0, extended: 0 };
    g.count++;
    g.extended += l.extended;
    groups.set(l.codeKey, g);
  }
  return Array.from(groups.values()).sort((a, b) => (a.codeKey === "none" ? 1 : b.codeKey === "none" ? -1 : a.codeLabel.localeCompare(b.codeLabel, undefined, { numeric: true })));
}

// --- The price ladder ------------------------------------------------------------

export type PriceLadder = {
  size: string; // "2x6"
  lengths: number[]; // every stock length you buy it in
  itemKeys: string[]; // its Material list lines (sending any of them sends the ladder)
};

/**
 * For each stock-length lumber size on the job's joists and rafters: every stock length
 * it comes in. A bid asks a price on all of them (not just the lengths the takeoff uses
 * today), so Cheapest packing has real prices to choose between — from the first bid.
 */
export async function priceLadders(projectId: string, lines: MaterialLine[]): Promise<PriceLadder[]> {
  const conditions = await loadConditions(projectId);
  const bySize = new Map<string, { size: string; lengths: Set<number> }>();
  for (const c of conditions) {
    const size = c.memberSize?.trim();
    if (c.type !== "FRAMING" || c.referenceOnly || !size || (c.memberSizeRef?.soldAs ?? "STOCK") !== "STOCK") continue;
    const k = itemNameKey(size);
    const entry = bySize.get(k) ?? { size, lengths: new Set<number>() };
    for (const l of parseStockLengths(c.stockLengths) ?? DEFAULT_STOCK_LENGTHS) entry.lengths.add(l);
    if (c.packLength && c.packLength > 0) entry.lengths.add(c.packLength);
    bySize.set(k, entry);
  }
  return Array.from(bySize.values())
    .map(({ size, lengths }) => {
      const sorted = Array.from(lengths).sort((a, b) => a - b);
      const names = new Set(sorted.map((l) => itemNameKey(lumberItemName(size, size, l))));
      return { size, lengths: sorted, itemKeys: lines.filter((l) => names.has(itemNameKey(l.name))).map((l) => l.key) };
    })
    .filter((x) => x.itemKeys.length);
}

/**
 * The price list lines a bid adds for the sizes being sent: each length not already on
 * the bid, no quantity — just a price per board. Filed under the same cost code as the size's lumber.
 */
export async function ladderLines(ladders: PriceLadder[], picked: MaterialLine[]) {
  const pickedNames = new Set(picked.map((l) => itemNameKey(l.name)));
  const out: { key: string; materialItemId: string | null; codeKey: string; codeLabel: string; name: string; unit: string; quantity: number }[] = [];
  for (const lad of ladders) {
    const from = picked.find((l) => lad.itemKeys.includes(l.key));
    if (!from) continue;
    for (const len of lad.lengths) {
      const name = lumberItemName(lad.size, lad.size, len);
      const k = itemNameKey(name);
      if (pickedNames.has(k)) continue;
      out.push({ key: `${LADDER_PREFIX}${k}`, materialItemId: null, codeKey: from.codeKey, codeLabel: from.codeLabel, name, unit: "ea", quantity: 0 });
    }
  }
  const items = out.length
    ? await db.materialItem.findMany({ where: { nameKey: { in: out.map((o) => o.key.slice(LADDER_PREFIX.length)) } }, select: { id: true, nameKey: true } })
    : [];
  for (const o of out) o.materialItemId = items.find((i) => i.nameKey === o.key.slice(LADDER_PREFIX.length))?.id ?? null;
  return out;
}

// --- Comparing --------------------------------------------------------------------

export type BidColumn = { id: string; number: number; vendorName: string; afterLock: boolean; receivedAt: Date | null; status: string };
export type CodeCell = { total: number; priced: number; items: number; substitutes: number };
export type CodeRow = {
  codeKey: string;
  codeLabel: string;
  items: number; // on the Material list now
  current: number; // what the job has now
  cells: Record<string, CodeCell>; // by bid id (received bids that price something here)
  awardBidId: string | null;
  awardScope: string | null;
  awardedAt: Date | null;
  /** Other bids against the one you took (the items both priced, today's quantities): +0.14 = 14% over. */
  versusAward: Record<string, number>;
};

/**
 * Every cost code on the Material list against every bid that came back: each bid's total
 * for the code at today's quantities (lines it didn't price, or items added since, aren't in
 * it — `priced` of `items` says how complete it is), the bid you took, and how later bids
 * compare with it.
 */
export async function bidComparison(projectId: string) {
  const [lines, bids, awards] = await Promise.all([
    biddableLines(projectId),
    db.bid.findMany({ where: { projectId }, orderBy: { number: "asc" }, include: { lines: true } }),
    db.bidAward.findMany({ where: { projectId } }),
  ]);
  const received = bids.filter((b) => b.status === "RECEIVED");
  const rows: CodeRow[] = codeGroups(lines).map((g) => {
    const award = awards.find((a) => a.codeKey === g.codeKey) ?? null;
    const here = lines.filter((l) => l.codeKey === g.codeKey);
    const cells: Record<string, CodeCell> = {};
    for (const b of received) {
      let total = 0;
      let priced = 0;
      let substitutes = 0;
      for (const l of here) {
        const bl = bidLineFor(b.lines, l);
        if (!bl) continue;
        total += l.quantity * bl.unitPrice!;
        priced++;
        if (bl.substitute) substitutes++;
      }
      if (priced) cells[b.id] = { total, priced, items: g.count, substitutes };
    }
    // Other bids against the one you took — over the items both priced, so a partial bid isn't "cheaper".
    const versusAward: Record<string, number> = {};
    const taken = award ? bids.find((b) => b.id === award.bidId) : null;
    if (award && taken) {
      for (const b of received) {
        if (b.id === taken.id) continue;
        let a = 0;
        let n = 0;
        for (const l of here) {
          const tp = bidLineFor(taken.lines, l);
          const np = bidLineFor(b.lines, l);
          if (!tp || !np) continue;
          a += l.quantity * tp.unitPrice!;
          n += l.quantity * np.unitPrice!;
        }
        if (a > 0) versusAward[b.id] = n / a - 1;
      }
    }
    return {
      codeKey: g.codeKey,
      codeLabel: g.codeLabel,
      items: g.count,
      current: g.extended,
      cells,
      awardBidId: award?.bidId ?? null,
      awardScope: award?.scope ?? null,
      awardedAt: award?.awardedAt ?? null,
      versusAward,
    };
  });
  const columns: BidColumn[] = received.map((b) => ({ id: b.id, number: b.number, vendorName: b.vendorName, afterLock: b.afterLock, receivedAt: b.receivedAt, status: b.status }));
  return { rows, columns, bids, lines };
}

export type OverWarning = { codeLabel: string; vendorName: string; bidNumber: number; pct: number };

/** Bids that came back after you took one for a cost code, 10%+ over it. */
export function overWarnings(cmp: Awaited<ReturnType<typeof bidComparison>>): OverWarning[] {
  const out: OverWarning[] = [];
  for (const r of cmp.rows)
    for (const [bidId, pct] of Object.entries(r.versusAward)) {
      if (pct < OVER_WARNING - 1e-9) continue;
      const b = cmp.columns.find((c) => c.id === bidId);
      if (b && r.awardedAt && b.receivedAt && b.receivedAt > r.awardedAt) out.push({ codeLabel: r.codeLabel, vendorName: b.vendorName, bidNumber: b.number, pct });
    }
  return out.sort((a, b) => b.pct - a.pct);
}
