import "server-only";
import { db } from "./db";

/**
 * Your estimate divisions (Settings → Estimate divisions): big groups such as
 * "Excavation and Foundation", each holding cost code categories ("2000 Excavation").
 * In the database a division is an EstimateCategory and a cost code category is
 * CostCode.division — the screens use your words.
 */
export async function divisionCategories() {
  const cats = await db.estimateCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { divisions: true } });
  const map: Record<string, string> = {};
  for (const c of cats) for (const d of c.divisions) map[d.division] = c.name;
  return { map, order: cats.map((c) => c.name) };
}

export function loadEstimateCategories() {
  return db.estimateCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { divisions: { orderBy: [{ sortOrder: "asc" }, { division: "asc" }] } },
  });
}

/**
 * Settings learn from an estimate (or template) you just saved: each category named
 * after a cost code category goes in the division it sits in on the estimate
 * ("General" = not placed), and your divisions take the estimate's order. Returns a
 * short note per change ("2100 Footing and Foundation → Excavation and Foundation").
 */
export async function learnDivisions(specs: { name: string; category: string }[]): Promise<string[]> {
  const [cats, codes] = await Promise.all([loadEstimateCategories(), db.costCode.findMany({ select: { division: true }, distinct: ["division"] })]);
  const groups = new Map(codes.map((c) => [c.division.trim().toLowerCase(), c.division]));
  const current = new Map<string, string>();
  for (const c of cats) for (const d of c.divisions) current.set(d.division, c.name);

  const want = new Map<string, string | null>();
  for (const s of specs) {
    const g = groups.get(s.name.trim().toLowerCase());
    if (!g || want.has(g)) continue;
    const div = s.category.trim();
    want.set(g, !div || div === "General" ? null : div);
  }
  const moves = Array.from(want.entries()).filter(([g, div]) => (current.get(g) ?? null) !== div);
  const notes = moves.map(([g, div]) => `${g} → ${div ?? "not in a division"}`);

  // The estimate's order for divisions that hold a cost code category.
  const holding = new Set([...Array.from(want.values()).filter((d): d is string => !!d)]);
  const estOrder: string[] = [];
  for (const s of specs) if (holding.has(s.category.trim()) && !estOrder.includes(s.category.trim())) estOrder.push(s.category.trim());
  const names = cats.map((c) => c.name);
  // A new division goes next to its neighbours on the estimate (before the next one you already have).
  for (const [i, d] of estOrder.entries()) {
    if (names.includes(d)) continue;
    const next = estOrder.slice(i + 1).find((n) => names.includes(n));
    const prev = estOrder
      .slice(0, i)
      .reverse()
      .find((n) => names.includes(n));
    if (next) names.splice(names.indexOf(next), 0, d);
    else if (prev) names.splice(names.indexOf(prev) + 1, 0, d);
    else names.push(d);
  }
  const slots = names.map((n, i) => (estOrder.includes(n) ? i : -1)).filter((i) => i >= 0);
  const reordered = [...names];
  slots.forEach((slot, j) => (reordered[slot] = estOrder[j]));
  const orderChanged = cats.some((c, i) => reordered[i] !== c.name);
  if (!moves.length && !orderChanged) return [];

  await db.$transaction(async (tx) => {
    for (const [g, div] of moves) {
      await tx.estimateCategoryDivision.deleteMany({ where: { division: g } });
      if (!div) continue;
      const cat =
        (await tx.estimateCategory.findUnique({ where: { name: div } })) ?? (await tx.estimateCategory.create({ data: { name: div, sortOrder: reordered.indexOf(div) } }));
      const n = await tx.estimateCategoryDivision.count({ where: { categoryId: cat.id } });
      await tx.estimateCategoryDivision.create({ data: { categoryId: cat.id, division: g, sortOrder: n } });
    }
    for (const [i, name] of reordered.entries()) await tx.estimateCategory.updateMany({ where: { name }, data: { sortOrder: i } });
  });
  return notes.length ? notes : ["Division order updated"];
}
