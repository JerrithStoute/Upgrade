import { notFound } from "next/navigation";
import { MAX_LINES, readColor, readItemDetails, readJobWindows, readWindowDetails } from "@/lib/window-list";
import { CORE_KEY, JAMB_KEY, MAX_DOOR_LINES, readCore, readDoorDetails, readJamb, readJobDoors } from "@/lib/door-list";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeCostCodes, getProject } from "@/lib/projects";
import { conditionEstimateLines, conditionTotals, loadConditions } from "@/lib/takeoff-data";
import { materialListFrom } from "@/lib/takeoff-materials";
import { materialItemOptions } from "@/lib/material-items";
import { CONDITION_COLORS, boardFeetPerLf, isCountType, metricLabel, parseArcs, parsePoints, type MetricKey } from "@/lib/takeoff";
import { itemsNeedingCodes, loadCodeRules } from "@/lib/item-codes";
import { NeedsCodes } from "../_components/needs-codes";
import { libraryTakeoffs, templateOptions } from "@/lib/takeoff-templates";
import { itemKind } from "@/lib/code-groups";
import { PlanViewer } from "./_components/plan-viewer";

export default async function PlanViewerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; planId: string }>;
  searchParams: Promise<{ page?: string; cond?: string; applied?: string; skipped?: string; templateError?: string; toolbox?: string; library?: string }>;
}) {
  const user = await requireView("takeoffs");
  const { id, planId } = await params;
  const { page, cond, applied, skipped, templateError, toolbox, library: libraryNote } = await searchParams;
  const project = await getProject(id);
  const [plan, plans, conditions, doorItems, costCodes, codeRules, needsCodes, templates, library] = await Promise.all([
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
      select: { id: true, name: true, category: true, kind: true, widthIn: true, heightIn: true, exterior: true, style: true, color: true, details: true },
    }),
    activeCostCodes(),
    loadCodeRules(),
    itemsNeedingCodes(project.id),
    // For the "⋯ Takeoff" menu: takeoff templates.
    templateOptions(),
    // The Library: every template's takeoffs, to pull one onto the job from the plan.
    libraryTakeoffs(),
  ]);
  const codeChoices = costCodes.map((c) => ({ id: c.id, code: c.code, name: c.name }));
  // Doors and windows to pick from: Item List items of that kind (whatever category they're filed in) with a size.
  const unitsIn = (kind: "doors" | "windows") =>
    doorItems
      .filter((d) => itemKind(d) === kind)
      .map((d) => ({ id: d.id, name: d.name, widthIn: d.widthIn!, heightIn: d.heightIn!, exterior: d.exterior, style: d.style }));
  const doors = unitsIn("doors");
  const windows = unitsIn("windows");
  // The job's windows: its short list to pick from, how many of each are on the job, and the company's
  // own window details. A job from before the list starts with the windows already on it, most-used first.
  const [windowCounts, companyWindows, doorCounts] = await Promise.all([
    db.takeoffMeasurement.groupBy({
      by: ["materialItemId"],
      where: { condition: { projectId: project.id, type: "WINDOW" }, materialItemId: { not: null } },
      _count: { _all: true },
    }),
    db.company.findFirst({ select: { windowDetails: true, doorDetails: true } }),
    db.takeoffMeasurement.groupBy({
      by: ["materialItemId"],
      where: { condition: { projectId: project.id, type: "DOOR" }, materialItemId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const counts = Object.fromEntries(windowCounts.map((c) => [c.materialItemId!, c._count._all]));
  const saved = readJobWindows(project.windowList);
  const windowIds = new Set(windows.map((w) => w.id));
  // The saved list, then any window placed on the job that isn't on it (from before the list, or brought
  // back with Ctrl+Z after its line was taken off) — most-used first. Every window placed has its line.
  const listed = project.windowList ? saved.lines.filter((i) => windowIds.has(i)) : [];
  const lineIds = [
    ...listed,
    ...Object.entries(counts)
      .filter(([i]) => windowIds.has(i) && !listed.includes(i))
      .sort((a, b) => b[1] - a[1])
      .map(([i]) => i),
  ].slice(0, MAX_LINES);
  const byItem = new Map(doorItems.map((d) => [d.id, d]));
  const jobWindows = {
    details: readWindowDetails(companyWindows?.windowDetails),
    counts,
    lines: lineIds.map((i) => {
      const d = byItem.get(i)!;
      return {
        id: d.id,
        name: d.name,
        widthIn: d.widthIn!,
        heightIn: d.heightIn!,
        style: d.style,
        color: readColor(d.color),
        details: readItemDetails(d.details),
      };
    }),
  };
  // The job's doors, the same way: its short list, how many of each, and the company's own door details.
  // A job from before the list starts with the doors already on it, most-used first.
  const dCounts = Object.fromEntries(doorCounts.map((c) => [c.materialItemId!, c._count._all]));
  const doorIds = new Set(doors.map((d) => d.id));
  const doorsListed = project.doorList ? readJobDoors(project.doorList).lines.filter((i) => doorIds.has(i)) : [];
  const doorLineIds = [
    ...doorsListed,
    ...Object.entries(dCounts)
      .filter(([i]) => doorIds.has(i) && !doorsListed.includes(i))
      .sort((a, b) => b[1] - a[1])
      .map(([i]) => i),
  ].slice(0, MAX_DOOR_LINES);
  const jobDoors = {
    details: readDoorDetails(companyWindows?.doorDetails),
    counts: dCounts,
    lines: doorLineIds.map((i) => {
      const d = byItem.get(i)!;
      const { [JAMB_KEY]: jamb, [CORE_KEY]: core, ...details } = readItemDetails(d.details);
      return {
        id: d.id,
        name: d.name,
        widthIn: d.widthIn!,
        heightIn: d.heightIn!,
        style: d.style,
        exterior: !!d.exterior,
        jamb: readJamb(jamb),
        core: readCore(core),
        details,
      };
    }),
  };
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
    const [memberSizes, items, spanTables] = await Promise.all([
      db.memberSize.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, kind: true, soldAs: true, stockLengths: true },
      }),
      materialItemOptions(),
      db.spanTable.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, use: true } }),
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
            spanTableId: editing.spanTableId,
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
              pricePinned: i.pricePinned,
            })),
          }
        : null,
      costCodes,
      codeRules,
      memberSizes,
      spanTables,
      items,
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
        cost: lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0),
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
      jobWindows={jobWindows}
      jobDoors={jobDoors}
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
      library={library}
      menu={{
        templates: templates.map((t) => ({ id: t.id, name: t.name, conditions: t._count.conditions })),
        isAdmin: user.role === "ADMIN",
        takeoffCount: conditions.length,
      }}
      notice={
        templateError
          ? `Not saved: ${templateError}`
          : libraryNote
            ? libraryNote
            : toolbox
              ? `Also added to your "${toolbox}" takeoff template`
              : applied != null
                ? `Added ${applied} takeoff${applied === "1" ? "" : "s"} from the template${skipped && skipped !== "0" ? ` · ${skipped} already on this job` : ""}`
                : null
      }
      pageNumber={pageNumber}
      sheet={
        sheet
          ? {
              id: sheet.id,
              name: sheet.name,
              unitsPerFoot: sheet.unitsPerFoot,
              scaleLabel: sheet.scaleLabel,
              prevSheetId: sheet.prevSheetId,
              align: sheet.align,
              upperFloor: sheet.upperFloor,
            }
          : null
      }
      sheets={plan.sheets.map((s) => ({
        id: s.id,
        prevSheetId: s.prevSheetId,
        pageNumber: s.pageNumber,
        name: s.name,
        scaled: !!s.unitsPerFoot,
        unitsPerFoot: s.unitsPerFoot,
        count: s._count.measurements,
      }))}
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
          spanTable: c.spanTable?.name ?? null,
          shapeCount: c.measurements.length,
          sizeGroup: c.sizeGroup,
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
            memberPieces: c.bandSplit.pieces.get(m.id),
            sections: m.sections,
            id: m.id,
            conditionId: c.id,
            points: parsePoints(m.points),
            arcs: parseArcs(m.points),
            materialItemId: m.materialItemId,
            cased: m.cased,
            sizeLocked: m.sizeLocked,
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
