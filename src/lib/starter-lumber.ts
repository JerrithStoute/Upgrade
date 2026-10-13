import "server-only";
import { db } from "./db";
import { kindOfLegacyCategory } from "./code-groups";
import { newItemPlacement } from "./item-codes";
import { itemNameKey } from "./takeoff";
import { STARTER_MEMBER_SIZES, starterItems } from "./starter-lumber-data";

/**
 * What a new company starts with (the "common lumber" box at sign-up), so its first takeoffs
 * work right away. Nothing priced — it fills in prices as it goes.
 *
 * - Member sizes: the lumber the takeoffs can pick (2x, TJI, BCI, LVL, glulam).
 * - Item List: only what a first wall takeoff orders — precut studs, plates, treated bottom
 *   plates, sheathing and drywall. Named exactly as the wall takeoff names them, so it finds
 *   them instead of adding its own. Everything else is added the first time a takeoff uses it.
 */

/** Adds the starter member sizes and items to the current company (skips any it already has). */
export async function addStarterLumber() {
  const haveSizes = new Set((await db.memberSize.findMany({ select: { nameKey: true } })).map((s) => s.nameKey));
  let order = 0;
  for (const s of STARTER_MEMBER_SIZES) {
    const nameKey = itemNameKey(s.name);
    if (haveSizes.has(nameKey)) continue;
    await db.memberSize.create({ data: { ...s, nameKey, sortOrder: order++ } });
  }
  const haveItems = new Set((await db.materialItem.findMany({ select: { nameKey: true } })).map((i) => i.nameKey));
  for (const it of starterItems()) {
    const nameKey = itemNameKey(it.name);
    if (haveItems.has(nameKey)) continue;
    const kind = kindOfLegacyCategory(it.category);
    const place = kind ? await newItemPlacement(kind) : { kind: null, category: it.category, costCodeId: null };
    await db.materialItem.create({
      data: {
        name: it.name,
        nameKey,
        category: place.category,
        kind: place.kind,
        unit: it.unit,
        unitCost: 0,
        roundUp: it.unit === "ea",
        costCodeId: place.costCodeId,
        notes: it.notes ?? null,
      },
    });
  }
}
