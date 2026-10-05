import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { conditionTotals, loadConditions } from "@/lib/takeoff-data";
import { CONDITION_TYPE_LABELS, boardFeetPerLf, metricUnit, parseArcs, parsePoints, type ConditionType, type MetricKey } from "@/lib/takeoff";
import { PrintSheets, type PrintSheet } from "./print-sheets";

/** Marked-up plans: chosen sheets with the takeoff drawn on them, a title block and a legend. */
export default async function PrintPlanPage({ params, searchParams }: { params: Promise<{ id: string; planId: string }>; searchParams: Promise<{ pages?: string }> }) {
  await requireStaff();
  const { id, planId } = await params;
  const { pages } = await searchParams;
  const project = await getProject(id);
  const [plan, conditions] = await Promise.all([
    db.takeoffPlan.findFirst({ where: { id: planId, projectId: project.id }, include: { sheets: { orderBy: { pageNumber: "asc" } } } }),
    loadConditions(project.id),
  ]);
  if (!plan) notFound();

  const totals = new Map(conditions.map((c) => [c.id, conditionTotals(c)]));
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
        })),
    );
    const legend = conditions
      .filter((c) => shapes.some((s) => s.conditionId === c.id))
      .map((c) => {
        const onSheet = totals.get(c.id)?.bySheet.find((b) => b.sheetId === sheet.id);
        return {
          conditionId: c.id,
          name: c.name,
          color: c.color,
          type: CONDITION_TYPE_LABELS[c.type as ConditionType] ?? c.type,
          quantity: onSheet ? onSheet.metrics[c.metric as MetricKey] : 0,
          unit: metricUnit(c.metric),
          shapes: shapes.filter((s) => s.conditionId === c.id).length,
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
    />
  );
}
