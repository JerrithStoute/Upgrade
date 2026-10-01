import Link from "next/link";
import { BookOpen, Pencil, Plus, Search } from "lucide-react";
import { db } from "@/lib/db";
import { activeCostCodes } from "@/lib/projects";
import { UNITS } from "@/lib/constants";
import { groupBy } from "@/lib/finance";
import { cn, costCodeLabel, money, num } from "@/lib/utils";
import { Collapsible, ConfirmForm, EmptyState, Field, FormGrid, SubmitButton, TBody, THead, Table, Td, Th, Tr, buttonClasses } from "@/components/ui";
import { createMaterialItem, deleteMaterialItem, updateMaterialItem } from "./actions";

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
          <input id={p("name")} name="name" required className="input" defaultValue={values?.name} placeholder='Window 3050 SH vinyl' />
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
          <input id={p("unitCost")} name="unitCost" type="number" step="0.01" min="0" className="input" defaultValue={values?.unitCost ?? 0} />
        </Field>
        <Field label="Markup %" htmlFor={p("markupPct")}>
          <input id={p("markupPct")} name="markupPct" type="number" step="0.1" className="input" defaultValue={values?.markupPct ?? defaultMarkup} />
        </Field>
        <Field label="Waste %" htmlFor={p("wastePct")}>
          <input id={p("wastePct")} name="wastePct" type="number" step="0.5" min="0" className="input" defaultValue={values?.wastePct ?? 0} />
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

export default async function ItemListPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; edit?: string }> }) {
  const { q = "", category, edit } = await searchParams;
  const [all, costCodes, company] = await Promise.all([
    db.materialItem.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: { costCode: { select: { code: true, name: true } }, _count: { select: { assemblyItems: true } } },
    }),
    activeCostCodes(),
    db.company.findFirst({ select: { defaultMarkup: true } }),
  ]);
  const categories = Array.from(new Set(all.map((i) => i.category))).sort();
  const needle = q.trim().toLowerCase();
  const items = all.filter(
    (i) =>
      (!category || i.category === category) &&
      (!needle || [i.name, i.sku, i.vendor, i.category].some((v) => v?.toLowerCase().includes(needle))),
  );
  const listHref = (o: { category?: string | null }) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    const cat = o.category === undefined ? category : o.category;
    if (cat) sp.set("category", cat);
    const s = sp.toString();
    return s ? `/settings/items?${s}` : "/settings/items";
  };
  const returnTo = listHref({});
  const chip = (active: boolean) =>
    cn("rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset", active ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50");
  const defaultMarkup = company?.defaultMarkup ?? 20;

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        Materials and labor you pick into takeoff assemblies. Items typed into an assembly that aren&apos;t here yet are added automatically. Changing a price here doesn&apos;t
        change jobs already priced — use <strong>Rebid at current prices</strong> on a job&apos;s Takeoff tab for that.
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

      <div className="flex flex-wrap items-center gap-2">
        <form className="relative" action="/settings/items">
          {category ? <input type="hidden" name="category" value={category} /> : null}
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input name="q" defaultValue={q} placeholder="Search name, SKU, vendor" className="input !w-72 !pl-8" aria-label="Search items" />
        </form>
        <Link href={listHref({ category: null })} className={chip(!category)}>
          All · {all.length}
        </Link>
        {categories.map((c) => (
          <Link key={c} href={listHref({ category: c })} className={chip(category === c)}>
            {c} · {all.filter((i) => i.category === c).length}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={BookOpen} title={all.length ? "No matching items" : "No items yet"} description="Add items here, or type a new item into a takeoff assembly and it will be saved to this list." />
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>Item</Th>
              <Th>SKU / vendor</Th>
              <Th>Cost code</Th>
              <Th right>Unit cost</Th>
              <Th right>Markup</Th>
              <Th right>Waste</Th>
              <Th right>Used</Th>
              <Th />
            </tr>
          </THead>
          {groupBy(items, (i) => i.category).map(([cat, rows]) => (
            <TBody key={cat}>
              <tr className="bg-slate-50/70">
                <td colSpan={8} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {cat}
                </td>
              </tr>
              {rows.map((i) =>
                edit === i.id ? (
                  <tr key={i.id} id={`item-${i.id}`}>
                    <td colSpan={8} className="bg-slate-50/50 px-4 py-4">
                      <ItemForm action={updateMaterialItem} values={i} categories={categories} costCodes={costCodes} defaultMarkup={defaultMarkup} returnTo={returnTo} />
                    </td>
                  </tr>
                ) : (
                  <Tr key={i.id}>
                    <Td className="scroll-mt-24">
                      <span id={`item-${i.id}`} className="font-medium text-slate-900">
                        {i.name}
                      </span>
                      {i.notes ? <span className="block text-xs text-slate-500">{i.notes}</span> : null}
                    </Td>
                    <Td className="text-xs text-slate-500">{[i.sku, i.vendor].filter(Boolean).join(" · ") || "—"}</Td>
                    <Td className="text-xs text-slate-500">{i.costCode ? costCodeLabel(i.costCode) : "—"}</Td>
                    <Td right>
                      {money(i.unitCost)}/{i.unit}
                    </Td>
                    <Td right>{num(i.markupPct, 1)}%</Td>
                    <Td right>
                      {num(i.wastePct, 1)}%{i.roundUp ? " ↑" : ""}
                    </Td>
                    <Td right className="text-xs text-slate-500">
                      {i._count.assemblyItems}
                    </Td>
                    <Td right>
                      <div className="flex justify-end gap-1">
                        <Link href={`${returnTo}${returnTo.includes("?") ? "&" : "?"}edit=${i.id}#item-${i.id}`} className={buttonClasses("ghost", "sm")}>
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Link>
                        <ConfirmForm
                          action={deleteMaterialItem}
                          hidden={{ id: i.id, returnTo }}
                          message={`Remove "${i.name}" from the Item List?${i._count.assemblyItems ? ` ${i._count.assemblyItems} assembly item(s) keep their lines and prices but are no longer linked.` : ""}`}
                          variant="ghost"
                        >
                          <span className="text-xs text-rose-600">Delete</span>
                        </ConfirmForm>
                      </div>
                    </Td>
                  </Tr>
                ),
              )}
            </TBody>
          ))}
        </Table>
      )}
    </div>
  );
}
