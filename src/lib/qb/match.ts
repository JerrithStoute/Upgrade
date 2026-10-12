/**
 * After a sync reads QuickBooks' lists: what to link, add or rename in The Builder Station.
 * Plain functions (no database) — tested in match.test.ts.
 *
 * - Vendors start in QuickBooks: each active QuickBooks vendor is linked to the vendor of the
 *   same name here, or added; a linked vendor renamed in QuickBooks is renamed here.
 * - Jobs are made by hand on both sides: a job is linked to the Customer:Job of exactly the
 *   same name. Nothing is created. Two of the same name: left for you to pick.
 * - Cost codes: linked to the item named with the code (3720 → item "3720").
 * Links already made (or picked by hand) are kept.
 */

export type QbEntry = { listId: string; name: string; fullName: string; parentListId: string | null; sublevel: number; active: boolean; detail: Record<string, string> };

/** Names compared the way people read them: case, spacing and stray spaces don't matter. */
export const nameKey = (s: string) => s.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

export type VendorPlan = {
  link: { vendorId: string; listId: string }[];
  rename: { vendorId: string; from: string; name: string }[];
  create: { listId: string; name: string; contact: string | null; phone: string | null; email: string | null }[];
};

export function planVendors(qb: QbEntry[], vendors: { id: string; name: string; qbListId: string | null }[]): VendorPlan {
  const plan: VendorPlan = { link: [], rename: [], create: [] };
  const byList = new Map(vendors.filter((v) => v.qbListId).map((v) => [v.qbListId!, v]));
  const unlinked = new Map<string, { id: string; name: string }[]>();
  for (const v of vendors) if (!v.qbListId) unlinked.set(nameKey(v.name), [...(unlinked.get(nameKey(v.name)) ?? []), v]);
  for (const q of qb) {
    const mine = byList.get(q.listId);
    if (mine) {
      // Renamed in QuickBooks: renamed here — unless another vendor here already has that name.
      const clash = vendors.some((v) => v.id !== mine.id && nameKey(v.name) === nameKey(q.name));
      if (mine.name !== q.name && !clash) plan.rename.push({ vendorId: mine.id, from: mine.name, name: q.name });
      continue;
    }
    if (!q.active) continue;
    const same = unlinked.get(nameKey(q.name));
    if (same?.length) {
      const v = same.shift()!;
      plan.link.push({ vendorId: v.id, listId: q.listId });
    } else plan.create.push({ listId: q.listId, name: q.name, contact: q.detail.contact || null, phone: q.detail.phone || null, email: q.detail.email || null });
  }
  return plan;
}

/** The customers a job can be: QuickBooks jobs (under a customer), and customers with no jobs under them. */
export function jobChoices(customers: QbEntry[]) {
  const parents = new Set(customers.map((c) => c.parentListId).filter(Boolean));
  return customers.filter((c) => c.sublevel > 0 || !parents.has(c.listId));
}

export type JobPlan = { link: { projectId: string; listId: string }[]; ambiguous: string[] };

export function planJobs(customers: QbEntry[], projects: { id: string; name: string; qbListId: string | null }[]): JobPlan {
  const plan: JobPlan = { link: [], ambiguous: [] };
  const taken = new Set(projects.map((p) => p.qbListId).filter(Boolean));
  const choices = jobChoices(customers).filter((c) => !taken.has(c.listId));
  for (const p of projects) {
    if (p.qbListId) continue;
    const same = choices.filter((c) => nameKey(c.name) === nameKey(p.name));
    if (same.length === 1) {
      plan.link.push({ projectId: p.id, listId: same[0].listId });
      taken.add(same[0].listId);
      choices.splice(choices.indexOf(same[0]), 1);
    } else if (same.length > 1) plan.ambiguous.push(p.id);
  }
  return plan;
}

/** Item kinds a cost line can be (not groups, subtotals, discounts, payments, sales tax). */
const COSTABLE = new Set(["Service", "Non-inventory", "Other charge", "Inventory", "Assembly"]);
export const costableItem = (i: QbEntry) => COSTABLE.has(i.detail.type ?? "");

export function planCostCodes(items: QbEntry[], codes: { id: string; code: string | null; qbListId: string | null }[]) {
  const link: { costCodeId: string; listId: string }[] = [];
  const taken = new Set(codes.map((c) => c.qbListId).filter(Boolean));
  const byName = new Map<string, QbEntry[]>();
  for (const i of items) if (i.active && costableItem(i) && !taken.has(i.listId)) byName.set(nameKey(i.name), [...(byName.get(nameKey(i.name)) ?? []), i]);
  for (const c of codes) {
    if (c.qbListId || !c.code?.trim()) continue;
    const same = byName.get(nameKey(c.code));
    if (same?.length === 1) {
      link.push({ costCodeId: c.id, listId: same[0].listId });
      byName.delete(nameKey(c.code));
    }
  }
  return { link };
}
