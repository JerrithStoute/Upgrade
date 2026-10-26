import "server-only";
import { db } from "./db";
import { copyUpload, deleteUpload } from "./uploads";
import { copyIntoEstimate } from "./estimate-lines";
import { copySchedule } from "./schedule-templates";
import { nextProjectNumber } from "./projects";

/**
 * A job copied to a new job — a house you build over and over, onto another lot (⋯ Copy this job, or
 * New job → Start from a plan template). What comes along, as picked:
 *
 *  - Plans & takeoff: the current plan sets (their files copied into the new job's Files → Plans), each
 *    sheet with its scale, every takeoff with its settings and items, every shape where it was, the door
 *    and window lists and the job's substitutions. Lumber, wall and material lines are worked out again,
 *    at today's Item List prices.
 *  - Estimate: the newest version, as a new draft (v1) — its lines still tied to the new job's takeoffs.
 *  - Schedule: the tasks and what waits on what, laid out again from a new start date.
 *
 * Never: the client's history, bids, POs, bills, invoices, change orders, selections, daily logs, time,
 * messages, photos and other files. The new job is its own — changing it never changes the original.
 */

export type CopyWhat = { takeoff: boolean; estimate: boolean; schedule: boolean; start: Date | null };
export type NewJob = {
  name: string;
  clientId: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  /** Kept as a plan template (off the job lists) rather than a real job. */
  isTemplate: boolean;
};

/** A row's own fields, without its id, company and dates (they're made fresh). */
function fields<T extends Record<string, unknown>>(row: T, drop: string[] = []) {
  const out: Record<string, unknown> = { ...row };
  for (const k of ["id", "companyId", "createdAt", "updatedAt", ...drop]) delete out[k];
  return out;
}

/** JSON that names rows by id (a shape's walls, a sheet's floor above), with each old id swapped for its copy's. */
function remapIds(json: string | null, ...maps: Map<string, string>[]) {
  if (!json) return json;
  return json.replace(/"([a-z0-9]{20,40})"/g, (whole, id: string) => {
    for (const m of maps) if (m.has(id)) return `"${m.get(id)}"`;
    return whole;
  });
}

export async function copyJob(fromId: string, job: NewJob, what: CopyWhat, userId: string) {
  const from = await db.project.findUnique({ where: { id: fromId }, include: { members: { select: { userId: true } } } });
  if (!from) throw new Error("That job isn't here any more");

  // The plan files first (outside the database work), so a copy that fails part-way leaves no new job.
  const plans = what.takeoff
    ? await db.takeoffPlan.findMany({
        where: { projectId: from.id, supersededAt: null },
        orderBy: { createdAt: "asc" },
        include: { file: true, sheets: { orderBy: { pageNumber: "asc" } } },
      })
    : [];
  const copiedFiles = new Map<string, string>(); // plan id → new storage key
  const project = await db.project.create({
    data: {
      number: await nextProjectNumber(),
      name: job.name,
      status: "LEAD",
      type: from.type,
      description: from.description,
      squareFeet: from.squareFeet,
      isSpec: from.isSpec,
      isTemplate: job.isTemplate,
      clientId: job.isTemplate ? null : job.clientId,
      address: job.address,
      city: job.city,
      state: job.state,
      zip: job.zip,
      managerId: from.managerId,
      windowList: what.takeoff ? from.windowList : null,
      doorList: what.takeoff ? from.doorList : null,
      // Its lines are worked out fresh the first time it's opened.
      lumberChangedAt: new Date(),
      members: { create: from.members.map((m) => ({ userId: m.userId })) },
    },
  });

  try {
    for (const p of plans) copiedFiles.set(p.id, await copyUpload(p.file.storagePath, project.id, p.file.name));

    const condMap = new Map<string, string>();
    const itemMap = new Map<string, string>();
    await db.$transaction(
      async (tx) => {
        if (!what.takeoff) return;
        // Plan sets and their sheets (with each sheet's scale).
        const sheetMap = new Map<string, string>();
        for (const p of plans) {
          const file = await tx.fileAsset.create({
            data: { ...fields(p.file, ["projectId", "selectionId", "selectionOptionId", "changeOrderId", "dailyLogId"]), projectId: project.id, storagePath: copiedFiles.get(p.id)!, uploadedById: userId } as never,
          });
          const plan = await tx.takeoffPlan.create({
            data: { projectId: project.id, fileId: file.id, name: p.name, kind: p.kind, pageCount: p.pageCount, revision: 1 },
          });
          for (const s of p.sheets) {
            const sheet = await tx.takeoffSheet.create({ data: { planId: plan.id, pageNumber: s.pageNumber, name: s.name, unitsPerFoot: s.unitsPerFoot, scaleLabel: s.scaleLabel } });
            sheetMap.set(s.id, sheet.id);
          }
        }
        // The floor above laid over a sheet: points at the copied sheet.
        for (const p of plans)
          for (const s of p.sheets)
            if (s.upperFloor) await tx.takeoffSheet.update({ where: { id: sheetMap.get(s.id)! }, data: { upperFloor: remapIds(s.upperFloor, sheetMap) } });

        // Every takeoff, with its settings and items.
        const conditions = await tx.takeoffCondition.findMany({ where: { projectId: from.id }, include: { items: true } });
        for (const c of conditions) {
          const { items, ...row } = c;
          const made = await tx.takeoffCondition.create({ data: { ...fields(row, ["projectId"]), projectId: project.id } as never });
          condMap.set(c.id, made.id);
          for (const i of items) {
            const item = await tx.takeoffAssemblyItem.create({ data: { ...fields(i, ["conditionId"]), conditionId: made.id } as never });
            itemMap.set(i.id, item.id);
          }
        }

        // Every shape where it was (the same plan, so the same page units), on its copied sheet and takeoff.
        const shapes = await tx.takeoffMeasurement.findMany({ where: { condition: { projectId: from.id }, sheetId: { in: [...sheetMap.keys()] } } });
        const shapeMap = new Map<string, string>();
        for (const m of shapes) {
          const made = await tx.takeoffMeasurement.create({
            data: { ...fields(m, ["sheetId", "conditionId", "sections"]), sheetId: sheetMap.get(m.sheetId)!, conditionId: condMap.get(m.conditionId)! } as never,
          });
          shapeMap.set(m.id, made.id);
        }
        // Joists broken at walls name those walls: the copied ones.
        for (const m of shapes) if (m.sections) await tx.takeoffMeasurement.update({ where: { id: shapeMap.get(m.id)! }, data: { sections: remapIds(m.sections, shapeMap) } });

        // Substitutions (they're put back on the new job's lines when its lines are worked out).
        const subs = await tx.jobSubstitution.findMany({ where: { projectId: from.id } });
        for (const s of subs) await tx.jobSubstitution.create({ data: { ...fields(s, ["projectId", "restore"]), projectId: project.id, restore: null } as never });
      },
      { timeout: 120_000 },
    );

    // The newest estimate, as a new draft — its lines tied to the copied takeoffs.
    if (what.estimate) {
      const est = await db.estimate.findFirst({ where: { projectId: from.id }, orderBy: { version: "desc" }, include: { items: true, specs: true, parameterValues: true } });
      if (est) {
        await db.$transaction(async (tx) => {
          const made = await tx.estimate.create({
            data: { projectId: project.id, name: est.name, version: 1, status: "DRAFT", defaultMarkup: est.defaultMarkup, markupTable: est.markupTable, notes: est.notes, terms: est.terms },
          });
          for (const v of est.parameterValues) await tx.estimateParameterValue.create({ data: { estimateId: made.id, parameterId: v.parameterId, value: v.value } });
          await copyIntoEstimate(
            tx,
            made.id,
            {
              specs: est.specs,
              items: est.items.map((i) => ({
                ...i,
                takeoffConditionId: i.takeoffConditionId ? (condMap.get(i.takeoffConditionId) ?? null) : null,
                takeoffItemId: i.takeoffItemId ? (itemMap.get(i.takeoffItemId) ?? null) : null,
              })),
            },
            { keepSelectionLinks: false },
          );
        });
        await db.project.update({ where: { id: project.id }, data: { status: "ESTIMATING" } });
      }
      const params = await db.projectParameterValue.findMany({ where: { projectId: from.id } });
      for (const v of params) await db.projectParameterValue.create({ data: { projectId: project.id, parameterId: v.parameterId, value: v.value } });
    }

    if (what.schedule && what.start) await copySchedule(from.id, project.id, what.start);
  } catch (err) {
    // A copy that fails part-way leaves nothing behind: the new job (everything on it goes with it) and its copied files.
    await db.project.delete({ where: { id: project.id } }).catch(() => {});
    for (const key of copiedFiles.values()) await deleteUpload(key).catch(() => {});
    throw err;
  }

  return project;
}
