import Link from "next/link";
import { Pencil, Plus, TableProperties } from "lucide-react";
import { db } from "@/lib/db";
import { Collapsible, ConfirmForm, EmptyState, buttonClasses } from "@/components/ui";
import { SPAN_LOADS, SPAN_USES, SPECIES, parseSpanRows } from "@/lib/span-tables";
import { createSpanTable, deleteSpanTable, updateSpanTable } from "./actions";
import { SpanTableForm } from "./span-table-form";

const ftIn = (ft: number) => {
  const inches = Math.round(ft * 12);
  return `${Math.floor(inches / 12)}'${inches % 12 ? `-${inches % 12}"` : ""}`;
};

export default async function SpanTablesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const [tables, sizes] = await Promise.all([
    db.spanTable.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { conditions: true } } } }),
    db.memberSize.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { name: true } }),
  ]);
  const sizeNames = sizes.map((s) => s.name);

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        Let the takeoff pick joist and rafter sizes for you. On a joists / rafters takeoff, choose <strong>Size by span table</strong>: every area you draw gets the size its
        longest span calls for (the longest stretch a joist runs between the walls and beams you traced), and goes into that size&apos;s takeoff (&ldquo;Floor Joists 2x8&rdquo;,
        &ldquo;Floor Joists 2x10&rdquo;). Click an area to pick a different size yourself.
      </p>
      <Collapsible
        defaultOpen={tables.length === 0}
        summary={
          <span className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add span table
          </span>
        }
      >
        <SpanTableForm action={createSpanTable} sizes={sizeNames} />
      </Collapsible>

      {tables.length === 0 ? (
        <EmptyState icon={TableProperties} title="No span tables yet" description="Make your own (up to 12' → 2x6, up to 16' → 2x8…) or use the code's spans." />
      ) : (
        <div className="space-y-3">
          {tables.map((t) => {
            const rows = parseSpanRows(t.rows);
            const values = { id: t.id, name: t.name, use: t.use, source: t.source, species: t.species, load: t.load, rows, overSize: t.overSize };
            return (
              <div key={t.id} id={`table-${t.id}`} className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-4">
                {edit === t.id ? (
                  <SpanTableForm action={updateSpanTable} values={values} sizes={sizeNames} />
                ) : (
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">
                        {t.name} <span className="text-xs font-normal text-slate-500">· {SPAN_USES.find((u) => u.key === t.use)?.label ?? t.use}</span>
                      </p>
                      {t.source === "CODE" ? (
                        <p className="mt-1 text-sm text-slate-600">
                          Code spans · {SPECIES.find((s) => s.key === t.species)?.label ?? t.species} · {SPAN_LOADS.find((l) => l.key === t.load)?.label ?? t.load}
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-slate-600">
                          {rows.map((r, i) => (
                            <span key={i}>
                              {i ? " · " : ""}up to {ftIn(r.upToFt)} → <b>{r.size}</b>
                            </span>
                          ))}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-slate-500">
                        Longer than that: {t.overSize ? <b>{t.overSize}</b> : "you're told (no specialty member set)"} · used by {t._count.conditions} takeoff
                        {t._count.conditions === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Link href={`/settings/span-tables?edit=${t.id}#table-${t.id}`} className={buttonClasses("ghost", "sm")}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Link>
                      <ConfirmForm action={deleteSpanTable} hidden={{ id: t.id }} message={`Delete "${t.name}"? Takeoffs using it keep the sizes they have.`} variant="ghost">
                        <span className="text-xs text-rose-600">Delete</span>
                      </ConfirmForm>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
