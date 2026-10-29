"use server";

import { friendly } from "@/lib/friendly-action";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEdit } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { parseDateInput, str, strOrNull } from "@/lib/utils";
import { isOpen, warrantyLabel, warrantyNo } from "@/lib/warranty";
import { createWarranty, emailWarrantyAssignee, emailWarrantyToClient, emailWarrantyToVendor, photosFrom, saveWarrantyPhotos } from "@/lib/warranty-server";

/**
 * The team's side of warranty requests (the job's Warranty tab). A position that may edit
 * "Schedule, daily logs & to-dos" — warranty work is field work.
 */

function revalidate(projectId: string) {
  revalidatePath(`/projects/${projectId}/warranty`, "layout");
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/warranty");
  revalidatePath("/portal", "layout");
  revalidatePath("/vendor", "layout");
}

async function ownRequest(id: string) {
  const w = await db.warrantyRequest.findUnique({ where: { id } });
  if (!w) throw new Error("That warranty request isn't there anymore");
  return w;
}

/** Added by the team — from a phone call, a walk-through, an email. */
export const addWarranty = friendly(async function addWarranty(fd: FormData) {
  const user = await requireEdit("field");
  const project = await db.project.findUnique({ where: { id: str(fd, "projectId") }, select: { id: true } });
  if (!project) throw new Error("Job not found");
  const title = str(fd, "title").slice(0, 200);
  if (!title) throw new Error("Say what needs fixing");
  const row = await createWarranty({
    projectId: project.id,
    title,
    description: strOrNull(fd, "description")?.slice(0, 4000) ?? null,
    location: strOrNull(fd, "location")?.slice(0, 120) ?? null,
    urgent: fd.get("urgent") === "on",
    fromClient: false,
    by: user,
    photos: photosFrom(fd),
  });
  await logActivity({ projectId: project.id, userId: user.id, type: "warranty.created", description: `Warranty ${warrantyNo(row.number)} added: ${title}` });
  revalidate(project.id);
  redirect(`/projects/${project.id}/warranty/${row.id}`);
});

/** Who's fixing it, and when. A day set makes it Scheduled; taking the day off puts it back to New. */
export const assignWarranty = friendly(async function assignWarranty(fd: FormData) {
  const user = await requireEdit("field");
  const w = await ownRequest(str(fd, "id"));
  if (!isOpen(w.status)) throw new Error("This one is closed — reopen it first");
  const vendorId = strOrNull(fd, "vendorId");
  const assigneeId = strOrNull(fd, "assigneeId");
  if (vendorId && !(await db.vendor.findUnique({ where: { id: vendorId }, select: { id: true } }))) throw new Error("Pick a sub from the list");
  if (assigneeId && !(await db.user.findFirst({ where: { id: assigneeId, active: true, role: { in: ["ADMIN", "STAFF"] } }, select: { id: true } })))
    throw new Error("Pick someone on your team from the list");
  const scheduledFor = parseDateInput(fd.get("scheduledFor"));
  const status = scheduledFor ? "SCHEDULED" : "NEW";
  await db.warrantyRequest.update({ where: { id: w.id }, data: { vendorId, assigneeId, scheduledFor, status } });

  const vendorChanged = !!vendorId && vendorId !== w.vendorId;
  const dayChanged = (scheduledFor?.toDateString() ?? null) !== (w.scheduledFor?.toDateString() ?? null);
  if (vendorChanged || (vendorId && dayChanged && scheduledFor)) await emailWarrantyToVendor(w.id, user);
  if (assigneeId && assigneeId !== w.assigneeId) await emailWarrantyAssignee(w.id, user);
  if (scheduledFor && dayChanged && fd.get("tellClient") === "on") await emailWarrantyToClient(w.id, user, "SCHEDULED");
  await logActivity({ projectId: w.projectId, userId: user.id, type: "warranty.updated", description: `Warranty ${warrantyNo(w.number)}: ${warrantyLabel(status)}${scheduledFor ? ` for ${scheduledFor.toLocaleDateString()}` : ""}` });
  revalidate(w.projectId);
});

/** Done, or not covered — with what was done (or why not). The client is told unless you say not to. */
export const closeWarranty = friendly(async function closeWarranty(fd: FormData) {
  const user = await requireEdit("field");
  const w = await ownRequest(str(fd, "id"));
  const status = str(fd, "status") === "NOT_COVERED" ? "NOT_COVERED" : "DONE";
  const closeNote = strOrNull(fd, "closeNote")?.slice(0, 2000) ?? null;
  if (status === "NOT_COVERED" && !closeNote) throw new Error("Say why it isn't covered — the client reads it");
  await db.warrantyRequest.update({ where: { id: w.id }, data: { status, closeNote, closedAt: new Date() } });
  await saveWarrantyPhotos(w.id, w.projectId, photosFrom(fd), user.id);
  if (fd.get("tellClient") === "on") await emailWarrantyToClient(w.id, user, status);
  await logActivity({ projectId: w.projectId, userId: user.id, type: "warranty.closed", description: `Warranty ${warrantyNo(w.number)} ${warrantyLabel(status).toLowerCase()}: ${w.title}` });
  revalidate(w.projectId);
});

/** Back to open: Scheduled if it still has a day, else New. */
export const reopenWarranty = friendly(async function reopenWarranty(fd: FormData) {
  const user = await requireEdit("field");
  const w = await ownRequest(str(fd, "id"));
  await db.warrantyRequest.update({ where: { id: w.id }, data: { status: w.scheduledFor ? "SCHEDULED" : "NEW", closedAt: null } });
  await logActivity({ projectId: w.projectId, userId: user.id, type: "warranty.reopened", description: `Warranty ${warrantyNo(w.number)} reopened` });
  revalidate(w.projectId);
});

/** A note, and maybe photos. Team-only notes stay off the client's page (the sub sees them). */
export const noteWarranty = friendly(async function noteWarranty(fd: FormData) {
  const user = await requireEdit("field");
  const w = await ownRequest(str(fd, "id"));
  const body = str(fd, "body").slice(0, 4000);
  const photos = photosFrom(fd);
  if (!body && !photos.length) throw new Error("Write a note or add a photo");
  const teamOnly = fd.get("teamOnly") === "on";
  if (body) await db.warrantyNote.create({ data: { requestId: w.id, authorId: user.id, body, teamOnly } });
  await saveWarrantyPhotos(w.id, w.projectId, photos, user.id);
  if (body && !teamOnly) await emailWarrantyToClient(w.id, user, "NOTE", body);
  revalidate(w.projectId);
});

/** What it says: the title, where, what's wrong, urgent. */
export const editWarranty = friendly(async function editWarranty(fd: FormData) {
  await requireEdit("field");
  const w = await ownRequest(str(fd, "id"));
  const title = str(fd, "title").slice(0, 200);
  if (!title) throw new Error("Say what needs fixing");
  await db.warrantyRequest.update({
    where: { id: w.id },
    data: { title, location: strOrNull(fd, "location")?.slice(0, 120) ?? null, description: strOrNull(fd, "description")?.slice(0, 4000) ?? null, urgent: fd.get("urgent") === "on" },
  });
  revalidate(w.projectId);
});

/** Gone for good (added by mistake). Its photos stay in the job's Files. */
export const deleteWarranty = friendly(async function deleteWarranty(fd: FormData) {
  const user = await requireEdit("field");
  const w = await ownRequest(str(fd, "id"));
  await db.warrantyRequest.delete({ where: { id: w.id } });
  await logActivity({ projectId: w.projectId, userId: user.id, type: "warranty.deleted", description: `Warranty ${warrantyNo(w.number)} deleted: ${w.title}` });
  revalidate(w.projectId);
  redirect(`/projects/${w.projectId}/warranty`);
});
