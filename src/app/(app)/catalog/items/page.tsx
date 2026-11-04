import Link from "@/components/link";
import { BookOpen, Plus, Truck } from "lucide-react";
import { db } from "@/lib/db";
import { activeCostCodes } from "@/lib/projects";
import { UNITS } from "@/lib/constants";
import { cn, costCodeLabel } from "@/lib/utils";
import { EmptyState, SubmitButton } from "@/components/ui";
import { FilterChip } from "@/components/ui/filter-chip";
import { ListFind } from "@/components/list-find";
import { createMaterialItem, updateMaterialItem } from "./actions";
import { ItemTable } from "./item-table";
import { ProgramItems } from "./program-items";
import { groupOf, itemKind, type CodeGroup } from "@/lib/code-groups";
import { loadCodeRules } from "@/lib/item-codes";
import { requireView } from "@/lib/auth";
import { isStale, recheckOf, staleNote } from "@/lib/price-recheck";
import { duplicatePairs } from "@/lib/unit-parts";
import { namePairs } from "@/lib/item-duplicates";
import { loadUnitParts } from "@/lib/unit-parts-server";

type ItemValues = {
  id: string;
  name: string;
  category: string;
  unit: string;
  unitCost: number;
  wastePct: number;
  roundUp: boolean;
  costCodeId: string | null;
  vendor: string | null;
  sku: string | null;
  notes: string | null;
  widthIn: number | null;
  heightIn: number | null;
  exterior: boolean | null;
  style: string | null;
  lengthFt: number | null;
};

const box = "input !h-7 !py-0 text-xs";
const lbl = "mb-0.5 block text-[11px] text-slate-500";

/**
 * Adding or changing one item: two short lines of boxes (name, category, code, unit, price; then waste, SKU, vendor,
 * notes, round up), and "Size and length…" for doors, windows and trim. Cancel is at the top.
 */
function ItemForm({
  action,
  values,
  categories,
  costCodes,
  returnTo,
}: {
  action: (fd: FormData) => Promise<void>;
  values?: ItemValues;
  categories: string[];
  costCodes: { id: string; code: string | null; name: string }[];
  returnTo: string;
}) {
  const p = (k: string) => `item-${values?.id ?? "new"}-${k}`;
  const sized = !!(values?.widthIn || values?.heightIn || values?.lengthFt || values?.style || values?.exterior != null);
  return (
    <form action={action} className="space-y-2">
      {values ? <input type="hidden" name="id" value={values.id} /> : null}
      <input type="hidden" name="returnTo" value={returnTo} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900">{values ? `Edit ${values.name}` : "Add an item"}</span>
        <Link href={returnTo} scroll={false} className="text-xs font-medium text-blue-700 hover:underline">
          Cancel
        </Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-[2fr_1fr_1.4fr_5rem_6rem]">
        <label>
          <span className={lbl}>Name</span>
          <input id={p("name")} name="name" required autoFocus={!values} className={box} defaultValue={values?.name} placeholder="Window 3050 SH vinyl" />
        </label>
        <label>
          <span className={lbl}>Category</span>
          <input name="category" list={p("cats")} className={box} defaultValue={values?.category ?? ""} placeholder="Windows" />
          <datalist id={p("cats")}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label>
          <span className={lbl}>Cost code</span>
          <select name="costCodeId" className={box} defaultValue={values?.costCodeId ?? ""}>
            <option value="">—</option>
            {costCodes.map((c) => (
              <option key={c.id} value={c.id}>
                {costCodeLabel(c)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={lbl}>Unit</span>
          <select name="unit" className={box} defaultValue={values?.unit ?? "ea"}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={lbl}>Unit cost</span>
          <input name="unitCost" inputMode="decimal" className={cn(box, "text-right")} defaultValue={values?.unitCost ?? 0} />
        </label>
      </div>
      <div className="grid items-end gap-2 sm:grid-cols-2 md:grid-cols-[5rem_1fr_1.4fr_2fr_auto]">
        <label>
          <span className={lbl}>Waste %</span>
          <input name="wastePct" inputMode="decimal" className={cn(box, "text-right")} defaultValue={values?.wastePct ?? 0} />
        </label>
        <label>
          <span className={lbl}>SKU / part #</span>
          <input name="sku" className={box} defaultValue={values?.sku ?? ""} />
        </label>
        <label>
          <span className={lbl}>Vendor</span>
          <input name="vendor" list="vendor-names" className={box} defaultValue={values?.vendor ?? ""} autoComplete="off" />
        </label>
        <label>
          <span className={lbl}>Notes</span>
          <input name="notes" className={box} defaultValue={values?.notes ?? ""} />
        </label>
        <label className="flex h-7 items-center gap-1.5 whitespace-nowrap text-xs text-slate-700" title="Sold whole: sheets, bags, units">
          <input type="checkbox" name="roundUp" defaultChecked={values?.roundUp ?? false} className="h-4 w-4 rounded border-slate-300" />
          Round up
        </label>
      </div>
      <details className="group" open={sized}>
        <summary className="cursor-pointer list-none text-xs font-medium text-blue-700 hover:underline [&::-webkit-details-marker]:hidden">Size and length…</summary>
        <p className="mt-1 text-xs text-slate-500">
          Doors and windows: in the <strong>Doors</strong> or <strong>Windows</strong> category with a width and height, so they can be picked on the plan. Trim: the length one
          piece comes in, so it&apos;s ordered in whole sticks.
        </p>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-3 md:grid-cols-5">
          <label>
            <span className={lbl}>Width (in)</span>
            <input name="widthIn" inputMode="decimal" className={box} defaultValue={values?.widthIn ?? ""} placeholder="32 for 2'8&quot;" />
          </label>
          <label>
            <span className={lbl}>Height (in)</span>
            <input name="heightIn" inputMode="decimal" className={box} defaultValue={values?.heightIn ?? ""} placeholder="80 for 6'8&quot;" />
          </label>
          <label>
            <span className={lbl}>Interior / exterior</span>
            <select name="exterior" className={box} defaultValue={values?.exterior == null ? "" : values.exterior ? "1" : "0"}>
              <option value="">—</option>
              <option value="0">Interior</option>
              <option value="1">Exterior</option>
            </select>
          </label>
          <label>
            <span className={lbl}>Window type</span>
            <input name="style" className={box} defaultValue={values?.style ?? ""} placeholder="Single hung" />
          </label>
          <label>
            <span className={lbl}>Piece length (ft)</span>
            <input name="lengthFt" inputMode="decimal" className={box} defaultValue={values?.lengthFt ?? ""} placeholder="7 or 16" />
          </label>
        </div>
      </details>
      <div>
        <SubmitButton size="sm" className="!h-7 !px-2.5 !text-xs">
          {values ? "Save item" : "Add item"}
        </SubmitButton>
      </div>
    </form>
  );
}

export default async function ItemListPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; edit?: string; nocode?: string; unpriced?: string; recheck?: string; add?: string; setup?: string; rename?: string }>;
}) {
  await requireView("lists");
  const { category, edit, nocode, unpriced, recheck, add, setup, rename } = await searchParams;
  // Items still at $0: new ones (added by a takeoff, or the starter lumber) waiting for a price.
  const noPrice = unpriced === "1";
  const noCode = nocode === "1";
  // Prices past their cost code's recheck time (Settings → Cost codes).
  const toRecheck = recheck === "1";
  const [all, costCodes, rules, vendors, doorParts, windowParts] = await Promise.all([
    db.materialItem.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: { costCode: { select: { code: true, name: true, priceRecheckEvery: true, priceRecheckUnit: true } }, _count: { select: { assemblyItems: true } } },
    }),
    activeCostCodes(),
    loadCodeRules(),
    db.vendor.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
    loadUnitParts("door"),
    loadUnitParts("window"),
  ]);
  // Items that could be one thing under two names (misspellings, sizes written two ways…), and doors /
  // windows from before they were picked from parts.
  const notSame = [...doorParts.notSame, ...windowParts.notSame];
  const duplicates = namePairs(all, notSame).length + duplicatePairs(all, (k) => (k === "door" ? doorParts.parts : windowParts.parts), notSame).length;
  const categories = Array.from(new Set(all.map((i) => i.category))).sort();
  const now = new Date();
  const staleById = new Map(
    all.flatMap((i) => {
      const r = recheckOf(i.costCode);
      return r && isStale(i, r, now) ? [[i.id, staleNote(i.priceCheckedAt, r, costCodeLabel(i.costCode!, " "))] as const] : [];
    }),
  );
  const items = all.filter((i) => (!category || i.category === category) && (!noCode || !i.costCodeId) && (!noPrice || !(i.unitCost > 0)) && (!toRecheck || staleById.has(i.id)));
  const missing = all.filter((i) => !i.costCodeId).length;
  const unpricedCount = all.filter((i) => !(i.unitCost > 0)).length;
  const listHref = (o: { category?: string | null; noCode?: boolean; noPrice?: boolean; recheck?: boolean; extra?: string }) => {
    const sp = new URLSearchParams();
    const cat = o.category === undefined ? category : o.category;
    if (cat) sp.set("category", cat);
    if (o.noCode ?? noCode) sp.set("nocode", "1");
    if (o.noPrice ?? noPrice) sp.set("unpriced", "1");
    if (o.recheck ?? toRecheck) sp.set("recheck", "1");
    if (o.extra) sp.set(o.extra, "1");
    const s = sp.toString();
    return s ? `/catalog/items?${s}` : "/catalog/items";
  };
  const returnTo = listHref({});
  const editing = edit ? items.find((i) => i.id === edit) : undefined;
  // Nothing on the list yet: the Add box is open to start.
  const adding = add === "1" || all.length === 0;
  // Items the program adds: how many of each kind sit in each category (for "move them too").
  const counts: Partial<Record<CodeGroup, Record<string, number>>> = {};
  for (const i of all) {
    const g = groupOf(itemKind(i), i.exterior);
    if (!g) continue;
    const byCat = (counts[g] ??= {});
    byCat[i.category] = (byCat[i.category] ?? 0) + 1;
  }
  // What still needs attention: amber pills, ahead of the categories. Clicking one again (✕) turns it off.
  const attention = (href: string, on: boolean, label: string, count: number, title: string) => (
    <Link
      href={href}
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        on ? "border-amber-600 bg-amber-600 text-white" : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100",
      )}
    >
      {on ? "✕ " : ""}
      {label}
      <span className={cn("rounded-full px-1.5 text-[10px]", on ? "bg-amber-700" : "bg-amber-100")}>{count}</span>
    </Link>
  );

  return (
    <div className="space-y-3">
      {/* Vendor boxes suggest your vendors as you type; a new name joins the vendor list. */}
      <datalist id="vendor-names">
        {vendors.map((v) => (
          <option key={v.name} value={v.name} />
        ))}
      </datalist>

      <ProgramItems
        open={setup === "1"}
        openHref={`${listHref({ extra: "setup" })}#program-items`}
        closeHref={returnTo}
        rules={rules}
        categories={categories}
        costCodes={costCodes.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
        counts={counts}
      />

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
          <ListFind listId="item-list" placeholder="Find an item, SKU or vendor…" />
          <span className="flex items-center gap-2">
            <Link
              href="/catalog/items/vendor"
              title="Send part of the Item List to a vendor for prices — yours never print"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Truck className="h-3.5 w-3.5" /> For a vendor…
            </Link>
            <Link
              href={listHref({ extra: "add" })}
              scroll={false}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-blue-700 px-2.5 text-xs font-medium text-white hover:bg-blue-800"
            >
              <Plus className="h-3.5 w-3.5" /> Add item
            </Link>
          </span>
        </header>
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-4 py-2">
          {missing || noCode ? attention(listHref({ noCode: !noCode }), noCode, "No cost code", missing, "Items with no cost code") : null}
          {unpricedCount || noPrice ? attention(listHref({ noPrice: !noPrice }), noPrice, "Needs a price", unpricedCount, "Items still at $0 — give them your price") : null}
          {duplicates
            ? attention("/catalog/items/duplicates", false, "Possible duplicates", duplicates, "Items that could be the same thing under two names — merge them, or mark them not the same")
            : null}
          {staleById.size || toRecheck
            ? attention(listHref({ recheck: !toRecheck }), toRecheck, "Price to recheck", staleById.size, "Prices past their cost code's recheck time — check them with your supplier")
            : null}
          <FilterChip href={listHref({ category: null })} active={!category} label="All" count={all.length} />
          {categories.map((c) => (
            <FilterChip key={c} href={listHref({ category: c })} active={category === c} label={c} count={all.filter((i) => i.category === c).length} />
          ))}
        </div>
        {adding ? (
          <div className="border-b border-slate-100 bg-blue-50/40 px-4 py-3">
            <ItemForm action={createMaterialItem} categories={categories} costCodes={costCodes} returnTo={returnTo} />
          </div>
        ) : null}
        <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
          A price changed here goes to every job (items kept at &ldquo;This job only&rdquo; keep theirs). Sent and approved estimates don&apos;t change, and what each job
          was bid at is kept in its Files → Bid snapshots.
          Items typed into a takeoff that aren&apos;t here yet are added by themselves.
        </p>

        {items.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={all.length ? "No matching items" : "No items yet"}
            description="Add items here, or type a new item into a takeoff assembly and it will be saved to this list."
          />
        ) : (
          <div id="item-list">
            <ItemTable
              rows={items.map((i) => ({
                id: i.id,
                name: i.name,
                notes: i.notes,
                category: i.category,
                unit: i.unit,
                unitCost: i.unitCost,
                wastePct: i.wastePct,
                roundUp: i.roundUp,
                costCodeId: i.costCodeId,
                sku: i.sku,
                vendor: i.vendor,
                used: i._count.assemblyItems,
                stale: staleById.get(i.id) ?? null,
              }))}
              costCodes={costCodes.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
              returnTo={returnTo}
              categories={categories}
              renameCat={rename && categories.includes(rename) ? rename : undefined}
              editId={editing?.id}
              editForm={editing ? <ItemForm action={updateMaterialItem} values={editing} categories={categories} costCodes={costCodes} returnTo={returnTo} /> : null}
            />
          </div>
        )}
      </section>
    </div>
  );
}
