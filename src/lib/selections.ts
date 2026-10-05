import "server-only";
import { db } from "./db";
import { ensureEstimateSpecs } from "./estimate-lines";
import { allowanceAmount } from "./proposal-options";
import { tiedDeadline } from "./deadlines";
import { allowanceExtras, parseMarkupTable } from "./markup";
import { markViewed, noteChange, selectionExtras, updatedSince } from "./selection-activity";
import { fileSeen } from "./file-views";

/** Selections tied to a schedule item: their deadline follows the item's start date. */
export async function refreshTiedDeadlines(projectId: string) {
  const tied = await db.selection.findMany({
    where: { projectId, scheduleTaskId: { not: null } },
    select: { id: true, dueDate: true, leadDays: true, scheduleTask: { select: { startDate: true } } },
  });
  for (const s of tied) {
    if (!s.scheduleTask) continue;
    const due = tiedDeadline(s.scheduleTask.startDate, s.leadDays);
    if (s.dueDate?.getTime() !== due.getTime()) await db.selection.update({ where: { id: s.id }, data: { dueDate: due } });
  }
}

/** The job's schedule items, for "Requested by" pickers. */
export function scheduleOptions(projectId: string) {
  return db.scheduleTask.findMany({ where: { projectId }, orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }], select: { id: true, name: true, startDate: true } });
}

/**
 * Selections come from the estimate: every category marked Selection, or with an
 * allowance, is a selection on the job. The estimate they come from is the latest
 * approved version, else the latest one. Each keeps one Selection record (its
 * choices, what the client chose) that new estimate versions stay linked to.
 */
export async function currentEstimate(projectId: string) {
  return (
    (await db.estimate.findFirst({ where: { projectId, status: "APPROVED" }, orderBy: { version: "desc" } })) ??
    (await db.estimate.findFirst({ where: { projectId }, orderBy: { version: "desc" } }))
  );
}

export type SelectionCard = Awaited<ReturnType<typeof loadSelectionBoard>>["cards"][number];

/** The job's selections, kept in step with its estimate (names, spec text and allowance follow the estimate). */
export async function loadSelectionBoard(projectId: string) {
  const [est, company] = await Promise.all([currentEstimate(projectId), db.company.findFirst({ select: { allowanceProfit: true } })]);
  const profitDefault = company?.allowanceProfit ?? false;
  const markup = est ? parseMarkupTable(est.markupTable, est.defaultMarkup) : [];
  if (est) await ensureEstimateSpecs(est.id);
  await refreshTiedDeadlines(projectId);
  const specs = est
    ? await db.estimateSpec.findMany({
        where: { estimateId: est.id, OR: [{ kind: "SELECTION" }, { isAllowance: true }] },
        include: { items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      })
    : [];
  const existing = await db.selection.findMany({
    where: { projectId },
    include: { options: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }, scheduleTask: { select: { id: true, name: true, startDate: true } } },
  });
  const byId = new Map(existing.map((s) => [s.id, s]));

  const cards = [];
  for (const spec of specs) {
    const withProfit = spec.allowanceProfit ?? profitDefault;
    // Plus what the table's rows marked "include in allowance amounts" add (overhead, tax…).
    const allowance = spec.isAllowance ? Math.round((allowanceAmount(spec.items, withProfit) + allowanceExtras(markup, spec.items)) * 100) / 100 : 0;
    const fields = { title: spec.name, category: spec.category, description: spec.specText, allowance };
    let sel = spec.selectionId ? byId.get(spec.selectionId) : undefined;
    if (!sel) {
      // A "requested by" date set on the estimate becomes the selection's deadline.
      const created = await db.selection.create({ data: { projectId, ...fields, dueDate: spec.requestedBy } });
      await db.estimateSpec.update({ where: { id: spec.id }, data: { selectionId: created.id } });
      sel = { ...created, options: [], scheduleTask: null };
      byId.set(created.id, sel);
    } else if (sel.title !== fields.title || sel.category !== fields.category || sel.description !== fields.description || Math.abs(sel.allowance - allowance) > 0.004) {
      const what =
        Math.abs(sel.allowance - allowance) > 0.004
          ? `Allowance changed to ${allowance.toLocaleString("en-US", { style: "currency", currency: "USD" })}`
          : sel.description !== fields.description
            ? "Specification updated"
            : "Renamed / moved on the estimate";
      sel = { ...sel, ...(await db.selection.update({ where: { id: sel.id }, data: fields })) };
      await noteChange(sel.id, { id: null, name: "Estimate" }, what);
      sel = { ...sel, changedAt: new Date(), changedById: null };
    }
    const included = spec.items.filter((i) => !i.isOptional);
    const cost = included.reduce((n, i) => n + i.quantity * i.unitCost, 0);
    const price = included.reduce((n, i) => n + i.quantity * i.unitCost * (1 + i.markupPct / 100), 0);
    cards.push({
      specId: spec.id,
      selectionId: sel.id,
      name: spec.name,
      division: spec.category,
      specText: spec.specText,
      clientNotes: spec.clientNotes,
      kind: spec.kind,
      isAllowance: spec.isAllowance,
      /** null = the company default (`withProfit`). */
      allowanceProfit: spec.allowanceProfit,
      withProfit,
      allowance: spec.isAllowance ? allowance : null,
      budget: {
        lines: included.map((i) => ({ id: i.id, description: i.description, cost: Math.round(i.quantity * i.unitCost * 100) / 100 })),
        profit: Math.round((price - cost) * 100) / 100,
        total: Math.round(price * 100) / 100,
      },
      choices: sel.options.map((o) => ({ id: o.id, name: o.name, description: o.description, price: o.price, cost: o.cost, vendor: o.vendor, modelNumber: o.modelNumber })),
      chosenId: sel.chosenOptionId,
      status: sel.status,
      chosenAt: sel.chosenAt,
      changedAt: sel.changedAt,
      changedById: sel.changedById,
      deadline: {
        date: sel.dueDate,
        task: sel.scheduleTask ? { id: sel.scheduleTask.id, name: sel.scheduleTask.name, startDate: sel.scheduleTask.startDate } : null,
        leadDays: sel.leadDays,
      },
    });
  }
  const linked = new Set(cards.map((c) => c.selectionId));
  const others = Array.from(byId.values()).filter((s) => !linked.has(s.id));
  return { estimate: est, cards, others, profitDefault };
}

/**
 * The board for one person: each card with its comments, change log, files, choice
 * pictures and whether someone else changed it since they last looked (UPDATED).
 * Looking at the board counts as having seen it.
 */
export async function boardForViewer(projectId: string, userId: string, forClient: boolean, opts: { markSeen?: boolean } = {}) {
  const board = await loadSelectionBoard(projectId);
  const ids = board.cards.map((c) => c.selectionId);
  const [extras, updated] = await Promise.all([
    selectionExtras(ids, forClient),
    updatedSince(
      userId,
      board.cards.map((c) => ({ id: c.selectionId, changedAt: c.changedAt, changedById: c.changedById })),
    ),
  ]);
  // (Client view looks without marking anything seen for the client.)
  if (opts.markSeen !== false) await markViewed(userId, ids);
  // Who opened each file (a client: themselves; your team: the client).
  const fileIds = [
    ...Array.from(extras.files.values()).flatMap((fs) => fs.map((f) => f.id)),
    ...Array.from(extras.picture.values()),
    ...Array.from(extras.choiceFiles.values()).flatMap((fs) => fs.map((f) => f.id)),
  ];
  const seen = await fileSeen(fileIds, { id: userId, forClient });
  const cards = board.cards.map((c) => ({
    ...c,
    updated: updated.has(c.selectionId),
    comments: (extras.comments.get(c.selectionId) ?? []).map((m) => ({
      id: m.id,
      author: m.authorName,
      body: m.body,
      internal: m.internal,
      at: m.createdAt,
      mine: m.userId === userId,
    })),
    log: (extras.log.get(c.selectionId) ?? []).map((l) => ({ id: l.id, who: l.who, what: l.what, at: l.createdAt })),
    files: (extras.files.get(c.selectionId) ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      isImage: f.mimeType.startsWith("image/"),
      mine: f.uploadedById === userId,
      seen: seen.get(f.id) ?? null,
    })),
    choices: c.choices.map((x) => {
      const pictureId = extras.picture.get(x.id) ?? null;
      return {
        ...x,
        pictureId,
        pictureSeen: pictureId ? (seen.get(pictureId) ?? null) : null,
        files: (extras.choiceFiles.get(x.id) ?? []).map((f) => ({ ...f, seen: seen.get(f.id) ?? null })),
      };
    }),
  }));
  return { ...board, cards };
}
export type ViewerCard = Awaited<ReturnType<typeof boardForViewer>>["cards"][number];
