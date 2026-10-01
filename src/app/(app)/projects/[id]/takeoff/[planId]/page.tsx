import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { conditionTotals, loadConditions } from "@/lib/takeoff-data";
import { boardFeetPerLf, parsePoints, type MetricKey } from "@/lib/takeoff";
import { PlanViewer } from "./_components/plan-viewer";

export default async function PlanViewerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; planId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  await requireStaff();
  const { id, planId } = await params;
  const { page } = await searchParams;
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
          .map((m) => ({ id: m.id, conditionId: c.id, points: parsePoints(m.points), isDeduction: m.isDeduction, angle: m.angle })),
      )}
    />
  );
}
