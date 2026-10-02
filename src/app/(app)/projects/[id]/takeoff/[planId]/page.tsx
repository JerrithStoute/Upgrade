import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeCostCodes, getProject } from "@/lib/projects";
import { conditionTotals, loadConditions } from "@/lib/takeoff-data";
import { materialItemOptions } from "@/lib/material-items";
import { CONDITION_COLORS, boardFeetPerLf, parseArcs, parsePoints, type MetricKey } from "@/lib/takeoff";
import { PlanViewer } from "./_components/plan-viewer";

export default async function PlanViewerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; planId: string }>;
  searchParams: Promise<{ page?: string; cond?: string }>;
}) {
  await requireStaff();
  const { id, planId } = await params;
  const { page, cond } = await searchParams;
  const project = await getProject(id);
  const [plan, plans, conditions] = await Promise.all([
    db.takeoffPlan.findFirst({
      where: { id: planId, projectId: project.id },
      include: { sheets: { orderBy: { pageNumber: "asc" }, include: { _count: { select: { measurements: true } } } } },
    }),
    db.takeoffPlan.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
    loadConditions(project.id),
  ]);
  if (!plan) notFound();

  const pageNumber = Math.max(1, Math.min(Number(page) || 1, plan.pageCount ?? Number.MAX_SAFE_INTEGER));
  const sheet = plan.sheets.find((s) => s.pageNumber === pageNumber) ?? null;

  // Condition edit panel (?cond=<id> or ?cond=new): load what its forms need.
  const editing = cond === "new" ? null : (conditions.find((c) => c.id === cond) ?? null);
  let editor = null;
  if (cond === "new" || editing) {
    const [costCodes, memberSizes, items, company] = await Promise.all([
      activeCostCodes(),
      db.memberSize.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, kind: true, soldAs: true, stockLengths: true } }),
      materialItemOptions(),
      db.company.findFirst({ select: { defaultMarkup: true } }),
    ]);
    editor = {
      condition: editing
        ? {
            id: editing.id,
            name: editing.name,
            type: editing.type,
            metric: editing.metric,
            color: editing.color,
            group: editing.group,
            costCodeId: editing.costCodeId,
            unitCost: editing.unitCost,
            markupPct: editing.markupPct,
            wastePct: editing.wastePct,
            pitch: editing.pitch,
            pitchMode: editing.pitchMode,
            pitch2: editing.pitch2,
            height: editing.height,
            depth: editing.depth,
            spacing: editing.spacing,
            overhang: editing.overhang,
            memberSize: editing.memberSize,
            memberSizeId: editing.memberSizeId,
            options: editing.options,
            stockLengths: editing.stockLengths,
            hasMeasurements: editing.measurements.length > 0,
            items: editing.items.map((i) => ({
              id: i.id,
              description: i.description,
              costCodeId: i.costCodeId,
              costCode: i.costCode ? { code: i.costCode.code, name: i.costCode.name } : null,
              metric: i.metric,
              qty: i.qty,
              per: i.per,
              unit: i.unit,
              roundUp: i.roundUp,
              wastePct: i.wastePct,
              unitCost: i.unitCost,
              markupPct: i.markupPct,
            })),
          }
        : null,
      costCodes,
      memberSizes,
      items,
      defaultMarkup: company?.defaultMarkup ?? 20,
      nextColor: CONDITION_COLORS[conditions.length % CONDITION_COLORS.length],
    };
  }

  return (
    <PlanViewer
      projectId={project.id}
      plan={{ id: plan.id, name: plan.name, kind: plan.kind, pageCount: plan.pageCount, fileUrl: `/api/files/${plan.fileId}` }}
      plans={plans}
      pageNumber={pageNumber}
      sheet={sheet ? { id: sheet.id, name: sheet.name, unitsPerFoot: sheet.unitsPerFoot, scaleLabel: sheet.scaleLabel } : null}
      sheets={plan.sheets.map((s) => ({ pageNumber: s.pageNumber, name: s.name, scaled: !!s.unitsPerFoot, count: s._count.measurements }))}
      conditions={conditions.map((c) => {
        const totals = conditionTotals(c);
        const onSheet = totals.bySheet.find((b) => b.sheetId === sheet?.id);
        return {
          id: c.id,
          name: c.name,
          type: c.type,
          color: c.color,
          metric: c.metric,
          unit: totals.unit,
          pitch: c.pitch,
          pitchMode: c.pitchMode,
          pitch2: c.pitch2,
          height: c.height,
          depth: c.depth,
          spacing: c.spacing,
          overhang: c.overhang,
          memberSize: c.memberSize,
          stockLengths: c.stockLengths,
          memberWidthIn: c.memberSizeRef?.widthIn ?? null,
          boardFeetPerLf: c.memberSizeRef ? boardFeetPerLf(c.memberSizeRef) : null,
          soldAs: c.memberSizeRef?.soldAs ?? null,
          total: totals.quantity,
          sheetTotal: onSheet ? onSheet.metrics[c.metric as MetricKey] : 0,
        };
      })}
      measurements={conditions.flatMap((c) =>
        c.measurements
          .filter((m) => m.sheetId === sheet?.id)
          .map((m) => ({
            id: m.id,
            conditionId: c.id,
            points: parsePoints(m.points),
            arcs: parseArcs(m.points),
            isDeduction: m.isDeduction,
            angle: m.angle,
            pitch: m.pitch,
            pitch2: m.pitch2,
          })),
      )}
      editor={editor}
    />
  );
}
