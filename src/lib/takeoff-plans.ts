import "server-only";
import { db } from "./db";
import { logActivity } from "./activity";
import { PLAN_MAX_BYTES, deleteUpload, saveUpload } from "./uploads";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function planKind(file: File): "PDF" | "IMAGE" | null {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "PDF";
  if (IMAGE_TYPES.includes(file.type)) return "IMAGE";
  return null;
}

/**
 * Saves an uploaded plan set: the file goes into Files → Plans and a takeoff plan
 * points at it. Images are one sheet; PDF pages are counted when the plan is first opened.
 * `revisionOf`: it's a new revision of that plan set (Rev 2 of "Electrical"), keeping its name.
 */
export async function createPlanFromFile(opts: { file: File; projectId: string; userId: string; clientVisible: boolean; name?: string; revisionOf?: string | null }) {
  const { file, projectId, userId } = opts;
  const kind = planKind(file);
  if (!kind) throw new Error(`${file.name}: plans must be a PDF or a PNG, JPG or WebP image`);
  const prev = opts.revisionOf ? await db.takeoffPlan.findFirst({ where: { id: opts.revisionOf, projectId }, select: { id: true, name: true, revision: true } }) : null;
  if (opts.revisionOf && !prev) throw new Error("The plan set this revises wasn't found");
  const meta = await saveUpload(file, projectId, PLAN_MAX_BYTES);
  const name = opts.name?.trim() || prev?.name || file.name.replace(/\.[^.]+$/, "");
  try {
    const plan = await db.$transaction(async (tx) => {
      const asset = await tx.fileAsset.create({
        data: {
          ...meta,
          mimeType: kind === "PDF" ? "application/pdf" : meta.mimeType,
          projectId,
          uploadedById: userId,
          folder: "Plans",
          clientVisible: opts.clientVisible,
        },
      });
      return tx.takeoffPlan.create({
        data: {
          projectId,
          fileId: asset.id,
          name,
          kind,
          pageCount: kind === "PDF" ? null : 1,
          sheets: kind === "PDF" ? undefined : { create: { pageNumber: 1, name: "Sheet 1" } },
          revisionOfId: prev?.id ?? null,
          revision: prev ? prev.revision + 1 : 1,
        },
      });
    });
    await logActivity({
      projectId,
      userId,
      type: "takeoff.plan_uploaded",
      description: prev ? `Uploaded revision ${plan.revision} of "${name}"` : `Uploaded plan "${name}" for takeoff`,
    });
    return plan;
  } catch (err) {
    await deleteUpload(meta.storagePath);
    throw err;
  }
}
