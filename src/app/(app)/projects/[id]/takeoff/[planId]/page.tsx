import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeCostCodes, getProject } from "@/lib/projects";
import { conditionEstimateLines, conditionTotals, jobEstimateLines, loadConditions } from "@/lib/takeoff-data";
import { materialListFrom } from "@/lib/takeoff-materials";
import { linePrice } from "@/lib/utils";
import { materialItemOptions } from "@/lib/material-items";
import { CONDITION_COLORS, boardFeetPerLf, isCountType, metricLabel, parseArcs, parsePoints, type MetricKey } from "@/lib/takeoff";
import { itemsNeedingCodes, loadCodeRules } from "@/lib/item-codes";
import { NeedsCodes } from "../_components/needs-codes";
import { templateOptions } from "@/lib/takeoff-templates";
import { itemKind } from "@/lib/code-groups";
import { PlanViewer } from "./_components/plan-viewer";

export default async function PlanViewerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; planId: string }>;
  searchParams: Promise<{ page?: string; cond?: string; applied?: string; skipped?: string; templateError?: string; toolbox?: string }>;
}) {
  const user = await requireStaff();
  const { id, planId } = await params;
  const { page, cond, applied, skipped, templateError, toolbox } = await searchParams;
  const project = await getProject(id);
  const [plan, plans, conditions, doorItems, costCodes, codeRules, needsCodes, drafts, templates] = await Promise.all([
    db.takeoffPlan.findFirst({
      where: { id: planId, projectId: project.id },
      include: { sheets: { orderBy: { pageNumber: "asc" }, include: { _count: { select: { measurements: true } } } } },
    }),
    db.takeoffPlan.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        revision: true,
        supersededAt: true,
        sheets: { orderBy: { pageNumber: "asc" }, select: { pageNumber: true, name: true, unitsPerFoot: true, _count: { select: { measurements: true } } } },
      },
    }),
    loadConditions(project.id),
    // Doors to pick from: Item List items in the Doors category with a size.
    db.materialItem.findMany({
      where: { widthIn: { not: null }, heightIn: { not: null } },
      select: { id: true, name: true, category: true, kind: true, widthIn: true, heightIn: true, exterior: true, style: true },
    }),
    activeCostCodes(),
    loadCodeRules(),
    itemsNeedingCodes(project.id),
    // For the "⋯ Takeoff" menu: draft estimates to send to, and takeoff templates.
    db.estimate.findMany({ where: { projectId: project.id, status: "DRAFT", lockedAt: null }, orderBy: { version: "desc" }, select: { id: true, name: true, version: true } }),
    templateOptions(),
  ]);
  const codeChoices = costCodes.map((c) => ({ id: c.id, code: c.code, name: c.name }));
  // Doors and windows to pick from: Item List items of that kind (whatever category they're filed in) with a size.
  const unitsIn = (kind: "doors" | "windows") =>
    doorItems.filter((d) => itemKind(d) === kind).map((d) => ({ id: d.id, name: d.name, widthIn: d.widthIn!, heightIn: d.heightIn!, exterior: d.exterior, style: d.style }));
  const doors = unitsIn("doors");
  const windows = unitsIn("windows");
  if (!plan) notFound();

  // Revisions: the one this replaces (with its sheets, to compare and bring takeoffs forward) and any newer one.
  const [prevPlan, newerPlan] = await Promise.all([
    plan.revisionOfId
      ? db.takeoffPlan.findUnique({
          where: { id: plan.revisionOfId },
          include: { sheets: { orderBy: { pageNumber: "asc" }, include: { _count: { select: { measurements: true } } } } },
        })
      : null,
    db.takeoffPlan.findFirst({ where: { revisionOfId: plan.id }, orderBy: { revision: "desc" }, select: { id: true, revision: true } }),
  ]);
  const revision = {
    revision: plan.revision,
    replacedBy: plan.supersededAt && newerPlan ? newerPlan : null,
    newer: !plan.supersededAt && newerPlan ? newerPlan : null,
    prev: prevPlan
      ? {
          id: prevPlan.id,
          revision: prevPlan.revision,
          fileUrl: `/api/files/${prevPlan.fileId}`,
          kind: prevPlan.kind,
          replaced: !!prevPlan.supersededAt,
          sheets: prevPlan.sheets.map((s) => ({ id: s.id, pageNumber: s.pageNumber, name: s.name, count: s._count.measurements })),
        }
      : null,
  };

  const pageNumber = Math.max(1, Math.min(Number(page) || 1, plan.pageCount ?? Number.MAX_SAFE_INTEGER));
  const sheet = plan.sheets.find((s) => s.pageNumber === pageNumber) ?? null;

  // Condition edit panel (?cond=<id> or ?cond=new): load what its forms need.
  const editing = cond === "new" ? null : (conditions.find((c) => c.id === cond) ?? null);
  let editor = null;
  if (cond === "new" || editing) {
    const [memberSizes, items, company] = await Promise.all([
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
            referenceOnly: editing.referenceOnly,
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
            packMode: editing.packMode,
            packLength: editing.packLength,
            packing: editing.type === "FRAMING" ? { cuts: conditionTotals(editing).memberCuts, prices: editing.lengthPrices } : undefined,
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
              pricePinned: i.pricePinned,
            })),
          }
        : null,
      costCodes,
      codeRules,
      memberSizes,
      items,
      defaultMarkup: company?.defaultMarkup ?? 20,
      pricesLocked: !!project.pricesLockedAt,
      nextColor: CONDITION_COLORS[conditions.length % CONDITION_COLORS.length],
      toolbox: user.role === "ADMIN" ? templates.map((t) => ({ id: t.id, name: t.name })) : undefined,
    };
  }

  // Totals panel: each condition's quantity (this sheet and the job), price and what it orders, plus the Material List.
  const material = materialListFrom(conditions);
  const totalsPanel = {
    conditions: conditions.map((c) => {
      const t = conditionTotals(c);
      const lines = conditionEstimateLines(c, t);
      const onSheet = t.bySheet.find((b) => b.sheetId === sheet?.id);
      return {
        id: c.id,
        name: c.name,
        color: c.color,
        type: c.type,
        unit: t.unit,
        metric: metricLabel(c.metric),
        sheet: onSheet ? onSheet.metrics[c.metric as MetricKey] : 0,
        job: t.quantity,
        withWaste: t.quantityWithWaste,
        wastePct: c.type === "DOOR" || c.type === "WINDOW" ? 0 : c.wastePct, // doors / windows: waste is on the trim, not the count
        price: lines.reduce((sum, l) => sum + linePrice(l), 0),
        unscaled: t.unscaledShapes,
        lines: c.items.map((i, k) => ({ name: i.description, quantity: lines[k]?.quantity ?? 0, unit: i.unit })),
      };
    }),
    materials: {
      lines: material.lines.map((l) => ({ key: l.key, name: l.name, category: l.category, quantity: l.quantity, unit: l.unit })),
      cutLists: material.cutLists,
    },
  };

  return (
    <PlanViewer
      totalsPanel={totalsPanel}
      doors={doors}
      windows={windows}
      codes={{ costCodes: codeChoices, rules: codeRules }}
      codeAlert={<NeedsCodes key="needs-codes" variant="button" projectId={project.id} items={needsCodes} costCodes={codeChoices} rules={codeRules} />}
      projectId={project.id}
      plan={{ id: plan.id, name: plan.name, kind: plan.kind, pageCount: plan.pageCount, fileUrl: `/api/files/${plan.fileId}` }}
      plans={plans.map((p) => ({
        id: p.id,
        name: p.name,
        revision: p.revision,
        replaced: !!p.supersededAt,
        sheets: p.sheets.map((s) => ({ pageNumber: s.pageNumber, name: s.name, scaled: !!s.unitsPerFoot, count: s._count.measurements })),
      }))}
      revision={revision}
      menu={{
        drafts,
        templates: templates.map((t) => ({ id: t.id, name: t.name, conditions: t._count.conditions })),
        isAdmin: user.role === "ADMIN",
        takeoffCost: jobEstimateLines(conditions).reduce((s, l) => s + l.quantity * l.unitCost, 0),
        takeoffCount: conditions.length,
        unpriced: conditions.flatMap((c) => conditionEstimateLines(c, conditionTotals(c)).flatMap((l) => (l.quantity > 0 && !(l.unitCost > 0) ? [l.description] : []))),
      }}
      notice={
        templateError
          ? `Not saved: ${templateError}`
          : toolbox
            ? `Also added to your "${toolbox}" takeoff template`
            : applied != null
              ? `Added ${applied} takeoff${applied === "1" ? "" : "s"} from the template${skipped && skipped !== "0" ? ` · ${skipped} already on this job` : ""}`
              : null
      }
      pageNumber={pageNumber}
      sheet={sheet ? { id: sheet.id, name: sheet.name, unitsPerFoot: sheet.unitsPerFoot, scaleLabel: sheet.scaleLabel, prevSheetId: sheet.prevSheetId, align: sheet.align } : null}
      sheets={plan.sheets.map((s) => ({ id: s.id, prevSheetId: s.prevSheetId, pageNumber: s.pageNumber, name: s.name, scaled: !!s.unitsPerFoot, count: s._count.measurements }))}
      countMarkers={conditions
        .filter((c) => isCountType(c.type))
        .flatMap((c) =>
          c.measurements
            .filter((m) => m.sheet.plan.id === plan.id)
            .map((m) => {
              const [x, y] = parsePoints(m.points)[0] ?? [0, 0];
              return { sheetId: m.sheetId, conditionId: c.id, x, y };
            }),
        )}
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
          options: c.options,
          memberWidthIn: c.memberSizeRef?.widthIn ?? null,
          boardFeetPerLf: c.memberSizeRef ? boardFeetPerLf(c.memberSizeRef) : null,
          soldAs: c.memberSizeRef?.soldAs ?? null,
          total: totals.quantity,
          sheetTotal: onSheet ? onSheet.metrics[c.metric as MetricKey] : 0,
          referenceOnly: c.referenceOnly,
          unassignedDoors: totals.unassignedDoors,
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
            materialItemId: m.materialItemId,
            cased: m.cased,
            isDeduction: m.isDeduction,
            angle: m.angle,
            pitch: m.pitch,
            pitch2: m.pitch2,
            height: m.height,
          })),
      )}
      editor={editor}
    />
  );
}
