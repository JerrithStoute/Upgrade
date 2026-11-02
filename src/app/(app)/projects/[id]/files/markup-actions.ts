"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FileAsset } from "@prisma/client";
import { friendly } from "@/lib/friendly-action";
import { requireStaff, type SessionUser } from "@/lib/auth";
import { allows, AREAS, type AreaKey } from "@/lib/access";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { saveUpload, deleteUpload } from "@/lib/uploads";
import { str } from "@/lib/utils";

/** Who may mark up a photo: whoever can change where it lives (a daily log, a selection…), or the job's files. */
function areaFor(file: FileAsset): AreaKey {
  if (file.dailyLogId || file.warrantyRequestId) return "field";
  if (file.selectionId || file.selectionOptionId || file.changeOrderId) return "selections";
  return "files";
}

async function photoFor(user: SessionUser, id: string) {
  const file = await db.fileAsset.findUnique({ where: { id } });
  if (!file || !file.mimeType.startsWith("image/")) throw new Error("Photo not found");
  const area = areaFor(file);
  if (!allows(user.access, area, 2) && !allows(user.access, "files", 2)) {
    const label = AREAS.find((a) => a.key === area)?.label ?? area;
    throw new Error(`Your position can't change ${label} — an admin can allow it in Directory → Team`);
  }
  return file;
}

function revalidate(projectId: string) {
  // A photo shows on the Files tab, its daily log, selection or warranty request: refresh the job's pages.
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/warranty", "layout");
}

/**
 * A photo marked up (draw, arrows, notes, crop, turn) after it was saved. The marked-up picture takes its
 * place everywhere; the first original is kept behind it, so **Undo markup** can always put it back.
 */
export async function markUpPhoto(fd: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireStaff();
  try {
    const file = await photoFor(user, str(fd, "id"));
    const edited = fd.get("photo");
    if (!(edited instanceof File) || !edited.size) throw new Error("The marked-up photo didn't come through — try again");
    const meta = await saveUpload(edited, file.projectId, undefined, "photo");
    // Marked up before: the earlier markup goes (the original stays kept).
    if (file.originalStoragePath) await deleteUpload(file.storagePath).catch(() => {});
    await db.fileAsset.update({
      where: { id: file.id },
      data: { storagePath: meta.storagePath, mimeType: meta.mimeType, size: meta.size, originalStoragePath: file.originalStoragePath ?? file.storagePath },
    });
    await logActivity({ projectId: file.projectId, userId: user.id, type: "file.markedUp", description: `Marked up "${file.name}"` });
    revalidate(file.projectId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The markup didn't save" };
  }
}

/** Puts a marked-up photo back the way it was uploaded; the markup is deleted. */
export const undoMarkup = friendly(async function undoMarkup(fd: FormData) {
  const user = await requireStaff();
  const file = await photoFor(user, str(fd, "id"));
  const back = str(fd, "returnTo");
  if (file.originalStoragePath) {
    await deleteUpload(file.storagePath).catch(() => {});
    await db.fileAsset.update({ where: { id: file.id }, data: { storagePath: file.originalStoragePath, originalStoragePath: null } });
    await logActivity({ projectId: file.projectId, userId: user.id, type: "file.markupUndone", description: `Took the markup off "${file.name}"` });
  }
  revalidate(file.projectId);
  redirect(back.startsWith(`/projects/${file.projectId}/`) ? back : `/projects/${file.projectId}/files`);
});
