"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { str, strOrNull } from "@/lib/utils";

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

export async function chooseOption(formData: FormData) {
  const user = await requireClient();
  const selectionId = str(formData, "selectionId");
  const optionId = str(formData, "optionId");
  const selection = await ownedSelection(user.clientId, selectionId);
  if (!["PENDING", "CHOSEN"].includes(selection.status)) throw new Error("This selection can no longer be changed");
  const option = selection.options.find((o) => o.id === optionId);
  if (!option) throw new Error("Option not found");

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
  revalidatePortal(selection.projectId);
  redirect(`/portal/selections/${selection.id}`);
}

export async function approveSelection(formData: FormData) {
  const user = await requireClient();
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

// ---------------------------------------------------------------------------
// Change orders
// ---------------------------------------------------------------------------

async function ownedPendingChangeOrder(clientId: string, id: string) {
  const co = await db.changeOrder.findFirst({ where: { id, project: { clientId } } });
  if (!co) throw new Error("Change order not found");
  if (co.status !== "PENDING_APPROVAL") throw new Error("This change order is not awaiting your approval");
  return co;
}

export async function approveChangeOrder(formData: FormData) {
  const user = await requireClient();
  const id = str(formData, "id");
  const signature = str(formData, "signature");
  const note = strOrNull(formData, "note");
  if (!signature) throw new Error("Type your name to sign");
  const co = await ownedPendingChangeOrder(user.clientId, id);

  await db.changeOrder.update({
    where: { id: co.id },
    data: { status: "APPROVED", decidedAt: new Date(), decidedBy: signature, decisionNote: note },
  });
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
  const id = str(formData, "id");
  const note = strOrNull(formData, "note");
  const co = await ownedPendingChangeOrder(user.clientId, id);

  await db.changeOrder.update({
    where: { id: co.id },
    data: { status: "DECLINED", decidedAt: new Date(), decidedBy: user.name, decisionNote: note },
  });
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
