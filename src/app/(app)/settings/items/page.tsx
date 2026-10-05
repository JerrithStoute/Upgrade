import Link from "next/link";
import { BookOpen, Plus, Search, Truck } from "lucide-react";
import { db } from "@/lib/db";
import { activeCostCodes } from "@/lib/projects";
import { UNITS } from "@/lib/constants";
import { cn, costCodeLabel } from "@/lib/utils";
import { Collapsible, EmptyState, Field, FormGrid, SubmitButton, buttonClasses } from "@/components/ui";
import { createMaterialItem, renameItemCategory, updateMaterialItem } from "./actions";
import { ItemTable } from "./item-table";
import { ProgramItems } from "./program-items";
import { groupOf, itemKind, type CodeGroup } from "@/lib/code-groups";
import { loadCodeRules } from "@/lib/item-codes";

type ItemValues = {
  id: string;
  name: string;
  category: string;
  unit: string;
  unitCost: number;
  markupPct: number;
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

function ItemForm({
  action,
  values,
  categories,
  costCodes,
  defaultMarkup,
  returnTo,
}: {
  action: (fd: FormData) => Promise<void>;
  values?: ItemValues;
  categories: string[];
  costCodes: { id: string; code: string | null; name: string }[];
  defaultMarkup: number;
  returnTo: string;
}) {
  const p = (k: string) => `item-${values?.id ?? "new"}-${k}`;
  return (
    <form action={action} className="space-y-4">
      {values ? <input type="hidden" name="id" value={values.id} /> : null}
      <input type="hidden" name="returnTo" value={returnTo} />
      <FormGrid className="md:grid-cols-4">
        <Field label="Name" htmlFor={p("name")} className="md:col-span-2">
          <input id={p("name")} name="name" required className="input" defaultValue={values?.name} placeholder="Window 3050 SH vinyl" />
        </Field>
        <Field label="Category" htmlFor={p("category")}>
          <input id={p("category")} name="category" list={p("cats")} className="input" defaultValue={values?.category ?? ""} placeholder="Windows" />
          <datalist id={p("cats")}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Cost code" htmlFor={p("costCodeId")}>
          <select id={p("costCodeId")} name="costCodeId" className="input" defaultValue={values?.costCodeId ?? ""}>
            <option value="">—</option>
            {costCodes.map((c) => (
              <option key={c.id} value={c.id}>
                {costCodeLabel(c)}
              </option>
            ))}
          </select>
        </Field>
      </FormGrid>
      <FormGrid className="md:grid-cols-6">
        <Field label="Unit" htmlFor={p("unit")}>
          <select id={p("unit")} name="unit" className="input" defaultValue={values?.unit ?? "ea"}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Unit cost" htmlFor={p("unitCost")}>
          <input id={p("unitCost")} name="unitCost" inputMode="decimal" className="input" defaultValue={values?.unitCost ?? 0} />
        </Field>
        <Field label="Markup %" htmlFor={p("markupPct")}>
          <input id={p("markupPct")} name="markupPct" inputMode="decimal" className="input" defaultValue={values?.markupPct ?? defaultMarkup} />
        </Field>
        <Field label="Waste %" htmlFor={p("wastePct")}>
          <input id={p("wastePct")} name="wastePct" inputMode="decimal" className="input" defaultValue={values?.wastePct ?? 0} />
        </Field>
        <Field label="SKU / part #" htmlFor={p("sku")}>
          <input id={p("sku")} name="sku" className="input" defaultValue={values?.sku ?? ""} />
        </Field>
        <Field label="Vendor" htmlFor={p("vendor")}>
          <input id={p("vendor")} name="vendor" className="input" defaultValue={values?.vendor ?? ""} />
        </Field>
      </FormGrid>
      <Field label="Notes" htmlFor={p("notes")}>
        <input id={p("notes")} name="notes" className="input" defaultValue={values?.notes ?? ""} />
      </Field>
      <details className="rounded-lg border border-slate-200 px-3 py-2" open={!!(values?.widthIn || values?.heightIn || values?.lengthFt || values?.style)}>
        <summary className="cursor-pointer text-sm font-medium text-slate-700">Size &amp; length (doors, windows, trim)</summary>
        <p className="mt-1 text-xs text-slate-500">
          Doors and windows: put them in the <strong>Doors</strong> or <strong>Windows</strong> category with a width and height so they can be picked on the plan (windows can have
          a type, e.g. Single hung). Trim: the length one piece comes in, so casing, stools and aprons are ordered in whole sticks.
        </p>
        <FormGrid className="mt-2 md:grid-cols-5">
          <Field label="Width (in)" htmlFor={p("widthIn")} hint="e.g. 32 for a 2'8&quot; door">
            <input id={p("widthIn")} name="widthIn" inputMode="decimal" className="input" defaultValue={values?.widthIn ?? ""} />
          </Field>
          <Field label="Height (in)" htmlFor={p("heightIn")} hint="e.g. 80 for 6'8&quot;">
            <input id={p("heightIn")} name="heightIn" inputMode="decimal" className="input" defaultValue={values?.heightIn ?? ""} />
          </Field>
          <Field label="Interior / exterior" htmlFor={p("exterior")}>
            <select id={p("exterior")} name="exterior" className="input" defaultValue={values?.exterior == null ? "" : values.exterior ? "1" : "0"}>
              <option value="">—</option>
              <option value="0">Interior</option>
              <option value="1">Exterior</option>
            </select>
          </Field>
          <Field label="Type" htmlFor={p("style")} hint="Windows: Single hung, Slider, Fixed…">
            <input id={p("style")} name="style" className="input" defaultValue={values?.style ?? ""} placeholder="Single hung" />
          </Field>
          <Field label="Piece length (ft)" htmlFor={p("lengthFt")} hint="Trim sticks, e.g. 7 or 16">
            <input id={p("lengthFt")} name="lengthFt" inputMode="decimal" className="input" defaultValue={values?.lengthFt ?? ""} />
          </Field>
        </FormGrid>
      </details>
      <div className="flex items-center gap-4">
        <SubmitButton>{values ? "Save item" : "Add item"}</SubmitButton>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="roundUp" defaultChecked={values?.roundUp ?? false} className="h-4 w-4 rounded border-slate-300" />
          Round up quantities (sold whole: sheets, bags, units)
        </label>
        {values ? (
          <Link href={returnTo} className={buttonClasses("ghost")}>
            Cancel
          </Link>
        ) : null}
      </div>
    </form>
  );
}

export default async function ItemListPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; edit?: string; nocode?: string }> }) {
  const { q = "", category, edit, nocode } = await searchParams;
  const noCode = nocode === "1";
  const [all, costCodes, company, rules] = await Promise.all([
    db.materialItem.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: { costCode: { select: { code: true, name: true } }, _count: { select: { assemblyItems: true } } },
    }),
    activeCostCodes(),
    db.company.findFirst({ select: { defaultMarkup: true } }),
    loadCodeRules(),
  ]);
  const categories = Array.from(new Set(all.map((i) => i.category))).sort();
  const needle = q.trim().toLowerCase();
  const items = all.filter(
    (i) =>
      (!category || i.category === category) && (!noCode || !i.costCodeId) && (!needle || [i.name, i.sku, i.vendor, i.category].some((v) => v?.toLowerCase().includes(needle))),
  );
  const missing = all.filter((i) => !i.costCodeId).length;
  const listHref = (o: { category?: string | null; noCode?: boolean }) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    const cat = o.category === undefined ? category : o.category;
    if (cat) sp.set("category", cat);
    if (o.noCode ?? noCode) sp.set("nocode", "1");
    const s = sp.toString();
    return s ? `/settings/items?${s}` : "/settings/items";
  };
  const returnTo = listHref({});
  const chip = (active: boolean) =>
    cn(
      "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset",
      active ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
    );
  const defaultMarkup = company?.defaultMarkup ?? 20;
  const editing = edit ? items.find((i) => i.id === edit) : undefined;
  // Items the program adds: how many of each kind sit in each category (for "move them too").
  const counts: Partial<Record<CodeGroup, Record<string, number>>> = {};
  for (const i of all) {
    const g = groupOf(itemKind(i), i.exterior);
    if (!g) continue;
    const byCat = (counts[g] ??= {});
    byCat[i.category] = (byCat[i.category] ?? 0) + 1;
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        Materials and labor you pick into takeoff assemblies. Items typed into an assembly that aren&apos;t here yet are added automatically. A price changed here goes to every job
        whose prices aren&apos;t locked (their draft estimates update when opened). Locked jobs — any job with an estimate marked sent — keep their prices; bring new ones in with{" "}
        <strong>Price review</strong> on the job.
      </p>

      <Collapsible
        defaultOpen={all.length === 0}
        summary={
          <span className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add item
          </span>
        }
      >
        <ItemForm action={createMaterialItem} categories={categories} costCodes={costCodes} defaultMarkup={defaultMarkup} returnTo={returnTo} />
      </Collapsible>

      <ProgramItems rules={rules} categories={categories} costCodes={costCodes.map((c) => ({ id: c.id, code: c.code, name: c.name }))} counts={counts} />

      <div className="flex flex-wrap items-center gap-2">
        <form className="relative" action="/settings/items">
          {category ? <input type="hidden" name="category" value={category} /> : null}
          {noCode ? <input type="hidden" name="nocode" value="1" /> : null}
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input name="q" defaultValue={q} placeholder="Search name, SKU, vendor" className="input !w-72 !pl-8" aria-label="Search items" />
        </form>
        <Link
          href="/settings/items/vendor"
          className={cn(buttonClasses("secondary", "sm"), "order-last ml-auto")}
          title="Send part of the Item List to a vendor for prices — yours never print"
        >
          <Truck className="h-3.5 w-3.5" /> For a vendor…
        </Link>
        <Link href={listHref({ category: null })} className={chip(!category)}>
          All · {all.length}
        </Link>
        {categories.map((c) => (
          <Link key={c} href={listHref({ category: c })} className={chip(category === c)}>
            {c} · {all.filter((i) => i.category === c).length}
          </Link>
        ))}
        {missing || noCode ? (
          <Link
            href={listHref({ noCode: !noCode })}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset",
              noCode ? "bg-amber-600 text-white ring-amber-600" : "bg-amber-50 text-amber-800 ring-amber-300 hover:bg-amber-100",
            )}
            title="Items with no cost code"
          >
            {noCode ? "✕ " : ""}No cost code · {missing}
          </Link>
        ) : null}
      </div>
      {category && categories.includes(category) ? (
        // Tidy up categories: rename one, or type / pick another to merge it in.
        <form action={renameItemCategory} className="-mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <input type="hidden" name="from" value={category} />
          <span>
            Rename <strong className="text-slate-800">“{category}”</strong> or merge it into another category:
          </span>
          <input
            name="to"
            list="item-categories"
            required
            className="input !h-8 !w-56 !py-1 text-xs"
            placeholder="New name, or pick one to merge into"
            aria-label="Rename or merge into"
          />
          <datalist id="item-categories">
            {categories
              .filter((c) => c !== category)
              .map((c) => (
                <option key={c} value={c} />
              ))}
          </datalist>
          <SubmitButton size="sm" variant="secondary" pendingText="Saving…">
            Rename / merge
          </SubmitButton>
        </form>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={all.length ? "No matching items" : "No items yet"}
          description="Add items here, or type a new item into a takeoff assembly and it will be saved to this list."
        />
      ) : (
        <ItemTable
          rows={items.map((i) => ({
            id: i.id,
            name: i.name,
            notes: i.notes,
            category: i.category,
            unit: i.unit,
            unitCost: i.unitCost,
            markupPct: i.markupPct,
            wastePct: i.wastePct,
            roundUp: i.roundUp,
            costCodeId: i.costCodeId,
            sku: i.sku,
            vendor: i.vendor,
            used: i._count.assemblyItems,
          }))}
          costCodes={costCodes.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
          returnTo={returnTo}
          editId={editing?.id}
          editForm={
            editing ? (
              <ItemForm action={updateMaterialItem} values={editing} categories={categories} costCodes={costCodes} defaultMarkup={defaultMarkup} returnTo={returnTo} />
            ) : null
          }
        />
      )}
    </div>
  );
}
