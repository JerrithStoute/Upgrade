import "server-only";
import { db } from "./db";
import { fmtDateTime } from "./utils";
import { noteChange } from "./selection-activity";

/**
 * Proof a client saw a file: the first time they open it (its link — a thumbnail on a
 * card doesn't count) it's remembered, and written in the selection's change log
 * ("Sarah Whitfield opened spec-sheet.pdf"). A client can't pick a choice until
 * they've opened its files (see requiredFiles).
 */
export async function recordClientView(file: { id: string; name: string; selectionId: string | null; selectionOptionId: string | null }, user: { id: string; name: string }) {
  const had = await db.fileView.findUnique({ where: { fileId_userId: { fileId: file.id, userId: user.id } }, select: { id: true } });
  if (had) return;
  await db.fileView.create({ data: { fileId: file.id, userId: user.id } });
  const selectionId =
    file.selectionId ??
    (file.selectionOptionId ? ((await db.selectionOption.findUnique({ where: { id: file.selectionOptionId }, select: { selectionId: true } }))?.selectionId ?? null) : null);
  if (selectionId) await noteChange(selectionId, { id: user.id, name: user.name }, `Opened "${file.name}"`);
}

/**
 * Who has seen each file. For a client: when they opened it (or null). For your team:
 * "Sarah Whitfield viewed Oct 6, 2026 2:14 PM" — clients only — or null.
 */
export async function fileSeen(fileIds: string[], viewer: { id: string; forClient: boolean }) {
  const seen = new Map<string, string>();
  if (!fileIds.length) return seen;
  const views = await db.fileView.findMany({
    where: { fileId: { in: fileIds }, ...(viewer.forClient ? { userId: viewer.id } : { user: { role: "CLIENT" } }) },
    orderBy: { viewedAt: "asc" },
    select: { fileId: true, viewedAt: true, user: { select: { name: true } } },
  });
  for (const v of views) {
    if (seen.has(v.fileId)) continue;
    seen.set(v.fileId, viewer.forClient ? v.viewedAt.toISOString() : `${v.user.name} viewed ${fmtDateTime(v.viewedAt)}`);
  }
  return seen;
}

/** The files a client must open before picking this choice: the selection's (not their own uploads) and the choice's — its picture and documents. */
export async function requiredFiles(selectionId: string, optionId: string, clientUserId: string) {
  const [selFiles, optFiles] = await Promise.all([
    db.fileAsset.findMany({ where: { selectionId, clientVisible: true, NOT: { uploadedById: clientUserId } }, select: { id: true, name: true } }),
    db.fileAsset.findMany({ where: { selectionOptionId: optionId, clientVisible: true }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, mimeType: true } }),
  ]);
  // A choice shows one picture (the newest); older ones aren't on the card.
  const firstImage = optFiles.find((f) => f.mimeType.startsWith("image/"));
  const choice = optFiles.filter((f) => !f.mimeType.startsWith("image/") || f === firstImage);
  return [...selFiles, ...choice];
}
