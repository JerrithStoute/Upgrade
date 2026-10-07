"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { logActivity } from "@/lib/activity";
import { deleteUpload } from "@/lib/uploads";
import { boolField, money, str, strOrNull } from "@/lib/utils";
import { resolveMaterialItem } from "@/lib/material-items";
import { syncAutoItems } from "@/lib/walls";
import { copyTakeoff, placeBySpan, resizeFamily, resizeSheet } from "@/lib/span-sizing";

/** Walls and beams hold joists up: when they change, span-table joists on those sheets are sized again. */
async function supportsChanged(projectId: string, rows: { type: string; sheetId: string }[]) {
  for (const sheetId of new Set(rows.filter((r) => r.type === "WALL" || r.type === "BEAM").map((r) => r.sheetId))) await resizeSheet(projectId, sheetId);
}
import { applyListPrices, lockJobPrices, setItemPin, setItemPrice, unlockJobPrices } from "@/lib/job-prices";
import { NO_ALIGN, alignAngle, alignScale, applyAlign, isNoAlign, parseAlign, type Align } from "@/lib/revisions";
import { groupOf, CODE_GROUP_KEYS, type CodeGroup } from "@/lib/code-groups";
import { assignItemCodes, newItemPlacement, saveCodeRule } from "@/lib/item-codes";
import { assemblyFields, conditionFields, type AssemblyFields } from "@/lib/takeoff-forms";
import { addConditionsToTemplate, applyTemplate, pullLibraryTakeoff, saveTemplateFromProject } from "@/lib/takeoff-templates";
import { addSubstitution, swapBack } from "@/lib/substitutions";
import {
  CONDITION_COLORS,
  CONDITION_TYPES,
  DEFAULT_METRIC,
  DEFAULT_DOOR_OPTIONS,
  DEFAULT_OPENING_OPTIONS,
  DEFAULT_WINDOW_OPTIONS,
  DEFAULT_WALL_OPTIONS,
  LUMBER_LF_METRIC,
  LUMBER_METRIC_PREFIX,
  hasAutoLines,
  isMetricFor,
  isLumberMetric,
  itemNameKey,
  pointsJson,
  parseArcs,
  parsePoints,
} from "@/lib/takeoff";

function takeoffPath(projectId: string) {
  return `/projects/${projectId}/takeoff`;
}

function plansPath(projectId: string) {
  return `/projects/${projectId}/plans`;
}

function revalidate(projectId: string) {
  revalidatePath(takeoffPath(projectId), "layout");
  revalidatePath(`/projects/${projectId}/files`);
  revalidatePath(plansPath(projectId));
}

/** Where to land after a form: the page it came from (Takeoff tab, plan viewer or Plans tab), else the given Takeoff tab. */
function returnTo(fd: FormData, projectId: string, hash = "", tab: "plans" | "conditions" = "plans") {
  const r = str(fd, "returnTo");
  return (r.startsWith(takeoffPath(projectId)) || r.startsWith(plansPath(projectId)) ? r : `${takeoffPath(projectId)}?tab=${tab}`) + hash;
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
  redirect(returnTo(fd, project.id));
}

/** Shows or hides a plan set (or a plan file in Files → Plans) in the client portal. */
export async function togglePlanClientVisible(fd: FormData) {
  await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const planId = str(fd, "planId");
  const fileId = planId ? (await db.takeoffPlan.findFirst({ where: { id: planId, projectId: project.id }, select: { fileId: true } }))?.fileId : str(fd, "fileId");
  const file = fileId ? await db.fileAsset.findFirst({ where: { id: fileId, projectId: project.id } }) : null;
  if (!file) throw new Error("Plan not found");
  await db.fileAsset.update({ where: { id: file.id }, data: { clientVisible: !file.clientVisible } });
  revalidate(project.id);
  redirect(returnTo(fd, project.id));
}

/** A plan PDF (or image) already in Files becomes a plan set you can measure on. */
export async function planFromFile(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const file = await db.fileAsset.findFirst({ where: { id: str(fd, "fileId"), projectId: project.id }, include: { takeoffPlan: { select: { id: true } } } });
  if (!file) throw new Error("File not found");
  if (file.takeoffPlan) redirect(`${takeoffPath(project.id)}/${file.takeoffPlan.id}`);
  const isPdf = file.mimeType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isImage = ["image/png", "image/jpeg", "image/webp"].includes(file.mimeType);
  if (!isPdf && !isImage) throw new Error("Only PDFs and PNG, JPG or WebP images can be measured");
  const name = file.name.replace(/\.[^.]+$/, "");
  const plan = await db.takeoffPlan.create({
    data: {
      projectId: project.id,
      fileId: file.id,
      name,
      kind: isPdf ? "PDF" : "IMAGE",
      pageCount: isPdf ? null : 1,
      sheets: isPdf ? undefined : { create: { pageNumber: 1, name: "Sheet 1" } },
    },
  });
  await logActivity({ projectId: project.id, userId: user.id, type: "takeoff.plan_uploaded", description: `Set up "${name}" from Files for takeoff` });
  revalidate(project.id);
  redirect(`${takeoffPath(project.id)}/${plan.id}`);
}

// --- Conditions -----------------------------------------------------------------

async function loadCondition(projectId: string, id: string) {
  const c = await db.takeoffCondition.findFirst({ where: { id, projectId } });
  if (!c) throw new Error("Takeoff not found");
  return c;
}

async function nextConditionSort(projectId: string) {
  const last = await db.takeoffCondition.findFirst({ where: { projectId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  return (last?.sortOrder ?? -1) + 1;
}

export async function createCondition(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const data = await conditionFields(fd);
  const pending = await pendingItemFields(fd, data.type, data.metric);
  // A joist / rafter takeoff starts in its size's color (Settings → Member sizes), when it has one.
  const sizeColor = data.type === "FRAMING" && data.memberSizeId ? (await db.memberSize.findUnique({ where: { id: data.memberSizeId }, select: { color: true } }))?.color : null;
  const c = await db.takeoffCondition.create({
    data: { ...data, ...(sizeColor ? { color: sizeColor } : {}), projectId: project.id, sortOrder: await nextConditionSort(project.id) },
  });
  // Assembly items added on the form before the takeoff was saved.
  for (const [k, item] of pending.entries())
    await db.takeoffAssemblyItem.create({ data: { ...(await withMaterialItem(item, user.id, project.id)), conditionId: c.id, sortOrder: k } });
  // "Also add to template": the new takeoff (items and all) goes into your toolbox too. Admins only.
  const toTemplate = strOrNull(fd, "toTemplate");
  let toolbox: string | null = null;
  if (toTemplate && user.role === "ADMIN") {
    const t = await db.takeoffTemplate.findUnique({ where: { id: toTemplate }, select: { id: true, name: true } });
    const full = await db.takeoffCondition.findUnique({ where: { id: c.id }, include: { items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } } });
    if (t && full) {
      const r = await db.$transaction((tx) => addConditionsToTemplate(tx, t.id, [full]));
      toolbox = t.name;
      await logActivity({
        projectId: project.id,
        userId: user.id,
        type: "takeoff_template.saved",
        description: r.added.length ? `Added takeoff "${c.name}" to template "${t.name}"` : `Takeoff "${c.name}" is already in template "${t.name}" — left as it is`,
      });
      revalidatePath(`/settings/takeoff-templates/${t.id}`);
    }
  }
  revalidate(project.id);
  const back = returnTo(fd, project.id, "", "conditions");
  redirect(`${back}${toolbox ? `${back.includes("?") ? "&" : "?"}toolbox=${encodeURIComponent(toolbox)}` : ""}#condition-${c.id}`);
}

export async function updateCondition(fd: FormData) {
  await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const id = str(fd, "id");
  const existing = await loadCondition(project.id, id);
  const data = await conditionFields(fd);
  if (data.type !== existing.type) {
    const shapes = await db.takeoffMeasurement.count({ where: { conditionId: id } });
    if (shapes > 0) throw new Error("A takeoff's type can't change once it has measurements");
  }
  await db.$transaction([
    db.takeoffCondition.update({ where: { id }, data }),
    // Assembly items must use a quantity this condition type produces.
    ...(data.type !== existing.type
      ? [
          db.takeoffAssemblyItem.updateMany({
            where: { conditionId: id, NOT: [{ metric: { startsWith: LUMBER_METRIC_PREFIX } }, { metric: LUMBER_LF_METRIC }] },
            data: { metric: data.metric },
          }),
        ]
      : []),
  ]);
  // A span-table family (one takeoff per size): the settings they share go to all of them —
  // each keeps its own name and size — and the shapes are sized again.
  const group = existing.sizeGroup ?? (data.spanTableId ? id : null);
  if (group && data.type === "FRAMING") {
    const { name: _name, memberSize: _size, memberSizeId: _sizeId, color: _color, ...shared } = data;
    void [_name, _size, _sizeId, _color];
    await db.takeoffCondition.updateMany({ where: { projectId: project.id, sizeGroup: group, NOT: { id } }, data: shared });
    if (!existing.sizeGroup) await db.takeoffCondition.update({ where: { id }, data: { sizeGroup: group } });
  }
  // Saving a span-table takeoff sizes its areas again (cheap — and it picks up walls traced since).
  const resize = !!data.spanTableId;
  if (resize) await resizeFamily(project.id, id);
  // Size, spacing, pitch, overhang or stock lengths can change the lumber.
  if (hasAutoLines(data.type) || hasAutoLines(existing.type)) await syncAutoItems(project.id, resize ? undefined : id);
  revalidate(project.id);
  redirect(returnTo(fd, project.id, `#condition-${id}`, "conditions"));
}

/**
 * A copy of a takeoff — every setting and every item under it, but none of the shapes —
 * right below the original, opened so you can change what differs (a roof's other pitch).
 * Lines the takeoff writes itself (lumber, wall and door materials) come back on their own.
 */
/** A copy of a takeoff with its items, named `name`, right below the original. */
async function copyConditionRow(projectId: string, userId: string, id: string, name?: string) {
  const copy = await copyTakeoff(projectId, id, { name, sizeGroup: null });
  await logActivity({ projectId, userId, type: "takeoff.condition_copied", description: `Copied a takeoff as "${copy.name}"` });
  return copy;
}

export async function copyCondition(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const copy = await copyConditionRow(project.id, user.id, str(fd, "id"));
  revalidate(project.id);
  // Back to the plan with the copy's edit panel open.
  const back = returnTo(fd, project.id);
  redirect(`${back}${back.includes("?") ? "&" : "?"}cond=${copy.id}`);
}

/**
 * From a shape on the plan: "New takeoff like this…" — a copy of its takeoff (items and all)
 * under a new name, and the shape moved into it. E.g. one room → "Tile", one wall → "2x6 Walls".
 */
export async function copyConditionForShape(input: { projectId: string; measurementId?: string; measurementIds?: string[]; name: string }) {
  const user = await requireStaff();
  const data = z
    .object({ projectId: z.string(), measurementId: z.string().optional(), measurementIds: z.array(z.string()).max(2000).optional(), name: z.string().trim().min(1).max(200) })
    .parse(input);
  // One shape, or several picked together (drag a box): the new takeoff is copied from the first one's.
  const ids = data.measurementIds?.length ? data.measurementIds : data.measurementId ? [data.measurementId] : [];
  const shapes = await db.takeoffMeasurement.findMany({ where: { id: { in: ids }, sheet: { plan: { projectId: data.projectId } } }, include: { condition: true } });
  if (!shapes.length) throw new Error("Measurement not found");
  const first = shapes.find((m) => m.id === ids[0]) ?? shapes[0];
  if (shapes.some((m) => m.condition.type !== first.condition.type)) throw new Error("Pick shapes of one kind of takeoff (all walls, all areas…)");
  const copy = await copyConditionRow(data.projectId, user.id, first.conditionId, data.name);
  // Off a span table: you're picking this one by hand, so the new takeoff is one fixed size.
  if (first.condition.spanTableId) await db.takeoffCondition.update({ where: { id: copy.id }, data: { spanTableId: null, sizeGroup: null } });
  await db.takeoffMeasurement.updateMany({ where: { id: { in: shapes.map((m) => m.id) } }, data: { conditionId: copy.id, sizeLocked: false } });
  if (hasAutoLines(first.condition.type)) await syncAutoItems(data.projectId);
  if (first.condition.type === "WALL" || first.condition.type === "BEAM")
    await supportsChanged(
      data.projectId,
      shapes.map((m) => ({ type: m.condition.type, sheetId: m.sheetId })),
    );
  revalidate(data.projectId);
  return { id: copy.id, from: first.conditionId, moved: shapes.map((m) => ({ id: m.id, from: m.conditionId })) };
}

export async function deleteCondition(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const id = str(fd, "id");
  const c = await loadCondition(project.id, id);
  // Estimate lines sent from this condition stay on the estimate, unlinked (FK set null).
  await db.takeoffCondition.delete({ where: { id } });
  await logActivity({ projectId: project.id, userId: user.id, type: "takeoff.condition_deleted", description: `Deleted takeoff "${c.name}"` });
  revalidate(project.id);
  redirect(returnTo(fd, project.id, "", "conditions"));
}

// --- Assembly items ------------------------------------------------------------

/**
 * Links an assembly item to the Item List by name, adding a new Item List entry
 * when the name hasn't been used before. The assembly keeps its own (job) prices.
 */
/**
 * A new takeoff's "pendingItems" (JSON from the form), each checked like the
 * assembly item form. One whose quantity doesn't fit the type uses the takeoff's.
 */
async function pendingItemFields(fd: FormData, type: string, metric: string) {
  const raw = str(fd, "pendingItems");
  if (!raw) return [];
  const rows = z
    .array(
      z.object({
        description: z.string().max(200),
        costCodeId: z.string().max(40),
        metric: z.string().max(60),
        qty: z.number().finite(),
        per: z.number().finite(),
        unit: z.string().max(10),
        roundUp: z.boolean(),
        wastePct: z.number().finite(),
        unitCost: z.number().finite(),
        markupPct: z.number().finite(),
      }),
    )
    .max(100)
    .parse(JSON.parse(raw));
  const out: AssemblyFields[] = [];
  for (const r of rows) {
    if (!r.description.trim()) continue;
    const item = new FormData();
    for (const [k, v] of Object.entries(r)) item.set(k, k === "roundUp" ? (v ? "on" : "") : String(v));
    if (!isMetricFor(type, r.metric)) item.set("metric", metric);
    out.push(await assemblyFields(item, type));
  }
  return out;
}

async function withMaterialItem(data: AssemblyFields, userId: string, projectId: string) {
  const { id, name, created } = await resolveMaterialItem(db, data);
  if (created) {
    await logActivity({ projectId, userId, type: "item_list.added", description: `Added "${data.description}" to the Item List` });
    revalidatePath("/settings/items");
  }
  // Use the Item List's spelling ("concrete" → "Concrete").
  return { ...data, description: name, materialItemId: id };
}

/**
 * One item, one price: the price typed here goes on every takeoff in this job using the
 * item — and, on an unlocked job (unless "This job only"), into the Item List, so every
 * unlocked job gets it. See job-prices.ts.
 */
async function priceEverywhere(fd: FormData, data: AssemblyFields & { materialItemId: string }, userId: string, projectId: string) {
  const before = await db.materialItem.findUnique({ where: { id: data.materialItemId }, select: { unitCost: true } });
  const where = await setItemPrice({ projectId, materialItemId: data.materialItemId, unitCost: data.unitCost, pin: boolField(fd, "pinPrice") });
  if (where === "list" && before && Math.abs(before.unitCost - data.unitCost) > 0.0001) {
    await logActivity({
      projectId,
      userId,
      type: "item_list.price",
      description: `"${data.description}" is now ${money(data.unitCost)} in the Item List (was ${money(before.unitCost)})`,
    });
    revalidatePath("/settings/items");
  }
}

export async function createAssemblyItem(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const conditionId = str(fd, "conditionId");
  const c = await loadCondition(project.id, conditionId);
  const data = await withMaterialItem(await assemblyFields(fd, c.type), user.id, project.id);
  const last = await db.takeoffAssemblyItem.findFirst({ where: { conditionId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  await db.takeoffAssemblyItem.create({ data: { ...data, conditionId, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  await priceEverywhere(fd, data, user.id, project.id);
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
  await priceEverywhere(fd, data, user.id, project.id);
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
    description: `Added ${added.length} takeoff${added.length === 1 ? "" : "s"} from template "${template.name}"${skipped.length ? ` (${skipped.length} already on the job)` : ""}`,
  });
  revalidate(project.id);
  // Back to the sheet you were on, with a note of what was added.
  const back = returnTo(fd, project.id);
  redirect(`${back}${back.includes("?") ? "&" : "?"}applied=${added.length}&skipped=${skipped.length}`);
}

/** One takeoff from the Library (your templates) onto this job, ready to measure. */
export async function pullFromLibrary(input: { projectId: string; templateConditionId: string }) {
  const user = await requireStaff();
  const { projectId, templateConditionId } = z.object({ projectId: z.string(), templateConditionId: z.string() }).parse(input);
  const project = await getProject(projectId);
  const r = await pullLibraryTakeoff(templateConditionId, project.id);
  if (r.added) {
    await logActivity({ projectId: project.id, userId: user.id, type: "takeoff.template_applied", description: `Added takeoff "${r.name}" from the Library` });
    revalidate(project.id);
  }
  return r;
}

/**
 * Admins: one takeoff (items and all) into the Library — a template you have (refreshing
 * the one by that name if it's there) or a new one.
 */
export async function saveConditionToLibrary(fd: FormData) {
  const admin = await requireAdmin();
  const project = await getProject(str(fd, "projectId"));
  const back = returnTo(fd, project.id);
  const join = back.includes("?") ? "&" : "?";
  const c = await db.takeoffCondition.findFirst({
    where: { id: str(fd, "id"), projectId: project.id },
    include: { items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
  });
  if (!c) throw new Error("Takeoff not found");
  const templateId = str(fd, "templateId");
  const newName = str(fd, "newName");
  if (templateId === "new" && !newName) redirect(`${back}${join}templateError=${encodeURIComponent("Give the new template a name")}`);
  const t =
    templateId === "new"
      ? await db.takeoffTemplate.create({ data: { name: newName }, select: { id: true, name: true } })
      : await db.takeoffTemplate.findUnique({ where: { id: templateId }, select: { id: true, name: true } });
  if (!t) redirect(`${back}${join}templateError=${encodeURIComponent("Pick a template")}`);
  const r = await db.$transaction((tx) => addConditionsToTemplate(tx, t!.id, [c], true));
  await logActivity({
    projectId: project.id,
    userId: admin.id,
    type: "takeoff_template.saved",
    description: `${r.updated.length ? "Updated" : "Saved"} takeoff "${c.name}" in template "${t!.name}"`,
  });
  revalidatePath("/settings/takeoff-templates");
  redirect(`${back}${join}library=${encodeURIComponent(`${r.updated.length ? "Updated" : "Saved"} "${c.name}" in your Library (${t!.name})`)}`);
}

/**
 * Admins: this job's takeoffs (items and all) into a template — a new one, added to one
 * you have (only the takeoffs it doesn't have yet, or refreshing those too), or replacing one.
 */
export async function saveTakeoffAsTemplate(fd: FormData) {
  const admin = await requireAdmin();
  const project = await getProject(str(fd, "projectId"));
  const mode = str(fd, "mode") || (strOrNull(fd, "replaceId") ? "replace" : "new");
  const targetId = strOrNull(fd, "templateId") ?? strOrNull(fd, "replaceId");
  const name = str(fd, "name");
  const back = returnTo(fd, project.id);
  const fail = (msg: string) => redirect(`${back}${back.includes("?") ? "&" : "?"}templateError=${encodeURIComponent(msg)}`);
  if (mode === "new" && !name) fail("Give the new template a name");
  if (mode !== "new" && !targetId) fail("Pick a template");

  if (mode === "add") {
    const conditions = await db.takeoffCondition.findMany({
      where: { projectId: project.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
    });
    if (!conditions.length) fail("This job has no takeoffs to add");
    const t = await db.takeoffTemplate.findUnique({ where: { id: targetId! }, select: { id: true, name: true } });
    if (!t) fail("Template not found");
    const r = await db.$transaction((tx) => addConditionsToTemplate(tx, t!.id, conditions, fd.get("update") === "1"));
    await logActivity({
      projectId: project.id,
      userId: admin.id,
      type: "takeoff_template.saved",
      description: `Added to takeoff template "${t!.name}": ${r.added.length} new${r.updated.length ? `, ${r.updated.length} updated` : ""}${r.kept.length ? `, ${r.kept.length} already there` : ""}`,
    });
    revalidatePath("/settings/takeoff-templates");
    redirect(`/settings/takeoff-templates/${t!.id}?added=${r.added.length}&updated=${r.updated.length}&kept=${r.kept.length}`);
  }

  const { id, count } = await saveTemplateFromProject(project.id, { name, replaceId: mode === "replace" ? targetId : null });
  await logActivity({
    projectId: project.id,
    userId: admin.id,
    type: "takeoff_template.saved",
    description: `${mode === "replace" ? "Replaced" : "Saved"} takeoff template${name ? ` "${name}"` : ""} from this job (${count} takeoffs)`,
  });
  revalidatePath("/settings/takeoff-templates");
  redirect(`/settings/takeoff-templates/${id}`);
}

// --- Prices ----------------------------------------------------------------------------

/**
 * Re-prices the takeoff at today's Item List prices and puts it in a new estimate
 * version copied from the latest one. Older versions (and their proposals) stay as they were.
 */
// --- Prices: lock, pin, review ----------------------------------------------------------

function revalidatePrices(projectId: string) {
  revalidate(projectId);
  revalidatePath(`/projects/${projectId}/estimate`, "layout");
  revalidatePath(`/projects/${projectId}/materials`);
  revalidatePath(`/projects/${projectId}`);
}
/** Back to the page the button was on (this job's pages only). */
function backTo(fd: FormData, projectId: string, fallback: string) {
  const b = str(fd, "back");
  return b.startsWith(`/projects/${projectId}/`) ? b : fallback;
}
const reviewPath = (projectId: string) => `/projects/${projectId}/takeoff/rebid`;

/** Locks this job's prices: the Item List no longer changes it. */
export async function lockPrices(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  await syncAutoItems(project.id);
  await lockJobPrices(project.id);
  await logActivity({ projectId: project.id, userId: user.id, type: "takeoff.prices_locked", description: "Prices locked" });
  revalidatePrices(project.id);
  redirect(backTo(fd, project.id, reviewPath(project.id)));
}

/** Unlocks: the job follows the Item List again and takes today's prices (pinned items keep theirs). */
export async function unlockPrices(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const n = await unlockJobPrices(project.id);
  await logActivity({
    projectId: project.id,
    userId: user.id,
    type: "takeoff.prices_unlocked",
    description: `Prices unlocked — ${n} takeoff line${n === 1 ? "" : "s"} took today's Item List price`,
  });
  revalidatePrices(project.id);
  redirect(backTo(fd, project.id, reviewPath(project.id)));
}

/** Price review: the ticked items (or groups) take today's Item List price on this job. */
export async function updateSelectedPrices(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const ids = fd.getAll("item").filter((v): v is string => typeof v === "string" && v.length > 0);
  const n = await applyListPrices(project.id, ids);
  if (n)
    await logActivity({
      projectId: project.id,
      userId: user.id,
      type: "takeoff.prices_updated",
      description: `${ids.length} item${ids.length === 1 ? "" : "s"} updated to today's Item List price (${n} takeoff line${n === 1 ? "" : "s"})`,
    });
  revalidatePrices(project.id);
  redirect(`${reviewPath(project.id)}?updated=${ids.length}`);
}

/** "This job only": pin (keep this job's price) or unpin (follow the Item List) an item. */
export async function pinItemPrice(projectId: string, materialItemId: string, pinned: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireStaff();
  const project = await getProject(projectId);
  await setItemPin(project.id, materialItemId, pinned);
  revalidatePrices(project.id);
  return { ok: true };
}

/** A price typed in the job's Material list (same rules as the takeoff). */
export async function setMaterialPrice(
  projectId: string,
  materialItemId: string,
  raw: string,
  pin: boolean,
): Promise<{ ok: true; where: "list" | "job" } | { ok: false; error: string }> {
  const user = await requireStaff();
  const project = await getProject(projectId);
  const price = Number(raw.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(price) || price < 0) return { ok: false, error: "Enter a price" };
  const item = await db.materialItem.findUnique({ where: { id: materialItemId }, select: { name: true, unitCost: true } });
  if (!item) return { ok: false, error: "Item not found" };
  const where = await setItemPrice({ projectId: project.id, materialItemId, unitCost: price, pin });
  await logActivity({
    projectId: project.id,
    userId: user.id,
    type: "takeoff.item_price",
    description: `"${item.name}" at ${money(price)}${where === "list" ? ` — Item List updated (was ${money(item.unitCost)})` : " on this job only"}`,
  });
  if (where === "list") revalidatePath("/settings/items");
  revalidatePrices(project.id);
  return { ok: true, where };
}

// --- Called from the plan viewer (return data instead of redirecting) -----------------

const ptSchema = z.tuple([z.number().finite(), z.number().finite()]);
const arcsSchema = z.array(z.number().int().min(0)).max(5000).optional();

async function viewerSheet(projectId: string, sheetId: string) {
  const sheet = await db.takeoffSheet.findFirst({ where: { id: sheetId, plan: { projectId } } });
  if (!sheet) throw new Error("Sheet not found");
  return sheet;
}

/** An older revision whose takeoffs moved to a newer one is only for comparing. */
async function assertMeasurable(sheetIds: string[]) {
  const old = await db.takeoffSheet.findFirst({ where: { id: { in: sheetIds }, plan: { supersededAt: { not: null } } }, select: { plan: { select: { revision: true } } } });
  if (old) throw new Error(`Rev ${old.plan.revision} was replaced by a newer revision — measure on the newest one`);
}

// --- Revisions -----------------------------------------------------------------------

/**
 * Which sheet of the previous revision this sheet replaces, and how they line up
 * (from matching points clicked on both; null = as they are).
 */
export async function saveSheetAlign(input: { projectId: string; sheetId: string; prevSheetId: string | null; align: Align | null }) {
  await requireStaff();
  const data = z
    .object({
      projectId: z.string(),
      sheetId: z.string(),
      prevSheetId: z.string().nullable(),
      align: z.object({ a: z.number().finite(), b: z.number().finite(), tx: z.number().finite(), ty: z.number().finite() }).nullable(),
    })
    .parse(input);
  const sheet = await db.takeoffSheet.findFirst({ where: { id: data.sheetId, plan: { projectId: data.projectId } }, include: { plan: { select: { revisionOfId: true } } } });
  if (!sheet || !sheet.plan.revisionOfId) throw new Error("Sheet not found");
  if (data.prevSheetId && !(await db.takeoffSheet.findFirst({ where: { id: data.prevSheetId, planId: sheet.plan.revisionOfId }, select: { id: true } })))
    throw new Error("That sheet isn't in the previous revision");
  if (data.align && (alignScale(data.align) < 0.05 || alignScale(data.align) > 20)) throw new Error("Those points don't line the sheets up — try again");
  await db.takeoffSheet.update({
    where: { id: sheet.id },
    data: { prevSheetId: data.prevSheetId, align: data.align && !isNoAlign(data.align) ? JSON.stringify(data.align) : null },
  });
  revalidate(data.projectId);
}

/**
 * Moves every measurement from the previous revision onto this one, sheet by sheet
 * (lined up as set), copying each sheet's scale where the new sheet has none. The
 * previous revision is then kept only for comparing.
 */
export async function bringTakeoffsForward(input: { projectId: string; planId: string; pairs: { oldSheetId: string; newSheetId: string }[]; copyScale: boolean }) {
  const user = await requireStaff();
  const data = z
    .object({
      projectId: z.string(),
      planId: z.string(),
      pairs: z.array(z.object({ oldSheetId: z.string(), newSheetId: z.string() })).max(500),
      copyScale: z.boolean(),
    })
    .parse(input);
  const plan = await db.takeoffPlan.findFirst({ where: { id: data.planId, projectId: data.projectId }, include: { sheets: true } });
  if (!plan?.revisionOfId) throw new Error("This plan set isn't a revision");
  const prev = await db.takeoffPlan.findUnique({ where: { id: plan.revisionOfId }, include: { sheets: true } });
  if (!prev) throw new Error("The previous revision wasn't found");
  let moved = 0;
  for (const pair of data.pairs) {
    const from = prev.sheets.find((s) => s.id === pair.oldSheetId);
    const to = plan.sheets.find((s) => s.id === pair.newSheetId);
    if (!from || !to) throw new Error("Sheet not found");
    // The lining-up saved on the new sheet applies when it was made against this old sheet.
    const al = to.prevSheetId === from.id ? parseAlign(to.align) : NO_ALIGN;
    const turn = alignAngle(al);
    const shapes = await db.takeoffMeasurement.findMany({ where: { sheetId: from.id } });
    await db.$transaction([
      ...shapes.map((m) =>
        db.takeoffMeasurement.update({
          where: { id: m.id },
          data: {
            sheetId: to.id,
            points: pointsJson(
              parsePoints(m.points).map((p) => applyAlign(al, p)),
              parseArcs(m.points),
            ),
            angle: m.angle + turn,
          },
        }),
      ),
      db.takeoffSheet.update({
        where: { id: to.id },
        data: {
          prevSheetId: from.id,
          // The same drawing scale, adjusted if the new sheet is printed bigger or smaller.
          ...(data.copyScale && !to.unitsPerFoot && from.unitsPerFoot ? { unitsPerFoot: from.unitsPerFoot * alignScale(al), scaleLabel: from.scaleLabel } : {}),
        },
      }),
    ]);
    moved += shapes.length;
  }
  await db.takeoffPlan.update({ where: { id: prev.id }, data: { supersededAt: new Date() } });
  await syncAutoItems(data.projectId);
  await logActivity({
    projectId: data.projectId,
    userId: user.id,
    type: "takeoff.revision",
    description: `Moved ${moved} measurement${moved === 1 ? "" : "s"} from Rev ${prev.revision} to Rev ${plan.revision} of "${plan.name}"`,
  });
  revalidate(data.projectId);
  return { moved };
}

/** Records how many pages a PDF has and creates its sheets (first time a plan is opened). */
export async function initPlanPages(input: { projectId: string; planId: string; pageCount: number }) {
  await requireStaff();
  const { projectId, planId, pageCount } = z.object({ projectId: z.string(), planId: z.string(), pageCount: z.number().int().min(1).max(2000) }).parse(input);
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

/** The takeoff list in a new order (dragged in the plan viewer): every id, top to bottom. */
export async function reorderConditions(input: { projectId: string; ids: string[] }) {
  await requireStaff();
  const { projectId, ids } = z.object({ projectId: z.string(), ids: z.array(z.string()).max(2000) }).parse(input);
  const project = await getProject(projectId);
  const mine = await db.takeoffCondition.findMany({ where: { projectId: project.id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } });
  const known = new Set(mine.map((c) => c.id));
  // Ones not in the list (added in another window meanwhile) keep their place at the end.
  const order = [...ids.filter((id) => known.has(id)), ...mine.map((c) => c.id).filter((id) => !ids.includes(id))];
  await db.$transaction(order.map((id, i) => db.takeoffCondition.update({ where: { id }, data: { sortOrder: i } })));
  revalidate(project.id);
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

/** Joists/rafters and hips/valleys can have a pitch per shape; beams are level. */
const hasShapePitch = (type: string) => type === "FRAMING" || type === "HIP_VALLEY";

/** Fewest points a shape needs: a count is one click, lines (walls, openings, hips) two, outlines three. */
function minPointsFor(type: string) {
  return type === "COUNT" || type === "DOOR" || type === "WINDOW" ? 1 : ["LINEAR", "HIP_VALLEY", "BEAM", "WALL", "OPENING"].includes(type) ? 2 : 3;
}

export async function createMeasurement(input: {
  projectId: string;
  sheetId: string;
  conditionId: string;
  points: [number, number][];
  arcs?: number[]; // indexes of arc points
  materialItemId?: string | null; // Doors: which door this marker is
  cased?: boolean | null; // Windows: cased or not
  isDeduction?: boolean;
  angle?: number;
  pitch?: number | null;
  pitch2?: number | null;
  height?: number | null;
}) {
  await requireStaff();
  const data = z
    .object({
      projectId: z.string(),
      sheetId: z.string(),
      conditionId: z.string(),
      points: z.array(ptSchema).min(1).max(5000),
      arcs: arcsSchema,
      materialItemId: z.string().nullable().optional(),
      cased: z.boolean().nullable().optional(),
      isDeduction: z.boolean().optional(),
      angle: z.number().finite().optional(),
      pitch: z.number().finite().min(0).max(48).nullable().optional(),
      pitch2: z.number().finite().min(0).max(48).nullable().optional(),
      height: z.number().finite().min(0).max(200).nullable().optional(),
    })
    .parse(input);
  await viewerSheet(data.projectId, data.sheetId);
  await assertMeasurable([data.sheetId]);
  const c = await loadCondition(data.projectId, data.conditionId);
  const min = minPointsFor(c.type);
  if (data.points.length < min) throw new Error("Not enough points for this shape");
  const m = await db.takeoffMeasurement.create({
    data: {
      sheetId: data.sheetId,
      conditionId: c.id,
      points: pointsJson(data.points, data.arcs),
      materialItemId: c.type === "DOOR" || c.type === "WINDOW" ? await doorItemId(data.materialItemId) : null,
      cased: c.type === "WINDOW" ? (data.cased ?? null) : null,
      isDeduction: c.type === "AREA" || c.type === "LINEAR" ? !!data.isDeduction : false,
      angle: data.angle ?? 0,
      // A shape's own pitch (null = the condition's); side 2 only means something on hips / valleys.
      pitch: hasShapePitch(c.type) ? (data.pitch ?? null) : null,
      pitch2: c.type === "HIP_VALLEY" ? (data.pitch2 ?? null) : null,
      height: c.type === "LINEAR" ? (data.height ?? null) : null,
    },
  });
  if (hasAutoLines(c.type)) await syncAutoItems(data.projectId, c.id);
  // Joists/rafters on a span table: filed under the size its span calls for.
  const placed = c.spanTableId ? await placeBySpan(data.projectId, m.id) : null;
  await supportsChanged(data.projectId, [{ type: c.type, sheetId: data.sheetId }]);
  revalidate(data.projectId);
  return { id: m.id, isDeduction: m.isDeduction, conditionId: placed?.conditionId ?? c.id, sizedAs: placed?.size ?? null, sizeNote: placed?.pick?.reason ?? null };
}

export async function updateMeasurement(input: {
  projectId: string;
  id: string;
  angle?: number;
  isDeduction?: boolean;
  conditionId?: string;
  pitch?: number | null; // null = back to the condition's pitch
  pitch2?: number | null;
  height?: number | null;
  points?: [number, number][]; // moved / reshaped
  arcs?: number[]; // with points: which are arc points
  materialItemId?: string | null; // Doors: change which door this marker is
  cased?: boolean | null; // Windows: cased or not
  sizeLocked?: boolean; // span-table joists/rafters: false = back to "Auto (span table)"
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
      height: z.number().finite().min(0).max(200).nullable().optional(),
      points: z.array(ptSchema).min(1).max(5000).optional(),
      arcs: arcsSchema,
      materialItemId: z.string().nullable().optional(),
      cased: z.boolean().nullable().optional(),
      sizeLocked: z.boolean().optional(),
    })
    .parse(input);
  const m = await db.takeoffMeasurement.findFirst({ where: { id: data.id, sheet: { plan: { projectId: data.projectId } } }, include: { condition: true } });
  if (!m) throw new Error("Measurement not found");
  const minPoints = minPointsFor(m.condition.type);
  if (data.points && data.points.length < minPoints) throw new Error("Not enough points for this shape");
  let conditionId: string | undefined;
  // Onto a span-table takeoff with no size of its own (the one you draw with): sized automatically.
  let toAuto = false;
  if (data.conditionId && data.conditionId !== m.conditionId) {
    const target = await loadCondition(data.projectId, data.conditionId);
    if (target.type !== m.condition.type) throw new Error("Can only move a shape to a condition of the same type");
    conditionId = target.id;
    toAuto = !!target.spanTableId && !target.memberSize;
  }
  await db.takeoffMeasurement.update({
    where: { id: m.id },
    data: {
      angle: data.angle,
      isDeduction: m.condition.type === "AREA" || m.condition.type === "LINEAR" ? data.isDeduction : undefined,
      conditionId,
      pitch: hasShapePitch(m.condition.type) ? data.pitch : undefined,
      pitch2: m.condition.type === "HIP_VALLEY" ? data.pitch2 : undefined,
      height: m.condition.type === "LINEAR" ? data.height : undefined,
      points: data.points ? pointsJson(data.points, data.arcs) : undefined,
      materialItemId: (m.condition.type === "DOOR" || m.condition.type === "WINDOW") && data.materialItemId !== undefined ? await doorItemId(data.materialItemId) : undefined,
      cased: m.condition.type === "WINDOW" && data.cased !== undefined ? data.cased : undefined,
      // Span-table joists/rafters: picking a size yourself locks it; "Auto" lets the table size it again.
      sizeLocked: data.sizeLocked !== undefined ? data.sizeLocked : toAuto ? false : conditionId && m.condition.spanTableId ? true : undefined,
    },
  });
  if (hasAutoLines(m.condition.type)) await syncAutoItems(data.projectId);
  // Reshaped, turned, or back on Auto: the span may call for another size.
  let placed = null;
  if ((m.condition.spanTableId && (data.points || data.angle !== undefined || data.sizeLocked === false)) || toAuto) placed = await placeBySpan(data.projectId, m.id);
  if (data.points || data.conditionId) await supportsChanged(data.projectId, [{ type: m.condition.type, sheetId: m.sheetId }]);
  revalidate(data.projectId);
  return { ok: true, conditionId: placed?.conditionId ?? conditionId ?? m.conditionId, sizeNote: placed?.pick?.reason ?? null };
}

export async function deleteMeasurement(input: { projectId: string; id: string }) {
  await requireStaff();
  const { projectId, id } = z.object({ projectId: z.string(), id: z.string() }).parse(input);
  const m = await db.takeoffMeasurement.findFirst({ where: { id, sheet: { plan: { projectId } } }, include: { condition: { select: { type: true } } } });
  if (!m) throw new Error("Measurement not found");
  await db.takeoffMeasurement.delete({ where: { id } });
  if (hasAutoLines(m.condition.type)) await syncAutoItems(projectId, m.conditionId);
  await supportsChanged(projectId, [{ type: m.condition.type, sheetId: m.sheetId }]);
  revalidate(projectId);
}

/**
 * Auto-count: many count markers at once (Count, Doors or Windows), on one or more
 * sheets of the job. Doors / windows all get the one picked. Returns the new ids
 * in the same order, for undo.
 */
export async function createCountMarkers(input: {
  projectId: string;
  conditionId: string;
  markers: { sheetId: string; x: number; y: number }[];
  materialItemId?: string | null;
  cased?: boolean | null;
}) {
  await requireStaff();
  const data = z
    .object({
      projectId: z.string(),
      conditionId: z.string(),
      markers: z
        .array(z.object({ sheetId: z.string(), x: z.number().finite(), y: z.number().finite() }))
        .min(1)
        .max(2000),
      materialItemId: z.string().nullable().optional(),
      cased: z.boolean().nullable().optional(),
    })
    .parse(input);
  const c = await loadCondition(data.projectId, data.conditionId);
  if (c.type !== "COUNT" && c.type !== "DOOR" && c.type !== "WINDOW") throw new Error("Auto-count works on Count, Doors and Windows takeoffs");
  const sheetIds = Array.from(new Set(data.markers.map((m) => m.sheetId)));
  const found = await db.takeoffSheet.count({ where: { id: { in: sheetIds }, plan: { projectId: data.projectId } } });
  if (found !== sheetIds.length) throw new Error("Sheet not found");
  await assertMeasurable(sheetIds);
  const materialItemId = c.type === "DOOR" || c.type === "WINDOW" ? await doorItemId(data.materialItemId) : null;
  const cased = c.type === "WINDOW" ? (data.cased ?? null) : null;
  const created = await db.$transaction(
    data.markers.map((m) =>
      db.takeoffMeasurement.create({
        data: { sheetId: m.sheetId, conditionId: c.id, points: pointsJson([[m.x, m.y]]), materialItemId, cased },
        select: { id: true },
      }),
    ),
  );
  if (hasAutoLines(c.type)) await syncAutoItems(data.projectId, c.id);
  revalidate(data.projectId);
  return { ids: created.map((m) => m.id) };
}

/** Removes several measurements (undo of an auto-count). */
export async function deleteMeasurements(input: { projectId: string; ids: string[] }) {
  await requireStaff();
  const { projectId, ids } = z.object({ projectId: z.string(), ids: z.array(z.string()).max(2000) }).parse(input);
  const rows = await db.takeoffMeasurement.findMany({
    where: { id: { in: ids }, sheet: { plan: { projectId } } },
    select: { id: true, conditionId: true, sheetId: true, condition: { select: { type: true } } },
  });
  await db.takeoffMeasurement.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  await supportsChanged(
    projectId,
    rows.map((r) => ({ type: r.condition.type, sheetId: r.sheetId })),
  );
  for (const conditionId of new Set(rows.filter((r) => hasAutoLines(r.condition.type)).map((r) => r.conditionId))) await syncAutoItems(projectId, conditionId);
  revalidate(projectId);
}

/** A saved shape as the plan viewer keeps it (for undo). */
export type SavedShape = {
  id: string;
  sheetId: string;
  conditionId: string;
  points: [number, number][];
  arcs: number[];
  isDeduction: boolean;
  angle: number;
  pitch: number | null;
  pitch2: number | null;
  height: number | null;
  materialItemId: string | null;
  cased: boolean | null;
};

/**
 * "Clear takeoff": every shape of one takeoff — on one sheet, or on all of them. Returns what
 * it removed, so Undo can put it all back.
 */
export async function deleteConditionShapes(input: { projectId: string; conditionId: string; sheetId?: string | null }): Promise<SavedShape[]> {
  const user = await requireStaff();
  const data = z.object({ projectId: z.string(), conditionId: z.string(), sheetId: z.string().nullable().optional() }).parse(input);
  const c = await loadCondition(data.projectId, data.conditionId);
  const rows = await db.takeoffMeasurement.findMany({
    where: { conditionId: c.id, ...(data.sheetId ? { sheetId: data.sheetId } : {}), sheet: { plan: { projectId: data.projectId } } },
  });
  if (!rows.length) return [];
  await db.takeoffMeasurement.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  if (hasAutoLines(c.type)) await syncAutoItems(data.projectId, c.id);
  await supportsChanged(
    data.projectId,
    rows.map((r) => ({ type: c.type, sheetId: r.sheetId })),
  );
  await logActivity({
    projectId: data.projectId,
    userId: user.id,
    type: "takeoff.cleared",
    description: `Cleared ${rows.length} measurement${rows.length === 1 ? "" : "s"} from takeoff "${c.name}"${data.sheetId ? " on one sheet" : ""}`,
  });
  revalidate(data.projectId);
  return rows.map((r) => ({
    id: r.id,
    sheetId: r.sheetId,
    conditionId: r.conditionId,
    points: parsePoints(r.points),
    arcs: parseArcs(r.points),
    isDeduction: r.isDeduction,
    angle: r.angle,
    pitch: r.pitch,
    pitch2: r.pitch2,
    height: r.height,
    materialItemId: r.materialItemId,
    cased: r.cased,
  }));
}

/** Undo of a delete of many shapes (drag-selected, or a cleared takeoff): all put back at once. Returns their new ids, in order. */
export async function restoreShapes(input: {
  projectId: string;
  shapes: (Pick<SavedShape, "sheetId" | "conditionId" | "points" | "isDeduction" | "angle"> &
    Partial<Pick<SavedShape, "arcs" | "pitch" | "pitch2" | "height" | "materialItemId" | "cased">>)[];
}) {
  await requireStaff();
  const data = z
    .object({
      projectId: z.string(),
      shapes: z
        .array(
          z.object({
            sheetId: z.string(),
            conditionId: z.string(),
            points: z.array(ptSchema).min(1).max(5000),
            arcs: arcsSchema,
            isDeduction: z.boolean(),
            angle: z.number().finite(),
            pitch: z.number().finite().nullable().optional(),
            pitch2: z.number().finite().nullable().optional(),
            height: z.number().finite().nullable().optional(),
            materialItemId: z.string().nullable().optional(),
            cased: z.boolean().nullable().optional(),
          }),
        )
        .max(5000),
    })
    .parse(input);
  const sheets = new Set(
    (await db.takeoffSheet.findMany({ where: { id: { in: [...new Set(data.shapes.map((x) => x.sheetId))] }, plan: { projectId: data.projectId } }, select: { id: true } })).map(
      (x) => x.id,
    ),
  );
  const conds = new Set(
    (await db.takeoffCondition.findMany({ where: { id: { in: [...new Set(data.shapes.map((x) => x.conditionId))] }, projectId: data.projectId }, select: { id: true } })).map(
      (x) => x.id,
    ),
  );
  const ids: (string | null)[] = [];
  await db.$transaction(async (tx) => {
    for (const x of data.shapes) {
      // A takeoff or sheet deleted since: that shape can't come back.
      if (!sheets.has(x.sheetId) || !conds.has(x.conditionId)) {
        ids.push(null);
        continue;
      }
      const m = await tx.takeoffMeasurement.create({
        data: {
          sheetId: x.sheetId,
          conditionId: x.conditionId,
          points: pointsJson(x.points, x.arcs),
          isDeduction: x.isDeduction,
          angle: x.angle,
          pitch: x.pitch ?? null,
          pitch2: x.pitch2 ?? null,
          height: x.height ?? null,
          materialItemId: x.materialItemId ?? null,
          cased: x.cased ?? null,
        },
      });
      ids.push(m.id);
    }
  });
  await syncAutoItems(data.projectId);
  const types = await db.takeoffCondition.findMany({ where: { id: { in: [...conds] } }, select: { id: true, type: true } });
  await supportsChanged(
    data.projectId,
    data.shapes.map((x) => ({ type: types.find((t) => t.id === x.conditionId)?.type ?? "", sheetId: x.sheetId })),
  );
  revalidate(data.projectId);
  return { ids };
}

/** Minimal condition created from the viewer; details can be filled in on the Takeoff page. */
export async function quickCreateCondition(input: { projectId: string; name: string; type: string }) {
  await requireStaff();
  const { projectId, name, type } = z.object({ projectId: z.string(), name: z.string().trim().min(1).max(120), type: z.enum(CONDITION_TYPES) }).parse(input);
  await getProject(projectId);
  const [count, company] = await Promise.all([db.takeoffCondition.count({ where: { projectId } }), db.company.findFirst({ select: { defaultMarkup: true } })]);
  // Walls and openings start from sensible defaults; a size in the name ("Ext 2x6 Wall", "2x10 Headers") is used.
  let extra = {};
  if (type === "DOOR") extra = { wastePct: 10, options: JSON.stringify(DEFAULT_DOOR_OPTIONS) };
  if (type === "WINDOW") extra = { wastePct: 10, options: JSON.stringify(DEFAULT_WINDOW_OPTIONS) };
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

/** A door picked for a Doors marker must be an Item List item with a size (null = not picked yet). */
async function doorItemId(id: string | null | undefined) {
  if (!id) return null;
  const item = await db.materialItem.findUnique({ where: { id }, select: { id: true, widthIn: true, heightIn: true } });
  if (!item) throw new Error("Door not found on the Item List");
  if (!item.widthIn || !item.heightIn) throw new Error("That item has no width and height — set them in Settings → Item List");
  return item.id;
}

/** Adds a door or window to the Item List (category Doors / Windows) from the plan, so it can be picked right away. */
export async function createDoorItem(input: {
  name: string;
  widthIn: number;
  heightIn: number;
  exterior: boolean;
  kind?: "door" | "window";
  style?: string | null;
  costCodeId?: string | null;
  codeForAll?: boolean;
}) {
  await requireStaff();
  const data = z
    .object({
      name: z.string().trim().min(1).max(120),
      widthIn: z.number().finite().min(6).max(240),
      heightIn: z.number().finite().min(6).max(240),
      exterior: z.boolean(),
      kind: z.enum(["door", "window"]).optional(),
      style: z.string().trim().max(60).nullable().optional(),
      costCodeId: z.string().max(40).nullable().optional(),
      codeForAll: z.boolean().optional(),
    })
    .parse(input);
  const isWindow = data.kind === "window";
  const exterior = isWindow ? null : data.exterior;
  // Tagged as a door / window and filed in the category you chose for them.
  const place = await newItemPlacement(isWindow ? "windows" : "doors", exterior);
  if (data.costCodeId && !(await db.costCode.findUnique({ where: { id: data.costCodeId }, select: { id: true } }))) throw new Error("Cost code not found");
  // "Use this for all windows" — remembered, and fills in the others with no code.
  const group = groupOf(place.kind, exterior);
  if (data.codeForAll && data.costCodeId && group) await saveCodeRule(group, true, data.costCodeId);
  const costCodeId = data.costCodeId === undefined ? place.costCodeId : data.costCodeId;
  const name = data.name.replace(/\s+/g, " ");
  const nameKey = itemNameKey(name);
  const existing = await db.materialItem.findUnique({ where: { nameKey }, select: { id: true } });
  if (existing) throw new Error(`"${name}" is already on the Item List`);
  const company = await db.company.findFirst({ select: { defaultMarkup: true } });
  const item = await db.materialItem.create({
    data: {
      name,
      nameKey,
      category: place.category,
      kind: place.kind,
      unit: "ea",
      roundUp: true,
      markupPct: company?.defaultMarkup ?? 20,
      costCodeId,
      widthIn: data.widthIn,
      heightIn: data.heightIn,
      exterior,
      style: data.style || null,
    },
  });
  revalidatePath("/settings/items");
  return { id: item.id, name: item.name };
}

/**
 * The "needs a cost code" panel: a code for each item, and for any group where
 * "all of them use this" was ticked, remembered and filled in for the rest.
 */
export async function assignCostCodes(input: { projectId: string; items: { id: string; costCodeId: string }[]; rules: { group: string; costCodeId: string }[] }) {
  await requireStaff();
  const data = z
    .object({
      projectId: z.string().min(1).max(40),
      items: z.array(z.object({ id: z.string().min(1).max(40), costCodeId: z.string().max(40) })).max(500),
      rules: z.array(z.object({ group: z.string().max(40), costCodeId: z.string().min(1).max(40) })).max(20),
    })
    .parse(input);
  const rules = data.rules.filter((r): r is { group: CodeGroup; costCodeId: string } => (CODE_GROUP_KEYS as string[]).includes(r.group));
  const count = await assignItemCodes(data.items, rules);
  revalidatePath(`/projects/${data.projectId}/takeoff`, "layout");
  revalidatePath("/settings/items");
  return { count };
}

// --- Substitutions ----------------------------------------------------------------

const substituteInput = z.object({
  projectId: z.string(),
  fromItemId: z.string(),
  with: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("length"), length: z.number().positive().max(100) }),
    z.object({ kind: z.literal("item"), itemId: z.string() }),
    z.object({ kind: z.literal("new"), name: z.string().trim().min(1).max(200), unit: z.string().trim().max(20) }),
  ]),
  unitCost: z.number().min(0).max(1e7).nullable(),
});

/** Orders something else instead of an item on this job (see substitutions.ts). */
export async function substituteItem(raw: z.input<typeof substituteInput>): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireStaff();
  const parsed = substituteInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Pick what to order instead" };
  const project = await getProject(parsed.data.projectId);
  try {
    const s = await addSubstitution(project.id, { fromItemId: parsed.data.fromItemId, with: parsed.data.with, unitCost: parsed.data.unitCost });
    await logActivity({
      projectId: project.id,
      userId: user.id,
      type: "takeoff.substitution",
      description: `Substituted ${s.toName} for ${s.fromName}${s.unitCost != null ? ` at ${money(s.unitCost)}` : ""}`,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not substitute it" };
  }
  revalidatePrices(project.id);
  revalidatePath("/settings/items");
  return { ok: true };
}

/** Undoes a substitution on this job. */
export async function swapBackSubstitution(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const s = await swapBack(project.id, str(fd, "id"));
  await logActivity({ projectId: project.id, userId: user.id, type: "takeoff.substitution", description: `Swapped back to ${s.fromName} (was ${s.toName})` });
  revalidatePrices(project.id);
  redirect(backTo(fd, project.id, `/projects/${project.id}/materials`));
}

/** The Item List, to pick a substitute from. */
export async function substituteChoices() {
  await requireStaff();
  return db.materialItem.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, unit: true, unitCost: true, category: true } });
}
