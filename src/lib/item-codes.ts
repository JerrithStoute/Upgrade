import "server-only";
import { db } from "./db";
import { CODE_GROUPS, CODE_GROUP_KEYS, ITEM_KINDS, groupCategory, groupOf, type CodeGroup, type CodeRules, type ItemKind } from "./code-groups";

/**
 * Older items have no kind yet: tag the ones still under a built-in category name
 * ("Trim", "Doors"…). Once per server start, and harmless to repeat.
 */
let kindsChecked = false;
async function ensureItemKinds() {
  if (kindsChecked) return;
  kindsChecked = true;
  const untagged = await db.materialItem.findMany({ where: { kind: null }, select: { id: true, category: true } });
  // Built-in names ("Trim"), and any category you've chosen for a kind.
  const chosen = await db.itemCodeRule.findMany({ where: { category: { not: null } }, select: { group: true, category: true } });
  const kindOf = (category: string) => {
    const key = category.trim().toLowerCase().replace(/\s+/g, " ");
    const rule = chosen.find((r) => r.category?.trim().toLowerCase() === key && r.group in CODE_GROUPS);
    return rule ? CODE_GROUPS[rule.group as CodeGroup].kind : (ITEM_KINDS as readonly string[]).includes(key) ? key : null;
  };
  for (const kind of ITEM_KINDS) {
    const ids = untagged.filter((i) => kindOf(i.category) === kind).map((i) => i.id);
    if (ids.length) await db.materialItem.updateMany({ where: { id: { in: ids } }, data: { kind } });
  }
}

/** Every remembered answer: which category, and the cost code (or "ask for each"). */
export async function loadCodeRules(): Promise<CodeRules> {
  await ensureItemKinds();
  const rows = await db.itemCodeRule.findMany();
  const out: CodeRules = {};
  for (const r of rows) if (r.group in CODE_GROUPS) out[r.group as CodeGroup] = { sameForAll: r.sameForAll, costCodeId: r.costCodeId, category: r.category };
  return out;
}

/**
 * A new, program-created item of `kind`: the kind to tag it with, the category to
 * file it under (yours, if you chose one) and its cost code (when all of that group
 * share one; otherwise none, and it shows up as needing a code).
 */
export async function newItemPlacement(kind: ItemKind, exterior?: boolean | null) {
  const group = groupOf(kind, exterior)!;
  const rule = await db.itemCodeRule.findUnique({ where: { group } });
  const rules: CodeRules = rule ? { [group]: { sameForAll: rule.sameForAll, costCodeId: rule.costCodeId, category: rule.category } } : {};
  return { kind, category: groupCategory(group, rules), costCodeId: rule?.sameForAll ? rule.costCodeId : null };
}

/** The kind an item you add yourself gets, from the category you file it under (a group's category, or a built-in name). */
export async function kindForCategory(category: string): Promise<ItemKind | null> {
  const key = category.trim().toLowerCase();
  const rules = await loadCodeRules();
  for (const g of CODE_GROUP_KEYS) if (groupCategory(g, rules).trim().toLowerCase() === key) return CODE_GROUPS[g].kind;
  return null;
}

async function validCostCode(id: string) {
  if (!(await db.costCode.findUnique({ where: { id }, select: { id: true } }))) throw new Error("Cost code not found");
  return id;
}

/**
 * Gives items with no cost code this one, and the takeoff lines using those items
 * that have no code either. Codes already set are never changed.
 */
export async function fillBlankCodes(itemIds: string[], costCodeId: string) {
  if (!itemIds.length) return 0;
  const { count } = await db.materialItem.updateMany({ where: { id: { in: itemIds }, costCodeId: null }, data: { costCodeId } });
  await db.takeoffAssemblyItem.updateMany({ where: { materialItemId: { in: itemIds }, costCodeId: null }, data: { costCodeId } });
  return count;
}

/** The Item List items in a group (by kind; doors by interior / exterior). */
async function groupItems(group: CodeGroup) {
  await ensureItemKinds();
  const items = await db.materialItem.findMany({ where: { kind: CODE_GROUPS[group].kind }, select: { id: true, category: true, exterior: true } });
  return items.filter((i) => groupOf(CODE_GROUPS[group].kind, i.exterior) === group);
}

/**
 * Saves one cost code answer. "Same for all" with a code also fills in that group's
 * items (and their takeoff lines) that have no code yet. Returns how many were filled.
 */
export async function saveCodeRule(group: CodeGroup, sameForAll: boolean, costCodeId: string | null) {
  const code = sameForAll && costCodeId ? await validCostCode(costCodeId) : null;
  await db.itemCodeRule.upsert({
    where: { group },
    create: { group, sameForAll, costCodeId: code },
    update: { sameForAll, costCodeId: code },
  });
  return code
    ? fillBlankCodes(
        (await groupItems(group)).map((i) => i.id),
        code,
      )
    : 0;
}

/** How many of a group's items sit in the built-in / previous category (what "move them too" would move). */
export async function movableCount(group: CodeGroup, to: string) {
  const rules = await loadCodeRules();
  const from = new Set([CODE_GROUPS[group].category.toLowerCase(), groupCategory(group, rules).toLowerCase()]);
  return (await groupItems(group)).filter((i) => from.has(i.category.trim().toLowerCase()) && i.category !== to).length;
}

/**
 * Where a group's new items go. With `move`, the group's items still in the
 * built-in category (or the one chosen before) move there too — items you filed
 * somewhere else yourself stay put. Returns how many moved.
 */
export async function saveCategoryRule(group: CodeGroup, category: string | null, move: boolean) {
  const to = category?.trim().replace(/\s+/g, " ") || null;
  const rules = await loadCodeRules();
  const from = new Set([CODE_GROUPS[group].category.toLowerCase(), groupCategory(group, rules).toLowerCase()]);
  await db.itemCodeRule.upsert({
    where: { group },
    // A category answer alone leaves the cost code "not set" (asked later).
    create: { group, category: to, sameForAll: true, costCodeId: null },
    update: { category: to },
  });
  // Your own items already in that category are that kind too (so trim pickers offer them).
  if (to) await db.materialItem.updateMany({ where: { category: to, kind: null }, data: { kind: CODE_GROUPS[group].kind } });
  if (!move || !to) return 0;
  const ids = (await groupItems(group)).filter((i) => from.has(i.category.trim().toLowerCase()) && i.category !== to).map((i) => i.id);
  if (ids.length) await db.materialItem.updateMany({ where: { id: { in: ids } }, data: { category: to } });
  return ids.length;
}

/**
 * The takeoff form's answers: "coderule_<group>" = a cost code id (all the same),
 * "ask" (ask for each new item), or blank (not answered); "catrule_<group>" = the
 * category new items go in (blank = leave as is).
 */
export async function saveCodeRulesFromForm(fd: FormData) {
  for (const group of CODE_GROUP_KEYS) {
    const cat = String(fd.get(`catrule_${group}`) ?? "").trim();
    if (cat) await saveCategoryRule(group, cat, false);
    const v = String(fd.get(`coderule_${group}`) ?? "").trim();
    if (!v) continue;
    if (v === "ask") await saveCodeRule(group, false, null);
    else await saveCodeRule(group, true, v);
  }
}

/** Renames a category (or merges it into another) everywhere: items and the "goes in" answers. */
export async function renameCategory(from: string, to: string) {
  const name = to.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Pick or type a category");
  const { count } = await db.materialItem.updateMany({ where: { category: from }, data: { category: name } });
  // Kinds filed there follow it — including ones still using the built-in name ("Windows" → "4500 Windows").
  const rules = await loadCodeRules();
  for (const g of CODE_GROUP_KEYS)
    if (groupCategory(g, rules).toLowerCase() === from.trim().toLowerCase())
      await db.itemCodeRule.upsert({ where: { group: g }, create: { group: g, category: name, sameForAll: true, costCodeId: null }, update: { category: name } });
  return count;
}

export type ItemNeedingCode = { id: string; name: string; category: string; group: CodeGroup };

/**
 * Program-created items with no cost code. For a job: only the ones its takeoffs
 * use. Everything else on the Item List is the user's own, so it isn't nagged about.
 */
export async function itemsNeedingCodes(projectId?: string): Promise<ItemNeedingCode[]> {
  await ensureItemKinds();
  const used = projectId
    ? {
        OR: [{ assemblyItems: { some: { condition: { projectId } } } }, { measurements: { some: { condition: { projectId } } } }],
      }
    : {};
  const items = await db.materialItem.findMany({
    where: { costCodeId: null, kind: { not: null }, ...used },
    select: { id: true, name: true, category: true, exterior: true, kind: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return items.flatMap((i) => {
    const group = groupOf(i.kind, i.exterior);
    return group ? [{ id: i.id, name: i.name, category: i.category, group }] : [];
  });
}

/** The "needs a cost code" panel: codes per item, and optionally "all of this group use …". */
export async function assignItemCodes(items: { id: string; costCodeId: string }[], rules: { group: CodeGroup; costCodeId: string }[]) {
  let count = 0;
  for (const r of rules) count += await saveCodeRule(r.group, true, r.costCodeId);
  for (const i of items) {
    if (!i.costCodeId) continue;
    count += await fillBlankCodes([i.id], await validCostCode(i.costCodeId));
  }
  return count;
}
