import "server-only";
import path from "path";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { saveUpload } from "./uploads";

type Client = Prisma.TransactionClient | typeof db;
type Who = { id: string | null; name: string };

/**
 * What happens on a selection: the change log ("Jordan added choice #3"), the
 * UPDATED flag (someone else changed it since you last looked), comments and files.
 */
export async function noteChange(selectionId: string, who: Who, what: string, client: Client = db) {
  await client.selectionLog.create({ data: { selectionId, userId: who.id, who: who.name, what } });
  await client.selection.update({ where: { id: selectionId }, data: { changedAt: new Date(), changedById: who.id } });
}

/** Comments count as a change too (the other side sees UPDATED), but aren't in the change log. */
export async function addComment(selectionId: string, who: Who, body: string, internal: boolean) {
  await db.selectionComment.create({ data: { selectionId, userId: who.id, authorName: who.name, body, internal } });
  await db.selection.update({ where: { id: selectionId }, data: { changedAt: new Date(), changedById: who.id } });
}

/** Which of these selections someone else changed since this person last looked. */
export async function updatedSince(userId: string, selections: { id: string; changedAt: Date | null; changedById: string | null }[]) {
  const views = await db.selectionView.findMany({ where: { userId, selectionId: { in: selections.map((s) => s.id) } } });
  const seen = new Map(views.map((v) => [v.selectionId, v.viewedAt]));
  return new Set(
    selections
      .filter((s) => s.changedAt && s.changedById !== userId)
      .filter((s) => {
        const at = seen.get(s.id);
        // Never looked: only flag what changed after the selection was first set up (otherwise everything is "updated").
        return at ? s.changedAt! > at : false;
      })
      .map((s) => s.id),
  );
}

/** This person has now seen these selections (the flag clears on their next visit). */
export async function markViewed(userId: string, selectionIds: string[]) {
  const now = new Date();
  for (const selectionId of selectionIds)
    await db.selectionView.upsert({ where: { selectionId_userId: { selectionId, userId } }, create: { selectionId, userId, viewedAt: now }, update: { viewedAt: now } });
}

const SELECTION_FILE_MAX = 25 * 1024 * 1024;
const PICTURE = /^image\/(png|jpe?g|webp|gif)$/;

/** Saves files onto a selection (shown to the client too, and in the job's Files). Returns their names. */
export async function saveSelectionFiles(projectId: string, selectionId: string, files: File[], uploadedById: string) {
  const names: string[] = [];
  for (const file of files) {
    if (!file.size) continue;
    const meta = await saveUpload(file, projectId, SELECTION_FILE_MAX);
    await db.fileAsset.create({
      data: { ...meta, projectId, selectionId, uploadedById, folder: PICTURE.test(meta.mimeType) ? "Photos" : "Documents", clientVisible: true },
    });
    names.push(file.name);
  }
  return names;
}

/** A choice's picture (replaces the one before). Pictures only. */
export async function saveChoicePicture(projectId: string, optionId: string, file: File, uploadedById: string) {
  if (!PICTURE.test(file.type)) throw new Error("A choice's picture must be a PNG, JPG, WebP or GIF image");
  // The picture before it is let go (it stays in the job's files); the choice's documents stay.
  await db.fileAsset.updateMany({ where: { selectionOptionId: optionId, mimeType: { startsWith: "image/" } }, data: { selectionOptionId: null } });
  const meta = await saveUpload(file, projectId, SELECTION_FILE_MAX);
  await db.fileAsset.create({
    data: { ...meta, name: meta.name || `choice${path.extname(file.name)}`, projectId, selectionOptionId: optionId, uploadedById, folder: "Photos", clientVisible: true },
  });
}

/**
 * Files on a choice: a picture becomes the choice's picture; anything else (a PDF spec
 * sheet, a quote) is one of its documents — the client sees them too.
 */
export async function saveChoiceFiles(projectId: string, optionId: string, files: File[], uploadedById: string) {
  const names: string[] = [];
  for (const file of files) {
    if (!file.size) continue;
    if (PICTURE.test(file.type)) await saveChoicePicture(projectId, optionId, file, uploadedById);
    else {
      const meta = await saveUpload(file, projectId, SELECTION_FILE_MAX);
      await db.fileAsset.create({ data: { ...meta, projectId, selectionOptionId: optionId, uploadedById, folder: "Documents", clientVisible: true } });
    }
    names.push(file.name);
  }
  return names;
}

/** Comments, change log, files and pictures for the cards. `forClient` leaves out team-only comments and hidden files. */
export async function selectionExtras(selectionIds: string[], forClient: boolean) {
  const [comments, log, files, pictures, choiceDocs] = await Promise.all([
    db.selectionComment.findMany({ where: { selectionId: { in: selectionIds }, ...(forClient ? { internal: false } : {}) }, orderBy: { createdAt: "asc" } }),
    forClient ? [] : db.selectionLog.findMany({ where: { selectionId: { in: selectionIds } }, orderBy: { createdAt: "desc" } }),
    db.fileAsset.findMany({
      where: { selectionId: { in: selectionIds }, ...(forClient ? { clientVisible: true } : {}) },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, mimeType: true, selectionId: true, uploadedById: true },
    }),
    db.fileAsset.findMany({
      where: { selectionOption: { selectionId: { in: selectionIds } }, mimeType: { startsWith: "image/" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, selectionOptionId: true },
    }),
    db.fileAsset.findMany({
      where: { selectionOption: { selectionId: { in: selectionIds } }, NOT: { mimeType: { startsWith: "image/" } }, ...(forClient ? { clientVisible: true } : {}) },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, selectionOptionId: true },
    }),
  ]);
  const by = <T extends { selectionId: string | null }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) if (r.selectionId) m.set(r.selectionId, [...(m.get(r.selectionId) ?? []), r]);
    return m;
  };
  const picture = new Map<string, string>();
  for (const p of pictures) if (p.selectionOptionId && !picture.has(p.selectionOptionId)) picture.set(p.selectionOptionId, p.id);
  const choiceFiles = new Map<string, { id: string; name: string }[]>();
  for (const d of choiceDocs) if (d.selectionOptionId) choiceFiles.set(d.selectionOptionId, [...(choiceFiles.get(d.selectionOptionId) ?? []), { id: d.id, name: d.name }]);
  return { comments: by(comments), log: by(log), files: by(files), picture, choiceFiles };
}
