import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { conditionTotals, loadConditions } from "@/lib/takeoff-data";
import { materialListFrom } from "@/lib/takeoff-materials";
import { CONDITION_TYPE_LABELS, boardFeetPerLf, metricUnit, parseArcs, parsePoints, type ConditionType, type MetricKey } from "@/lib/takeoff";
import { MaterialTable } from "../../_components/material-table";
import { PrintSheets, type PrintSheet } from "./print-sheets";

/**
 * Marked-up plans: chosen sheets with the takeoff drawn on them, a title block and a legend —
 * only the takeoffs showing (?hide= the ones hidden on the plan) — then the Material list and
 * cut sheet for just those takeoffs.
 */
export default async function PrintPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; planId: string }>;
  searchParams: Promise<{ pages?: string; hide?: string }>;
}) {
  await requireStaff();
  const { id, planId } = await params;
  const { pages, hide } = await searchParams;
  const project = await getProject(id);
  const [plan, conditions] = await Promise.all([
    db.takeoffPlan.findFirst({ where: { id: planId, projectId: project.id }, include: { sheets: { orderBy: { pageNumber: "asc" } } } }),
    loadConditions(project.id),
  ]);
  if (!plan) notFound();

  const hidden = new Set((hide ?? "").split(",").filter(Boolean));
  const totals = new Map(conditions.map((c) => [c.id, conditionTotals(c)]));
  // On this plan: takeoffs with shapes here, or with joists handed to them from areas here (span-table sizes).
  const sheetIds = new Set(plan.sheets.map((s) => s.id));
  const onPlan = conditions.filter((c) => c.measurements.some((m) => sheetIds.has(m.sheetId)) || c.bandSplit.extra.some((x) => sheetIds.has(x.sheet.id)));
  const shown = onPlan.filter((c) => !hidden.has(c.id));

  const sheets: PrintSheet[] = plan.sheets.map((sheet) => {
    const shapes = conditions.flatMap((c) =>
      c.measurements
        .filter((m) => m.sheetId === sheet.id)
        .map((m) => ({
          id: m.id,
          conditionId: c.id,
          points: parsePoints(m.points),
          arcs: parseArcs(m.points),
          isDeduction: m.isDeduction,
          angle: m.angle,
          pitch: m.pitch,
          pitch2: m.pitch2,
          height: m.height,
          memberOwners: c.bandSplit.owners.get(m.id),
        })),
    );
    const legend = conditions
      .filter((c) => shapes.some((s) => s.conditionId === c.id) || c.bandSplit.extra.some((x) => x.sheet.id === sheet.id))
      .map((c) => {
        const onSheet = totals.get(c.id)?.bySheet.find((b) => b.sheetId === sheet.id);
        const own = shapes.filter((s) => s.conditionId === c.id).length;
        const handed = c.bandSplit.extra.filter((x) => x.sheet.id === sheet.id).reduce((n, x) => n + x.lengths.length, 0);
        return {
          conditionId: c.id,
          name: c.name,
          color: c.color,
          type: CONDITION_TYPE_LABELS[c.type as ConditionType] ?? c.type,
          quantity: onSheet ? onSheet.metrics[c.metric as MetricKey] : 0,
          unit: metricUnit(c.metric),
          shapes: own,
          joists: handed,
        };
      });
    return {
      id: sheet.id,
      pageNumber: sheet.pageNumber,
      name: sheet.name,
      scaleLabel: sheet.scaleLabel,
      unitsPerFoot: sheet.unitsPerFoot,
      shapes,
      legend,
    };
  });

  // ?pages=3,4 · ?pages=all (every sheet with measurements) · default: the first measured sheet.
  const measured = sheets.filter((s) => s.shapes.length).map((s) => s.pageNumber);
  const requested =
    pages === "all"
      ? measured
      : (pages ?? "")
          .split(",")
          .map(Number)
          .filter((n) => sheets.some((s) => s.pageNumber === n));
  const initial = requested.length ? requested : measured.slice(0, 1).length ? measured.slice(0, 1) : [1];

  // The Material list and cut sheet for just the takeoffs showing (this plan set).
  const materials = materialListFrom(shown, plan.id);

  return (
    <PrintSheets
      projectId={project.id}
      project={{
        number: project.number,
        name: project.name,
        address: [project.address, project.city, project.state].filter(Boolean).join(", "),
      }}
      plan={{ id: plan.id, name: plan.name, kind: plan.kind, fileUrl: `/api/files/${plan.fileId}` }}
      sheets={sheets}
      initialPages={initial}
      onPlan={onPlan.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
      hidden={[...hidden].filter((x) => onPlan.some((c) => c.id === x))}
      conditions={conditions.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        color: c.color,
        metric: c.metric,
        pitch: c.pitch,
        pitchMode: c.pitchMode,
        pitch2: c.pitch2,
        height: c.height,
        depth: c.depth,
        spacing: c.spacing,
        overhang: c.overhang,
        memberSize: c.memberSize,
        stockLengths: c.stockLengths,
        options: c.options,
        memberWidthIn: c.memberSizeRef?.widthIn ?? null,
        boardFeetPerLf: c.memberSizeRef ? boardFeetPerLf(c.memberSizeRef) : null,
        soldAs: c.memberSizeRef?.soldAs ?? null,
      }))}
      materials={
        <section
          key="materials"
          className="print-sheet space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none"
        >
          <div className="flex flex-wrap items-end justify-between gap-2 border-b-2 border-slate-900 pb-1.5">
            <div>
              <p className="text-base font-bold text-slate-900">
                #{project.number} {project.name}
              </p>
              <p className="text-xs text-slate-600">Material list &amp; cut sheet · {plan.name}</p>
            </div>
            <p className="max-w-md text-right text-xs text-slate-600">For the takeoffs printed: {shown.length ? shown.map((c) => c.name).join(", ") : "none"}</p>
          </div>
          <div className="space-y-3">
            <MaterialTable lines={materials.lines} cutLists={materials.cutLists} total={materials.total} showPrices={false} />
          </div>
        </section>
      }
    />
  );
}
