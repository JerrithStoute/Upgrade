import Link from "@/components/link";
import { Plus, TableProperties } from "lucide-react";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { ConfirmForm, EmptyState } from "@/components/ui";
import { SPAN_LOADS, SPAN_USES, SPECIES, parseSpanRows } from "@/lib/span-tables";
import { createSpanTable, deleteSpanTable, updateSpanTable } from "./actions";
import { SpanTableForm } from "./span-table-form";
import { requireView } from "@/lib/auth";

const PATH = "/catalog/span-tables";
const link = "text-xs font-medium text-blue-700 hover:underline";

const ftIn = (ft: number) => {
  const inches = Math.round(ft * 12);
  return `${Math.floor(inches / 12)}'${inches % 12 ? `-${inches % 12}"` : ""}`;
};

/** The top of an open box: what it is, and Cancel. */
function boxHead(title: string) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="text-sm font-semibold text-slate-900">{title}</span>
      <Link href={PATH} scroll={false} className={link}>
        Cancel
      </Link>
    </div>
  );
}

export default async function SpanTablesPage({ searchParams }: { searchParams: Promise<{ edit?: string; add?: string }> }) {
  await requireView("lists");
  const { edit, add } = await searchParams;
  const [tables, sizes] = await Promise.all([
    db.spanTable.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { conditions: true } } } }),
    db.memberSize.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { name: true } }),
  ]);
  const sizeNames = sizes.map((s) => s.name);
  // Nothing made yet: the Add box is open to start.
  const adding = add === "1" || tables.length === 0;
  const cell = "px-3 py-2 align-top";

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <span className="text-xs text-slate-500">
          {tables.length} table{tables.length === 1 ? "" : "s"}
        </span>
        <Link
          href={`${PATH}?add=1`}
          scroll={false}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-blue-700 px-2.5 text-xs font-medium text-white hover:bg-blue-800"
        >
          <Plus className="h-3.5 w-3.5" /> Add span table
        </Link>
      </header>
      {adding ? (
        <div className="border-b border-slate-100 bg-blue-50/40 px-4 py-3">
          {boxHead("Add a span table")}
          <SpanTableForm action={createSpanTable} sizes={sizeNames} />
        </div>
      ) : null}
      <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
        On a joists or rafters takeoff, pick <strong className="font-medium text-slate-700">Size by span table</strong>: each area gets the size its longest span calls for (the
        longest stretch a joist runs between the walls and beams you traced), in that size&apos;s own takeoff. Click an area to pick a different size yourself.
      </p>

      {tables.length === 0 ? (
        <EmptyState icon={TableProperties} title="No span tables yet" description="Make your own (up to 12' → 2x6, up to 16' → 2x8…) or use the code's spans." />
      ) : (
        <div className="@container overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-100 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 pl-4 font-normal">Table</th>
                <th className="px-3 py-2 font-normal">For</th>
                <th className="px-3 py-2 font-normal">Sizes</th>
                <th className="px-3 py-2 font-normal">Longer than that</th>
                <th className="px-3 py-2 text-right font-normal" title="Takeoffs using it">
                  Used
                </th>
                <th className="px-3 py-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {tables.map((t) => {
                const rows = parseSpanRows(t.rows);
                const values = { id: t.id, name: t.name, use: t.use, source: t.source, species: t.species, load: t.load, rows, overSize: t.overSize };
                return edit === t.id ? (
                  <tr key={t.id} id={`table-${t.id}`} className="scroll-mt-24 border-t border-slate-100 first:border-t-0">
                    <td colSpan={6} className="bg-blue-50/40 p-0">
                      <div className="sticky left-0 w-[100cqw] max-w-full px-4 py-3">
                        {boxHead(`Edit ${t.name}`)}
                        <SpanTableForm action={updateSpanTable} values={values} sizes={sizeNames} />
                        {/* Its own form (no forms inside forms), on Save's line. */}
                        <div className="-mt-7 flex justify-end">
                          <ConfirmForm action={deleteSpanTable} hidden={{ id: t.id }} message={`Delete "${t.name}"? Takeoffs using it keep the sizes they have.`} variant="ghost">
                            <span className="text-xs text-rose-600">Delete table…</span>
                          </ConfirmForm>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id} id={`table-${t.id}`} className="scroll-mt-24 border-t border-slate-100 first:border-t-0 hover:bg-slate-50">
                    <td className={cn(cell, "pl-4 font-medium text-slate-900")}>{t.name}</td>
                    <td className={cn(cell, "text-xs text-slate-600")}>{SPAN_USES.find((u) => u.key === t.use)?.label ?? t.use}</td>
                    <td className={cn(cell, "text-xs text-slate-600")}>
                      {t.source === "CODE"
                        ? `Code spans · ${SPECIES.find((s) => s.key === t.species)?.label ?? t.species} · ${SPAN_LOADS.find((l) => l.key === t.load)?.label ?? t.load}`
                        : rows.map((r, i) => (
                            <span key={i}>
                              {i ? " · " : "up to "}
                              {ftIn(r.upToFt)} → <b className="font-medium text-slate-900">{r.size}</b>
                            </span>
                          ))}
                    </td>
                    <td className={cn(cell, "text-xs text-slate-600")}>{t.overSize || <span className="text-slate-400">— you&apos;re told</span>}</td>
                    <td className={cn(cell, "text-right text-xs tabular-nums text-slate-500")}>{t._count.conditions}</td>
                    <td className={cn(cell, "pr-4 text-right")}>
                      <Link href={`${PATH}?edit=${t.id}#table-${t.id}`} scroll={false} className={link} aria-label={`Edit ${t.name}`}>
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
