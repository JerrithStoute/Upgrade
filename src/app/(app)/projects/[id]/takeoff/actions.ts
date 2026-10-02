"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { logActivity } from "@/lib/activity";
import { deleteUpload } from "@/lib/uploads";
import { str, strOrNull } from "@/lib/utils";
import { syncTakeoffToEstimate } from "@/lib/takeoff-data";
import { resolveMaterialItem } from "@/lib/material-items";
import { copyIntoEstimate, createProjectEstimate } from "@/lib/estimate-lines";
import { syncAutoItems } from "@/lib/walls";
import { assemblyFields, conditionFields, type AssemblyFields } from "@/lib/takeoff-forms";
import { applyTemplate, saveTemplateFromProject } from "@/lib/takeoff-templates";
import {
  CONDITION_COLORS,
  CONDITION_TYPES,
  DEFAULT_METRIC,
  DEFAULT_OPENING_OPTIONS,
  DEFAULT_WALL_OPTIONS,
  LUMBER_LF_METRIC,
  LUMBER_METRIC_PREFIX,
  hasAutoLines,
  isLumberMetric,
  isMemberType,
  pointsJson,
} from "@/lib/takeoff";

function takeoffPath(projectId: string) {
  return `/projects/${projectId}/takeoff`;
}

function revalidate(projectId: string) {
  revalidatePath(takeoffPath(projectId), "layout");
  revalidatePath(`/projects/${projectId}/files`);
}

/** Where to land after a form: the page it came from (Takeoff tab or plan viewer), else the given Takeoff tab. */
function returnTo(fd: FormData, projectId: string, hash = "", tab: "plans" | "conditions" = "plans") {
  const r = str(fd, "returnTo");
  return (r.startsWith(takeoffPath(projectId)) ? r : `${takeoffPath(projectId)}?tab=${tab}`) + hash;
}

// --- Plans --------------------------------------------------------------------

// Uploads go through /api/takeoff/plans (one file per request, with progress).

export async function renamePlan(fd: FormData) {
  await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const id = str(fd, "id");
  const name = str(fd, "name");
  if (!name) throw new Error("Name is required");
  const plan = await db.takeoffPlan.findFirst({ where: { id, projectId: project.id } });
  if (!plan) throw new Error("Plan not found");
  await db.takeoffPlan.update({ where: { id }, data: { name } });
  revalidate(project.id);
  redirect(returnTo(fd, project.id));
}

/** Deletes the plan, every measurement on it, and its file (from Files and from disk). */
export async function deletePlan(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const id = str(fd, "id");
  const plan = await db.takeoffPlan.findFirst({ where: { id, projectId: project.id }, include: { file: true } });
  if (!plan) throw new Error("Plan not found");
  // Deleting the file cascades to the plan, its sheets and their measurements.
  await db.fileAsset.delete({ where: { id: plan.fileId } });
  await deleteUpload(plan.file.storagePath);
  await logActivity({ projectId: project.id, userId: user.id, type: "takeoff.plan_deleted", description: `Deleted plan "${plan.name}" and its measurements` });
  revalidate(project.id);
  redirect(`${takeoffPath(project.id)}?tab=plans`);
}

// --- Conditions -----------------------------------------------------------------

async function loadCondition(projectId: string, id: string) {
  const c = await db.takeoffCondition.findFirst({ where: { id, projectId } });
  if (!c) throw new Error("Condition not found");
  return c;
}

async function nextConditionSort(projectId: string) {
  const last = await db.takeoffCondition.findFirst({ where: { projectId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  return (last?.sortOrder ?? -1) + 1;
}

export async function createCondition(fd: FormData) {
  await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const data = await conditionFields(fd);
  const c = await db.takeoffCondition.create({ data: { ...data, projectId: project.id, sortOrder: await nextConditionSort(project.id) } });
  revalidate(project.id);
  redirect(returnTo(fd, project.id, `#condition-${c.id}`, "conditions"));
}

export async function updateCondition(fd: FormData) {
  await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const id = str(fd, "id");
  const existing = await loadCondition(project.id, id);
  const data = await conditionFields(fd);
  if (data.type !== existing.type) {
    const shapes = await db.takeoffMeasurement.count({ where: { conditionId: id } });
    if (shapes > 0) throw new Error("A condition's type can't change once it has measurements");
  }
  await db.$transaction([
    db.takeoffCondition.update({ where: { id }, data }),
    // Assembly items must use a quantity this condition type produces.
    ...(data.type !== existing.type
      ? [db.takeoffAssemblyItem.updateMany({ where: { conditionId: id, NOT: [{ metric: { startsWith: LUMBER_METRIC_PREFIX } }, { metric: LUMBER_LF_METRIC }] }, data: { metric: data.metric } })]
      : []),
  ]);
  // Size, spacing, pitch, overhang or stock lengths can change the lumber.
  if (hasAutoLines(data.type) || hasAutoLines(existing.type)) await syncAutoItems(project.id, id);
  revalidate(project.id);
  redirect(returnTo(fd, project.id, `#condition-${id}`, "conditions"));
}

export async function deleteCondition(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const id = str(fd, "id");
  const c = await loadCondition(project.id, id);
  // Estimate lines sent from this condition stay on the estimate, unlinked (FK set null).
  await db.takeoffCondition.delete({ where: { id } });
  await logActivity({ projectId: project.id, userId: user.id, type: "takeoff.condition_deleted", description: `Deleted takeoff condition "${c.name}"` });
  revalidate(project.id);
  redirect(returnTo(fd, project.id, "", "conditions"));
}

// --- Assembly items ------------------------------------------------------------

/**
 * Links an assembly item to the Item List by name, adding a new Item List entry
 * when the name hasn't been used before. The assembly keeps its own (job) prices.
 */
async function withMaterialItem(data: AssemblyFields, userId: string, projectId: string) {
  const { id, name, created } = await resolveMaterialItem(db, data);
  if (created) {
    await logActivity({ projectId, userId, type: "item_list.added", description: `Added "${data.description}" to the Item List` });
    revalidatePath("/settings/items");
  }
  // Use the Item List's spelling ("concrete" → "Concrete").
  return { ...data, description: name, materialItemId: id };
}

export async function createAssemblyItem(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const conditionId = str(fd, "conditionId");
  const c = await loadCondition(project.id, conditionId);
  const data = await withMaterialItem(await assemblyFields(fd, c.type), user.id, project.id);
  const last = await db.takeoffAssemblyItem.findFirst({ where: { conditionId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  await db.takeoffAssemblyItem.create({ data: { ...data, conditionId, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  revalidate(project.id);
  redirect(returnTo(fd, project.id, `#condition-${conditionId}`, "conditions"));
}

async function loadAssemblyItem(projectId: string, id: string) {
  const item = await db.takeoffAssemblyItem.findFirst({ where: { id, condition: { projectId } }, include: { condition: true } });
  if (!item) throw new Error("Assembly item not found");
  return item;
}

export async function updateAssemblyItem(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const item = await loadAssemblyItem(project.id, str(fd, "id"));
  if (isLumberMetric(item.metric)) throw new Error("Lumber lines follow the joist / rafter layout — price them in Settings → Item List");
  const data = await withMaterialItem(await assemblyFields(fd, item.condition.type), user.id, project.id);
  await db.takeoffAssemblyItem.update({ where: { id: item.id }, data });
  revalidate(project.id);
  redirect(returnTo(fd, project.id, `#condition-${item.conditionId}`, "conditions"));
}

export async function deleteAssemblyItem(fd: FormData) {
  await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const item = await loadAssemblyItem(project.id, str(fd, "id"));
  if (isLumberMetric(item.metric)) throw new Error("Lumber lines follow the joist / rafter layout and can't be removed");
  // Estimate lines from this item keep their condition link; the next send either
  // turns that line into the condition's own line or removes it.
  await db.takeoffAssemblyItem.delete({ where: { id: item.id } });
  revalidate(project.id);
  redirect(returnTo(fd, project.id, `#condition-${item.conditionId}`, "conditions"));
}

// --- Send to estimate -------------------------------------------------------------

/** Writes the takeoff into a draft estimate (see syncTakeoffToEstimate). */
export async function sendToEstimate(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const estimateId = str(fd, "estimateId");
  await syncAutoItems(project.id);
  const { estimate, created, updated } = await syncTakeoffToEstimate(project.id, estimateId);
  await logActivity({
    projectId: project.id,
    userId: user.id,
    type: "takeoff.sent_to_estimate",
    description: `Takeoff sent to estimate v${estimate.version}: ${created} line${created === 1 ? "" : "s"} added, ${updated} updated`,
  });
  revalidatePath(`/projects/${project.id}/estimate`);
  revalidatePath(`/projects/${project.id}/budget`);
  revalidatePath(`/projects/${project.id}`);
  redirect(`/projects/${project.id}/estimate?estimate=${estimateId}`);
}

// --- Templates ---------------------------------------------------------------------

/** Adds a template's conditions to this job (skipping names it already has). */
export async function applyTakeoffTemplate(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const templateId = str(fd, "templateId");
  if (!templateId) throw new Error("Pick a template");
  const { template, added, skipped } = await applyTemplate(templateId, project.id);
  await logActivity({
    projectId: project.id,
    userId: user.id,
    type: "takeoff.template_applied",
    description: `Added ${added.length} condition${added.length === 1 ? "" : "s"} from template "${template.name}"${skipped.length ? ` (${skipped.length} already on the job)` : ""}`,
  });
  revalidate(project.id);
  redirect(`${takeoffPath(project.id)}?tab=conditions&applied=${added.length}&skipped=${skipped.length}`);
}

/** Admins: save this job's conditions as a new template, or replace an existing one's. */
export async function saveTakeoffAsTemplate(fd: FormData) {
  const admin = await requireAdmin();
  const project = await getProject(str(fd, "projectId"));
  const replaceId = strOrNull(fd, "replaceId");
  const name = str(fd, "name");
  if (!replaceId && !name) throw new Error("Give the template a name");
  const { id, count } = await saveTemplateFromProject(project.id, { name, replaceId });
  await logActivity({
    projectId: project.id,
    userId: admin.id,
    type: "takeoff_template.saved",
    description: `${replaceId ? "Updated" : "Saved"} takeoff template${name ? ` "${name}"` : ""} from this job (${count} conditions)`,
  });
  revalidatePath("/settings/takeoff-templates");
  redirect(`/settings/takeoff-templates/${id}`);
}

// --- Rebid ---------------------------------------------------------------------------

/**
 * Re-prices the takeoff at today's Item List prices and puts it in a new estimate
 * version copied from the latest one. Older versions (and their proposals) stay as they were.
 */
export async function rebidAtCurrentPrices(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  await syncAutoItems(project.id);

  const linked = await db.takeoffAssemblyItem.findMany({
    where: { condition: { projectId: project.id }, materialItemId: { not: null } },
    include: { materialItem: { select: { unitCost: true } } },
  });
  const changed = linked.filter((i) => i.materialItem && Math.abs(i.materialItem.unitCost - i.unitCost) > 0.0001);
  if (changed.length) {
    await db.$transaction(changed.map((i) => db.takeoffAssemblyItem.update({ where: { id: i.id }, data: { unitCost: i.materialItem!.unitCost } })));
  }

  const source = await db.estimate.findFirst({ where: { projectId: project.id }, orderBy: { version: "desc" }, include: { items: true, allowances: true } });
  let estimateId: string;
  let version: number;
  if (source) {
    version = source.version + 1;
    const created = await db.$transaction(async (tx) => {
      const est = await tx.estimate.create({
        data: { projectId: project.id, name: source.name, version, status: "DRAFT", notes: source.notes, terms: source.terms, defaultMarkup: source.defaultMarkup },
      });
      await copyIntoEstimate(tx, est.id, source, { keepSelectionLinks: true });
      return est;
    });
    estimateId = created.id;
  } else {
    const { estimate } = await createProjectEstimate(project.id, null);
    estimateId = estimate.id;
    version = estimate.version;
  }
  await syncTakeoffToEstimate(project.id, estimateId);

  await logActivity({
    projectId: project.id,
    userId: user.id,
    type: "takeoff.rebid",
    description: `Rebid at current Item List prices: ${changed.length} price${changed.length === 1 ? "" : "s"} updated, estimate v${version} created${source ? ` from v${source.version}` : ""}`,
  });
  revalidate(project.id);
  revalidatePath(`/projects/${project.id}/estimate`);
  revalidatePath(`/projects/${project.id}/budget`);
  revalidatePath(`/projects/${project.id}`);
  redirect(`/projects/${project.id}/estimate?estimate=${estimateId}`);
}

// --- Called from the plan viewer (return data instead of redirecting) -----------------

const ptSchema = z.tuple([z.number().finite(), z.number().finite()]);
const arcsSchema = z.array(z.number().int().min(0)).max(5000).optional();

async function viewerSheet(projectId: string, sheetId: string) {
  const sheet = await db.takeoffSheet.findFirst({ where: { id: sheetId, plan: { projectId } } });
  if (!sheet) throw new Error("Sheet not found");
  return sheet;
}

/** Records how many pages a PDF has and creates its sheets (first time a plan is opened). */
export async function initPlanPages(input: { projectId: string; planId: string; pageCount: number }) {
  await requireStaff();
  const { projectId, planId, pageCount } = z
    .object({ projectId: z.string(), planId: z.string(), pageCount: z.number().int().min(1).max(2000) })
    .parse(input);
  const plan = await db.takeoffPlan.findFirst({ where: { id: planId, projectId }, include: { sheets: { select: { pageNumber: true } } } });
  if (!plan) throw new Error("Plan not found");
  const have = new Set(plan.sheets.map((s) => s.pageNumber));
  const missing = Array.from({ length: pageCount }, (_, i) => i + 1).filter((n) => !have.has(n));
  await db.$transaction([
    ...(missing.length ? [db.takeoffSheet.createMany({ data: missing.map((n) => ({ planId, pageNumber: n, name: `Page ${n}` })) })] : []),
    db.takeoffPlan.update({ where: { id: planId }, data: { pageCount } }),
  ]);
  revalidate(projectId);
}

export async function renameSheet(input: { projectId: string; sheetId: string; name: string }) {
  await requireStaff();
  const { projectId, sheetId, name } = z.object({ projectId: z.string(), sheetId: z.string(), name: z.string().trim().min(1).max(120) }).parse(input);
  await viewerSheet(projectId, sheetId);
  await db.takeoffSheet.update({ where: { id: sheetId }, data: { name } });
  revalidate(projectId);
}

export async function setSheetScale(input: { projectId: string; sheetId: string; unitsPerFoot: number; scaleLabel: string; applyToPlan?: boolean }) {
  await requireStaff();
  const { projectId, sheetId, unitsPerFoot, scaleLabel, applyToPlan } = z
    .object({
      projectId: z.string(),
      sheetId: z.string(),
      unitsPerFoot: z.number().finite().positive(),
      scaleLabel: z.string().trim().max(60),
      applyToPlan: z.boolean().optional(),
    })
    .parse(input);
  const sheet = await viewerSheet(projectId, sheetId);
  const data = { unitsPerFoot, scaleLabel: scaleLabel || "Custom" };
  if (applyToPlan) await db.takeoffSheet.updateMany({ where: { planId: sheet.planId }, data });
  else await db.takeoffSheet.update({ where: { id: sheetId }, data });
  // A new scale changes member lengths.
  await syncAutoItems(projectId);
  revalidate(projectId);
}

/** Fewest points a shape needs: a count is one click, lines (walls, openings, hips) two, outlines three. */
function minPointsFor(type: string) {
  return type === "COUNT" ? 1 : ["LINEAR", "HIP_VALLEY", "WALL", "OPENING"].includes(type) ? 2 : 3;
}

export async function createMeasurement(input: {
  projectId: string;
  sheetId: string;
  conditionId: string;
  points: [number, number][];
  arcs?: number[]; // indexes of arc points
  isDeduction?: boolean;
  angle?: number;
  pitch?: number | null;
  pitch2?: number | null;
}) {
  await requireStaff();
  const data = z
    .object({
      projectId: z.string(),
      sheetId: z.string(),
      conditionId: z.string(),
      points: z.array(ptSchema).min(1).max(5000),
      arcs: arcsSchema,
      isDeduction: z.boolean().optional(),
      angle: z.number().finite().optional(),
      pitch: z.number().finite().min(0).max(48).nullable().optional(),
      pitch2: z.number().finite().min(0).max(48).nullable().optional(),
    })
    .parse(input);
  await viewerSheet(data.projectId, data.sheetId);
  const c = await loadCondition(data.projectId, data.conditionId);
  const min = minPointsFor(c.type);
  if (data.points.length < min) throw new Error("Not enough points for this shape");
  const m = await db.takeoffMeasurement.create({
    data: {
      sheetId: data.sheetId,
      conditionId: c.id,
      points: pointsJson(data.points, data.arcs),
      isDeduction: c.type === "AREA" || c.type === "LINEAR" ? !!data.isDeduction : false,
      angle: data.angle ?? 0,
      // A shape's own pitch (null = the condition's); side 2 only means something on hips / valleys.
      pitch: isMemberType(c.type) ? (data.pitch ?? null) : null,
      pitch2: c.type === "HIP_VALLEY" ? (data.pitch2 ?? null) : null,
    },
  });
  if (hasAutoLines(c.type)) await syncAutoItems(data.projectId, c.id);
  revalidate(data.projectId);
  return { id: m.id, isDeduction: m.isDeduction };
}

export async function updateMeasurement(input: {
  projectId: string;
  id: string;
  angle?: number;
  isDeduction?: boolean;
  conditionId?: string;
  pitch?: number | null; // null = back to the condition's pitch
  pitch2?: number | null;
  points?: [number, number][]; // moved / reshaped
  arcs?: number[]; // with points: which are arc points
}) {
  await requireStaff();
  const data = z
    .object({
      projectId: z.string(),
      id: z.string(),
      angle: z.number().finite().optional(),
      isDeduction: z.boolean().optional(),
      conditionId: z.string().optional(),
      pitch: z.number().finite().min(0).max(48).nullable().optional(),
      pitch2: z.number().finite().min(0).max(48).nullable().optional(),
      points: z.array(ptSchema).min(1).max(5000).optional(),
      arcs: arcsSchema,
    })
    .parse(input);
  const m = await db.takeoffMeasurement.findFirst({ where: { id: data.id, sheet: { plan: { projectId: data.projectId } } }, include: { condition: true } });
  if (!m) throw new Error("Measurement not found");
  const minPoints = minPointsFor(m.condition.type);
  if (data.points && data.points.length < minPoints) throw new Error("Not enough points for this shape");
  let conditionId: string | undefined;
  if (data.conditionId && data.conditionId !== m.conditionId) {
    const target = await loadCondition(data.projectId, data.conditionId);
    if (target.type !== m.condition.type) throw new Error("Can only move a shape to a condition of the same type");
    conditionId = target.id;
  }
  await db.takeoffMeasurement.update({
    where: { id: m.id },
    data: {
      angle: data.angle,
      isDeduction: m.condition.type === "AREA" || m.condition.type === "LINEAR" ? data.isDeduction : undefined,
      conditionId,
      pitch: isMemberType(m.condition.type) ? data.pitch : undefined,
      pitch2: m.condition.type === "HIP_VALLEY" ? data.pitch2 : undefined,
      points: data.points ? pointsJson(data.points, data.arcs) : undefined,
    },
  });
  if (hasAutoLines(m.condition.type)) await syncAutoItems(data.projectId);
  revalidate(data.projectId);
  return { ok: true };
}

export async function deleteMeasurement(input: { projectId: string; id: string }) {
  await requireStaff();
  const { projectId, id } = z.object({ projectId: z.string(), id: z.string() }).parse(input);
  const m = await db.takeoffMeasurement.findFirst({ where: { id, sheet: { plan: { projectId } } }, include: { condition: { select: { type: true } } } });
  if (!m) throw new Error("Measurement not found");
  await db.takeoffMeasurement.delete({ where: { id } });
  if (hasAutoLines(m.condition.type)) await syncAutoItems(projectId, m.conditionId);
  revalidate(projectId);
}

/** Minimal condition created from the viewer; details can be filled in on the Takeoff page. */
export async function quickCreateCondition(input: { projectId: string; name: string; type: string }) {
  await requireStaff();
  const { projectId, name, type } = z.object({ projectId: z.string(), name: z.string().trim().min(1).max(120), type: z.enum(CONDITION_TYPES) }).parse(input);
  await getProject(projectId);
  const [count, company] = await Promise.all([db.takeoffCondition.count({ where: { projectId } }), db.company.findFirst({ select: { defaultMarkup: true } })]);
  // Walls and openings start from sensible defaults; a size in the name ("Ext 2x6 Wall", "2x10 Headers") is used.
  let extra = {};
  if (type === "WALL" || type === "OPENING") {
    const sizes = await db.memberSize.findMany({ select: { id: true, name: true, stockLengths: true } });
    const lower = name.toLowerCase();
    const named = sizes.filter((m) => lower.includes(m.name.toLowerCase())).sort((a, b) => b.name.length - a.name.length)[0];
    const size = named ?? (type === "WALL" ? sizes.find((m) => m.name.toLowerCase() === "2x4") : undefined);
    extra =
      type === "WALL"
        ? { memberSizeId: size?.id ?? null, memberSize: size?.name ?? null, height: 8, spacing: 16, wastePct: 10, options: JSON.stringify(DEFAULT_WALL_OPTIONS) }
        : { memberSizeId: size?.id ?? null, memberSize: size?.name ?? null, stockLengths: size?.stockLengths ?? null, options: JSON.stringify(DEFAULT_OPENING_OPTIONS) };
  }
  const c = await db.takeoffCondition.create({
    data: {
      projectId,
      name,
      type,
      metric: DEFAULT_METRIC[type],
      color: CONDITION_COLORS[count % CONDITION_COLORS.length],
      markupPct: company?.defaultMarkup ?? 20,
      ...extra,
      sortOrder: await nextConditionSort(projectId),
    },
  });
  revalidate(projectId);
  return { id: c.id };
}
