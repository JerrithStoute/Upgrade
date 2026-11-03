import "server-only";
import { db } from "./db";
import { runAsCompany } from "./tenant";
import { copyUpload, deleteUpload } from "./uploads";
import { copyIntoEstimate } from "./estimate-lines";
import { nextProjectNumber } from "./projects";
import { newChangeOrder } from "./billing-flow";
import { itemNameKey } from "./takeoff";

/**
 * The Station's "Copy a job to another builder" (owner only): one builder's job into another
 * builder's company — for a demo or a test account. The original is only read, never changed.
 *
 * Comes along: the job's details, its current plan sets (files copied) with every sheet's scale,
 * every takeoff with its settings and items and every shape, the door and window lists and
 * substitutions, the newest estimate (as a draft), and the schedule (dates as they were).
 * The other builder's own lists are used where they have the same thing — cost codes by code (or
 * name), Item List items, member sizes, span tables and estimate parameters by name — and anything
 * missing is added to their lists. The client comes over by name only (no email, phone or address),
 * so nothing sent from the copy can reach the real client. Never: bids, POs, bills, invoices,
 * change orders, selections, daily logs, time, messages, photos or other files.
 *
 * Then, if asked: the copy put under contract (its estimate approved — the budget follows it —
 * the job Contracted), and a few made-up change orders on it.
 */

export type CopyAcross = { fromCompanyId: string; projectId: string; toCompanyId: string; contract: boolean; changeOrders: boolean };

/** A row's own fields, without its id, company and dates (they're made fresh), and without `drop`. */
function fields<T extends Record<string, unknown>>(row: T, drop: string[] = []) {
  const out: Record<string, unknown> = { ...row };
  for (const k of ["id", "companyId", "createdAt", "updatedAt", ...drop]) delete out[k];
  return out;
}

/** JSON that names rows by id, with each old id swapped for its copy's (ids with no copy are left). */
function remapIds(json: string | null, ...maps: Map<string, string>[]) {
  if (!json) return json;
  return json.replace(/"([a-z0-9]{20,40})"/g, (whole, id: string) => {
    for (const m of maps) if (m.has(id)) return `"${m.get(id)}"`;
    return whole;
  });
}

const lower = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Everything the copy needs, read as the builder it comes from. */
async function readSource(projectId: string) {
  const project = await db.project.findUnique({ where: { id: projectId }, include: { client: { select: { firstName: true, lastName: true, company: true } } } });
  if (!project) throw new Error("That job isn't there any more");
  const plans = await db.takeoffPlan.findMany({
    where: { projectId, supersededAt: null },
    orderBy: { createdAt: "asc" },
    include: { file: true, sheets: { orderBy: { pageNumber: "asc" } } },
  });
  const sheetIds = plans.flatMap((p) => p.sheets.map((s) => s.id));
  const [conditions, shapes, subs, estimate, projectParams, tasks, links] = await Promise.all([
    db.takeoffCondition.findMany({ where: { projectId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { items: true } }),
    db.takeoffMeasurement.findMany({ where: { condition: { projectId }, sheetId: { in: sheetIds } } }),
    db.jobSubstitution.findMany({ where: { projectId } }),
    db.estimate.findFirst({ where: { projectId }, orderBy: { version: "desc" }, include: { items: true, specs: true, parameterValues: true } }),
    db.projectParameterValue.findMany({ where: { projectId } }),
    db.scheduleTask.findMany({ where: { projectId }, orderBy: [{ sortOrder: "asc" }, { startDate: "asc" }] }),
    db.taskLink.findMany({ where: { task: { projectId } } }),
  ]);

  // The builder's own list rows the job points at.
  const codeIds = new Set<string>();
  const itemIds = new Set<string>();
  for (const c of conditions) {
    if (c.costCodeId) codeIds.add(c.costCodeId);
    for (const i of c.items) {
      if (i.costCodeId) codeIds.add(i.costCodeId);
      if (i.materialItemId) itemIds.add(i.materialItemId);
    }
  }
  for (const m of shapes) if (m.materialItemId) itemIds.add(m.materialItemId);
  for (const s of subs) {
    itemIds.add(s.fromItemId);
    if (s.toItemId) itemIds.add(s.toItemId);
  }
  for (const i of estimate?.items ?? []) {
    if (i.costCodeId) codeIds.add(i.costCodeId);
    if (i.materialItemId) itemIds.add(i.materialItemId);
  }
  // The door and window lists name items by id.
  for (const list of [project.windowList, project.doorList]) for (const m of (list ?? "").matchAll(/"([a-z0-9]{20,40})"/g)) itemIds.add(m[1]);
  const items = await db.materialItem.findMany({ where: { id: { in: [...itemIds] } } });
  for (const i of items) if (i.costCodeId) codeIds.add(i.costCodeId);
  const [codes, sizes, spans, params] = await Promise.all([
    db.costCode.findMany({ where: { id: { in: [...codeIds] } } }),
    db.memberSize.findMany({ where: { id: { in: conditions.flatMap((c) => (c.memberSizeId ? [c.memberSizeId] : [])) } } }),
    db.spanTable.findMany({ where: { id: { in: conditions.flatMap((c) => (c.spanTableId ? [c.spanTableId] : [])) } } }),
    db.estimateParameter.findMany({
      where: { id: { in: [...(estimate?.parameterValues ?? []).map((v) => v.parameterId), ...projectParams.map((v) => v.parameterId)] } },
    }),
  ]);
  return { project, plans, conditions, shapes, subs, estimate, projectParams, tasks, links, items, codes, sizes, spans, params };
}

type Source = Awaited<ReturnType<typeof readSource>>;

/** The other builder's matching list rows (theirs where they have one, else added): old id → their id. */
async function matchLists(src: Source) {
  const codeMap = new Map<string, string>();
  const theirCodes = await db.costCode.findMany();
  let order = theirCodes.reduce((m, c) => Math.max(m, c.sortOrder), 0);
  for (const c of src.codes) {
    const hit = theirCodes.find((t) => (c.code && t.code ? lower(t.code) === lower(c.code) : false)) ?? theirCodes.find((t) => lower(t.name) === lower(c.name));
    const id = hit?.id ?? (await db.costCode.create({ data: { code: c.code, name: c.name, division: c.division, sortOrder: ++order } })).id;
    codeMap.set(c.id, id);
  }

  const itemMap = new Map<string, string>();
  const theirItems = new Map((await db.materialItem.findMany({ select: { id: true, nameKey: true } })).map((i) => [i.nameKey, i.id]));
  for (const i of src.items) {
    const key = i.nameKey || itemNameKey(i.name);
    const id =
      theirItems.get(key) ??
      (
        await db.materialItem.create({
          data: { ...fields(i, ["costCodeId", "priceCheckedAt"]), nameKey: key, costCodeId: i.costCodeId ? (codeMap.get(i.costCodeId) ?? null) : null } as never,
        })
      ).id;
    itemMap.set(i.id, id);
  }

  const sizeMap = new Map<string, string>();
  const theirSizes = new Map((await db.memberSize.findMany({ select: { id: true, nameKey: true } })).map((s) => [s.nameKey, s.id]));
  for (const s of src.sizes) sizeMap.set(s.id, theirSizes.get(s.nameKey) ?? (await db.memberSize.create({ data: fields(s) as never })).id);

  const spanMap = new Map<string, string>();
  const theirSpans = await db.spanTable.findMany({ select: { id: true, name: true } });
  for (const t of src.spans) spanMap.set(t.id, theirSpans.find((x) => lower(x.name) === lower(t.name))?.id ?? (await db.spanTable.create({ data: fields(t) as never })).id);

  const paramMap = new Map<string, string>();
  const theirParams = await db.estimateParameter.findMany({ select: { id: true, name: true } });
  for (const p of src.params) paramMap.set(p.id, theirParams.find((x) => lower(x.name) === lower(p.name))?.id ?? (await db.estimateParameter.create({ data: fields(p) as never })).id);

  return { codeMap, itemMap, sizeMap, spanMap, paramMap };
}

/** Copies a job into another builder's company; returns the new job's number and name there. */
export async function copyJobAcross(opts: CopyAcross) {
  if (opts.fromCompanyId === opts.toCompanyId) throw new Error("Pick a different builder to copy it to");
  const src = await runAsCompany(opts.fromCompanyId, () => readSource(opts.projectId));

  return runAsCompany(opts.toCompanyId, async () => {
    const admin = await db.user.findFirst({ where: { role: "ADMIN", active: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (!admin) throw new Error("That builder has no admin to own the copy");
    const lists = await matchLists(src);
    const { codeMap, itemMap, sizeMap, spanMap, paramMap } = lists;
    const code = (id: string | null) => (id ? (codeMap.get(id) ?? null) : null);
    const item = (id: string | null) => (id ? (itemMap.get(id) ?? null) : null);

    // The client, by name only.
    const c = src.project.client;
    const client = c ? await db.client.create({ data: { firstName: c.firstName, lastName: c.lastName, company: c.company, source: "Copied" } }) : null;

    const p = src.project;
    const project = await db.project.create({
      data: {
        number: await nextProjectNumber(),
        name: p.name,
        status: src.estimate ? "ESTIMATING" : "LEAD",
        type: p.type,
        description: p.description,
        squareFeet: p.squareFeet,
        isSpec: p.isSpec,
        clientId: client?.id ?? null,
        address: p.address,
        city: p.city,
        state: p.state,
        zip: p.zip,
        startDate: p.startDate,
        targetEndDate: p.targetEndDate,
        contractAmount: p.contractAmount,
        managerId: admin.id,
        windowList: remapIds(p.windowList, itemMap),
        doorList: remapIds(p.doorList, itemMap),
        // Its lumber lines are worked out fresh (at their prices) the first time it's opened.
        lumberChangedAt: new Date(),
      },
    });

    const copiedFiles: string[] = [];
    try {
      const planFiles = new Map<string, string>();
      for (const pl of src.plans) {
        const key = await copyUpload(pl.file.storagePath, project.id, pl.file.name);
        copiedFiles.push(key);
        planFiles.set(pl.id, key);
      }

      const condMap = new Map<string, string>();
      const asmMap = new Map<string, string>();
      await db.$transaction(
        async (tx) => {
          const sheetMap = new Map<string, string>();
          for (const pl of src.plans) {
            const file = await tx.fileAsset.create({
              data: {
                ...fields(pl.file, ["projectId", "selectionId", "selectionOptionId", "changeOrderId", "dailyLogId", "warrantyRequestId", "uploadedById", "storagePath"]),
                projectId: project.id,
                storagePath: planFiles.get(pl.id)!,
                uploadedById: admin.id,
              } as never,
            });
            const plan = await tx.takeoffPlan.create({ data: { projectId: project.id, fileId: file.id, name: pl.name, kind: pl.kind, pageCount: pl.pageCount, revision: 1 } });
            for (const s of pl.sheets) {
              const sheet = await tx.takeoffSheet.create({ data: { planId: plan.id, pageNumber: s.pageNumber, name: s.name, unitsPerFoot: s.unitsPerFoot, scaleLabel: s.scaleLabel } });
              sheetMap.set(s.id, sheet.id);
            }
          }
          for (const pl of src.plans)
            for (const s of pl.sheets) if (s.upperFloor) await tx.takeoffSheet.update({ where: { id: sheetMap.get(s.id)! }, data: { upperFloor: remapIds(s.upperFloor, sheetMap) } });

          for (const cond of src.conditions) {
            const { items, ...row } = cond;
            const made = await tx.takeoffCondition.create({
              data: {
                ...fields(row, ["projectId", "costCodeId", "memberSizeId", "spanTableId", "sizeGroup"]),
                projectId: project.id,
                costCodeId: code(cond.costCodeId),
                memberSizeId: cond.memberSizeId ? (sizeMap.get(cond.memberSizeId) ?? null) : null,
                spanTableId: cond.spanTableId ? (spanMap.get(cond.spanTableId) ?? null) : null,
              } as never,
            });
            condMap.set(cond.id, made.id);
            for (const i of items) {
              const a = await tx.takeoffAssemblyItem.create({
                data: { ...fields(i, ["conditionId", "costCodeId", "materialItemId"]), conditionId: made.id, costCodeId: code(i.costCodeId), materialItemId: item(i.materialItemId) } as never,
              });
              asmMap.set(i.id, a.id);
            }
          }
          // A span-table family names its first takeoff.
          for (const cond of src.conditions)
            if (cond.sizeGroup) await tx.takeoffCondition.update({ where: { id: condMap.get(cond.id)! }, data: { sizeGroup: condMap.get(cond.sizeGroup) ?? null } });

          const shapeMap = new Map<string, string>();
          for (const m of src.shapes) {
            const condId = condMap.get(m.conditionId);
            if (!condId) continue;
            const made = await tx.takeoffMeasurement.create({
              data: { ...fields(m, ["sheetId", "conditionId", "materialItemId", "sections"]), sheetId: sheetMap.get(m.sheetId)!, conditionId: condId, materialItemId: item(m.materialItemId) } as never,
            });
            shapeMap.set(m.id, made.id);
          }
          // Joists broken at walls name those walls (and the takeoffs their pieces go to): the copies.
          for (const m of src.shapes)
            if (m.sections && shapeMap.has(m.id)) await tx.takeoffMeasurement.update({ where: { id: shapeMap.get(m.id)! }, data: { sections: remapIds(m.sections, shapeMap, condMap) } });

          for (const s of src.subs) {
            const fromItem = item(s.fromItemId);
            if (!fromItem) continue;
            await tx.jobSubstitution.create({ data: { ...fields(s, ["projectId", "fromItemId", "toItemId", "restore"]), projectId: project.id, fromItemId: fromItem, toItemId: item(s.toItemId), restore: null } as never });
          }
        },
        { timeout: 180_000 },
      );

      // The newest estimate, as a draft, its lines on their cost codes and the copied takeoffs.
      let estimateId: string | null = null;
      const est = src.estimate;
      if (est) {
        await db.$transaction(
          async (tx) => {
            const made = await tx.estimate.create({
              data: {
                projectId: project.id,
                name: est.name,
                version: 1,
                status: "DRAFT",
                defaultMarkup: est.defaultMarkup,
                markupTable: est.markupTable,
                notes: est.notes,
                terms: est.terms,
                basePrice: est.basePrice,
              },
            });
            estimateId = made.id;
            for (const v of est.parameterValues) {
              const pid = paramMap.get(v.parameterId);
              if (pid) await tx.estimateParameterValue.create({ data: { estimateId: made.id, parameterId: pid, value: v.value } });
            }
            await copyIntoEstimate(
              tx,
              made.id,
              {
                specs: est.specs,
                items: est.items.map((i) => ({
                  ...i,
                  costCodeId: code(i.costCodeId),
                  materialItemId: item(i.materialItemId),
                  takeoffConditionId: i.takeoffConditionId ? (condMap.get(i.takeoffConditionId) ?? null) : null,
                  takeoffItemId: i.takeoffItemId ? (asmMap.get(i.takeoffItemId) ?? null) : null,
                })),
              },
              { keepSelectionLinks: false },
            );
          },
          { timeout: 120_000 },
        );
      }
      for (const v of src.projectParams) {
        const pid = paramMap.get(v.parameterId);
        if (pid) await db.projectParameterValue.create({ data: { projectId: project.id, parameterId: pid, value: v.value } });
      }

      // The schedule, its dates as they were (no one assigned: the people are the other builder's).
      if (src.tasks.length) {
        await db.$transaction(async (tx) => {
          const taskMap = new Map<string, string>();
          for (const [i, t] of src.tasks.entries()) {
            const made = await tx.scheduleTask.create({
              data: { projectId: project.id, name: t.name, phase: t.phase, startDate: t.startDate, endDate: t.endDate, isMilestone: t.isMilestone, color: t.color, notes: t.notes, sortOrder: i },
            });
            taskMap.set(t.id, made.id);
          }
          for (const l of src.links)
            if (taskMap.has(l.taskId) && taskMap.has(l.predecessorId) && l.taskId !== l.predecessorId)
              await tx.taskLink.create({ data: { taskId: taskMap.get(l.taskId)!, predecessorId: taskMap.get(l.predecessorId)!, lagDays: l.lagDays } });
        });
      }

      // Under contract: the estimate approved (the budget follows it), the job Contracted.
      if (opts.contract && estimateId) {
        const now = new Date();
        await db.estimate.update({ where: { id: estimateId }, data: { status: "APPROVED", sentAt: now, approvedAt: now } });
        await db.project.update({ where: { id: project.id }, data: { status: "CONTRACTED" } });
      }

      if (opts.changeOrders) await sampleChangeOrders(project.id, client ? `${client.firstName} ${client.lastName}`.trim() : "Client", [...new Set(codeMap.values())]);
    } catch (err) {
      // A copy that fails part-way leaves no half job behind (lists it added to stay — they're theirs now).
      await db.project.delete({ where: { id: project.id } }).catch(() => {});
      for (const key of copiedFiles) await deleteUpload(key).catch(() => {});
      throw err;
    }
    return { number: project.number, name: project.name };
  });
}

/**
 * A few made-up change orders on the copy: two approved (they count toward the contract and the
 * budget), one waiting on the client, one draft. Each line on a cost code the job uses, where one fits.
 */
async function sampleChangeOrders(projectId: string, clientName: string, jobCodes: string[]) {
  const codes = await db.costCode.findMany({ where: { active: true }, select: { id: true, name: true } });
  const pick = (re: RegExp) => codes.find((c) => jobCodes.includes(c.id) && re.test(c.name))?.id ?? codes.find((c) => re.test(c.name))?.id ?? jobCodes[0] ?? null;
  const day = 86_400_000;
  const now = Date.now();
  const orders: { title: string; reason: string; days: number; status: "APPROVED" | "PENDING_APPROVAL" | "DRAFT"; lines: [string, number, RegExp][] }[] = [
    {
      title: "Add a covered back patio",
      reason: "Client request",
      days: 6,
      status: "APPROVED",
      lines: [
        ["Patio slab, 12' x 16'", 3840, /flatwork|concrete|patio|sidewalk/i],
        ["Patio cover framing and roof tie-in", 2880, /framing/i],
        ["Two exterior fans and a light", 640, /electric/i],
      ],
    },
    {
      title: "Upgrade to black exterior windows",
      reason: "Client request",
      days: 0,
      status: "APPROVED",
      lines: [["Black/black window package upgrade", 4275, /window/i]],
    },
    {
      title: "Gas fireplace in the living room",
      reason: "Client request",
      days: 3,
      status: "PENDING_APPROVAL",
      lines: [
        ["Direct-vent gas fireplace with stone surround", 6150, /fireplace|masonry|stone/i],
        ["Gas line to the fireplace", 480, /plumb|gas/i],
      ],
    },
    {
      title: "Extra outlets in the garage",
      reason: "Client request",
      days: 0,
      status: "DRAFT",
      lines: [["Four 20-amp outlets on the garage walls", 560, /electric/i]],
    },
  ];
  for (const [n, o] of orders.entries()) {
    const co = await newChangeOrder(projectId, { title: o.title, reason: o.reason, scheduleImpactDays: o.days });
    for (const [k, [description, amount, re]] of o.lines.entries())
      await db.changeOrderItem.create({
        data: { changeOrderId: co.id, kind: "LINE", description, quantity: 1, unit: "ea", unitCost: amount, markupPct: 0, clientPrice: amount, costCodeId: pick(re), sortOrder: k, taxed: co.taxPct > 0 },
      });
    const sent = new Date(now - (20 - n * 5) * day);
    if (o.status === "APPROVED")
      await db.changeOrder.update({
        where: { id: co.id },
        data: { status: "APPROVED", sentAt: sent, clientApproval: true, clientApprovedAt: new Date(sent.getTime() + 2 * day), decidedAt: new Date(sent.getTime() + 2 * day), decidedBy: clientName },
      });
    else if (o.status === "PENDING_APPROVAL") await db.changeOrder.update({ where: { id: co.id }, data: { status: "PENDING_APPROVAL", sentAt: sent, clientApproval: true } });
  }
}
