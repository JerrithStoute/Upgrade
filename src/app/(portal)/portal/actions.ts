"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { str, strOrNull } from "@/lib/utils";
import { addComment, noteChange, saveSelectionFiles } from "@/lib/selection-activity";
import { deleteUpload } from "@/lib/uploads";
import { applyDecline, finalizeIfApproved } from "@/lib/change-orders-server";
import { syncSelectionChangeOrder } from "@/lib/billing-flow";
import { fileSeen, requiredFiles } from "@/lib/file-views";
import { headers } from "next/headers";

function revalidatePortal(projectId: string) {
  revalidatePath("/portal", "layout");
  revalidatePath(`/projects/${projectId}`, "layout");
}

/** Load a selection and verify the client owns its project. */
async function ownedSelection(clientId: string, id: string) {
  const selection = await db.selection.findFirst({
    where: { id, project: { clientId } },
    include: { options: true, project: { select: { id: true, name: true } } },
  });
  if (!selection) throw new Error("Selection not found");
  return selection;
}

// ---------------------------------------------------------------------------
// Selections
// ---------------------------------------------------------------------------

/** Client view (a team member looking): the client's buttons do nothing — and say so. */
const PREVIEW = { ok: false as const, error: "This is Client view — only your client can do this." };
async function stopIfPreview(user: { preview: boolean }) {
  if (!user.preview) return;
  let back = "/portal";
  try {
    const ref = new URL((await headers()).get("referer") ?? "");
    if (ref.pathname.startsWith("/portal")) back = ref.pathname + ref.search;
  } catch {
    /* no referer */
  }
  redirect(back);
}

export async function chooseOption(formData: FormData) {
  const user = await requireClient();
  await stopIfPreview(user);
  const selectionId = str(formData, "selectionId");
  const optionId = str(formData, "optionId");
  const selection = await ownedSelection(user.clientId, selectionId);
  if (!["PENDING", "CHOSEN"].includes(selection.status)) throw new Error("This selection can no longer be changed");
  const option = selection.options.find((o) => o.id === optionId);
  if (!option) throw new Error("Option not found");
  // Same rule as the selections page: everything on it opened first.
  const required = await requiredFiles(selection.id, option.id, user.id);
  const seen = await fileSeen(
    required.map((f) => f.id),
    { id: user.id, forClient: true },
  );
  const missing = required.filter((f) => !seen.has(f.id));
  if (missing.length) throw new Error(`Please open ${missing.map((f) => `"${f.name}"`).join(", ")} on your Selections page before choosing this one.`);

  await db.selection.update({
    where: { id: selection.id },
    data: { chosenOptionId: option.id, status: "CHOSEN", chosenAt: new Date() },
  });
  await logActivity({
    projectId: selection.projectId,
    userId: user.id,
    type: "selection.chosen",
    description: `Client chose "${option.name}" for ${selection.title}`,
  });
  await syncSelectionChangeOrder(selection.id, user);
  revalidatePortal(selection.projectId);
  redirect(`/portal/selections/${selection.id}`);
}

export async function approveSelection(formData: FormData) {
  const user = await requireClient();
  await stopIfPreview(user);
  const selectionId = str(formData, "selectionId");
  const selection = await ownedSelection(user.clientId, selectionId);
  if (selection.status !== "CHOSEN" || !selection.chosenOptionId) throw new Error("Choose an option before approving");
  const option = selection.options.find((o) => o.id === selection.chosenOptionId);

  await db.selection.update({
    where: { id: selection.id },
    data: { status: "APPROVED", approvedAt: new Date() },
  });
  await logActivity({
    projectId: selection.projectId,
    userId: user.id,
    type: "selection.approved",
    description: `Client approved "${option?.name ?? "selection"}" for ${selection.title}`,
  });
  revalidatePortal(selection.projectId);
  redirect(`/portal/selections/${selection.id}`);
}

// --- The selections cards (choose, comment, files) -------------------------------

type Result = { ok: true } | { ok: false; error: string };

/** The client's choice: a choice's id, "DECLINED" ("I do not want this selection"). Not once it's approved / ordered. */
/** The client's choice (a choice's id), "DECLINED", or null to clear it. */
export async function clientMakeChoice(selectionId: string, choice: string | null): Promise<Result> {
  const user = await requireClient();
  if (user.preview) return PREVIEW;
  const sel = await ownedSelection(user.clientId, selectionId);
  if (!["PENDING", "CHOSEN", "DECLINED"].includes(sel.status)) return { ok: false, error: "This selection is final — ask your builder to change it." };
  if (choice === null) {
    await db.selection.update({ where: { id: sel.id }, data: { chosenOptionId: null, status: "PENDING", chosenAt: null } });
    await noteChange(sel.id, user, "Cleared the choice");
  } else if (choice === "DECLINED") {
    await db.selection.update({ where: { id: sel.id }, data: { chosenOptionId: null, status: "DECLINED", chosenAt: new Date() } });
    await noteChange(sel.id, user, "Chose: I do not want this selection");
  } else {
    const opt = sel.options.find((o) => o.id === choice);
    if (!opt) return { ok: false, error: "Choice not found" };
    // Everything on it opened first — proof they saw it before choosing.
    const required = await requiredFiles(sel.id, opt.id, user.id);
    const seen = await fileSeen(
      required.map((f) => f.id),
      { id: user.id, forClient: true },
    );
    const missing = required.filter((f) => !seen.has(f.id));
    if (missing.length) return { ok: false, error: `Please open ${missing.map((f) => `"${f.name}"`).join(", ")} before choosing this one.` };
    await db.selection.update({ where: { id: sel.id }, data: { chosenOptionId: opt.id, status: "CHOSEN", chosenAt: new Date() } });
    await noteChange(sel.id, user, `Chose "${opt.name}"`);
  }
  await logActivity({ projectId: sel.projectId, userId: user.id, type: "selection.chosen", description: `Client made a choice for ${sel.title}` });
  await syncSelectionChangeOrder(sel.id, user);
  revalidatePortal(sel.projectId);
  return { ok: true };
}

export async function clientComment(selectionId: string, body: string): Promise<Result> {
  const user = await requireClient();
  if (user.preview) return PREVIEW;
  const text = body.trim().slice(0, 5000);
  if (!text) return { ok: false, error: "Write a comment first" };
  const sel = await ownedSelection(user.clientId, selectionId);
  await addComment(sel.id, user, text, false);
  revalidatePortal(sel.projectId);
  return { ok: true };
}

export async function clientAddFiles(selectionId: string, fd: FormData): Promise<Result> {
  const user = await requireClient();
  if (user.preview) return PREVIEW;
  const sel = await ownedSelection(user.clientId, selectionId);
  try {
    const names = await saveSelectionFiles(
      sel.projectId,
      sel.id,
      fd.getAll("files").filter((f): f is File => f instanceof File),
      user.id,
    );
    if (names.length) await noteChange(sel.id, user, `Added ${names.length === 1 ? `file "${names[0]}"` : `${names.length} files`}`);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePortal(sel.projectId);
  return { ok: true };
}

/** Clients can remove only files they added. */
export async function clientRemoveFile(fileId: string): Promise<Result> {
  const user = await requireClient();
  if (user.preview) return PREVIEW;
  const file = await db.fileAsset.findFirst({ where: { id: fileId, uploadedById: user.id, selectionId: { not: null }, project: { clientId: user.clientId } } });
  if (!file) return { ok: false, error: "You can only remove files you added" };
  await db.fileAsset.delete({ where: { id: file.id } });
  await deleteUpload(file.storagePath);
  if (file.selectionId) await noteChange(file.selectionId, user, `Removed file "${file.name}"`);
  revalidatePortal(file.projectId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Change orders
// ---------------------------------------------------------------------------

async function ownedPendingChangeOrder(clientId: string, id: string) {
  const co = await db.changeOrder.findFirst({ where: { id, project: { clientId } } });
  if (!co) throw new Error("Change order not found");
  if (co.status !== "PENDING_APPROVAL" || !co.clientApproval || co.clientApprovedAt) throw new Error("This change order is not awaiting your approval");
  return co;
}

export async function approveChangeOrder(formData: FormData) {
  const user = await requireClient();
  await stopIfPreview(user);
  const id = str(formData, "id");
  const signature = str(formData, "signature");
  const note = strOrNull(formData, "note");
  if (!signature) throw new Error("Type your name to sign");
  const co = await ownedPendingChangeOrder(user.clientId, id);

  // The client's signature; it's approved once every team member listed on it has approved too.
  await db.changeOrder.update({
    where: { id: co.id },
    data: { clientApprovedAt: new Date(), decidedBy: signature, decisionNote: note },
  });
  await finalizeIfApproved(co.id, user);
  await logActivity({
    projectId: co.projectId,
    userId: user.id,
    type: "change_order.approved",
    description: `Client approved change order #${co.number} "${co.title}" (signed ${signature})`,
  });
  revalidatePortal(co.projectId);
  redirect(`/portal/change-orders/${co.id}`);
}

export async function declineChangeOrder(formData: FormData) {
  const user = await requireClient();
  await stopIfPreview(user);
  const id = str(formData, "id");
  const note = strOrNull(formData, "note");
  const co = await ownedPendingChangeOrder(user.clientId, id);

  await db.changeOrder.update({
    where: { id: co.id },
    data: { status: "DECLINED", decidedAt: new Date(), decidedBy: user.name, decisionNote: note },
  });
  await applyDecline(co.id, user);
  await logActivity({
    projectId: co.projectId,
    userId: user.id,
    type: "change_order.declined",
    description: `Client declined change order #${co.number} "${co.title}"${note ? `: ${note}` : ""}`,
  });
  revalidatePortal(co.projectId);
  redirect(`/portal/change-orders/${co.id}`);
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export async function replyToThread(formData: FormData) {
  const user = await requireClient();
  await stopIfPreview(user);
  const threadId = str(formData, "threadId");
  const body = str(formData, "body");
  if (!body) redirect(`/portal/messages?thread=${threadId}`);

  const thread = await db.messageThread.findFirst({
    where: { id: threadId, clientVisible: true, project: { clientId: user.clientId } },
  });
  if (!thread) throw new Error("Conversation not found");

  await db.message.create({ data: { threadId: thread.id, authorId: user.id, body } });
  await db.messageThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } });
  await logActivity({
    projectId: thread.projectId,
    userId: user.id,
    type: "message.sent",
    description: `Client replied in "${thread.subject}"`,
  });
  revalidatePortal(thread.projectId);
  redirect(`/portal/messages?project=${thread.projectId}&thread=${thread.id}`);
}

export async function createThread(formData: FormData) {
  const user = await requireClient();
  await stopIfPreview(user);
  const projectId = str(formData, "projectId");
  const subject = str(formData, "subject");
  const body = str(formData, "body");
  if (!subject || !body) redirect(`/portal/messages?project=${projectId}`);

  const project = await db.project.findFirst({ where: { id: projectId, clientId: user.clientId }, select: { id: true } });
  if (!project) throw new Error("Project not found");

  const thread = await db.messageThread.create({
    data: {
      projectId: project.id,
      subject,
      clientVisible: true,
      messages: { create: { authorId: user.id, body } },
    },
  });
  await logActivity({
    projectId: project.id,
    userId: user.id,
    type: "message.created",
    description: `Client started conversation "${subject}"`,
  });
  revalidatePortal(project.id);
  redirect(`/portal/messages?project=${project.id}&thread=${thread.id}`);
}
