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
export async function createPlanFromFile(opts: {
  file: File;
  projectId: string;
  userId: string;
  clientVisible: boolean;
  name?: string;
  revisionOf?: string | null;
}) {
  const { file } = opts;
  if (!planKind(file)) throw new Error(`${file.name}: plans must be a PDF or a PNG, JPG or WebP image`);
  await planBeingRevised(opts.projectId, opts.revisionOf);
  const meta = await saveUpload(file, opts.projectId, PLAN_MAX_BYTES, "plan");
  return recordPlan({ ...opts, meta });
}

/** The plan set a new revision replaces (checked before anything is stored), or null for a new plan set. */
async function planBeingRevised(projectId: string, revisionOf: string | null | undefined) {
  const prev = revisionOf ? await db.takeoffPlan.findFirst({ where: { id: revisionOf, projectId }, select: { id: true, name: true, revision: true } }) : null;
  if (revisionOf && !prev) throw new Error("The plan set this revises wasn't found");
  return prev;
}

/**
 * A plan set already stored (sent straight to cloud storage, and checked: direct-upload.ts) — recorded the
 * same way as one uploaded through the server: in Files → Plans, with a takeoff plan pointing at it.
 */
export async function recordPlan(opts: {
  meta: { name: string; storagePath: string; mimeType: string; size: number };
  projectId: string;
  userId: string;
  clientVisible: boolean;
  name?: string;
  revisionOf?: string | null;
}) {
  const { meta, projectId, userId } = opts;
  const kind = meta.mimeType === "application/pdf" ? "PDF" : IMAGE_TYPES.includes(meta.mimeType) ? "IMAGE" : null;
  if (!kind) {
    await deleteUpload(meta.storagePath);
    throw new Error(`${meta.name}: plans must be a PDF or a PNG, JPG or WebP image`);
  }
  let prev: Awaited<ReturnType<typeof planBeingRevised>>;
  try {
    prev = await planBeingRevised(projectId, opts.revisionOf);
  } catch (err) {
    await deleteUpload(meta.storagePath);
    throw err;
  }
  const name = opts.name?.trim() || prev?.name || meta.name.replace(/\.[^.]+$/, "");
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
