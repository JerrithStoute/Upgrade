"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { logActivity } from "@/lib/activity";
import { boolField, str } from "@/lib/utils";

function messagesPath(projectId: string) {
  return `/projects/${projectId}/messages`;
}
function revalidate(projectId: string) {
  revalidatePath(messagesPath(projectId));
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/portal");
}

export async function createThread(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const subject = str(fd, "subject");
  const body = str(fd, "body");
  if (!subject || !body) throw new Error("Subject and message are required");
  const now = new Date();
  const thread = await db.messageThread.create({
    data: {
      projectId: project.id,
      subject,
      clientVisible: boolField(fd, "clientVisible"),
      lastMessageAt: now,
      messages: { create: { authorId: user.id, body, createdAt: now } },
    },
  });
  await logActivity({ projectId: project.id, userId: user.id, type: "message.thread_created", description: `Started conversation "${subject}"` });
  revalidate(project.id);
  redirect(`${messagesPath(project.id)}?thread=${thread.id}`);
}

export async function replyToThread(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const threadId = str(fd, "threadId");
  const body = str(fd, "body");
  const thread = await db.messageThread.findFirst({ where: { id: threadId, projectId: project.id } });
  if (!thread) throw new Error("Thread not found");
  if (!body) redirect(`${messagesPath(project.id)}?thread=${thread.id}`);
  const now = new Date();
  await db.message.create({ data: { threadId: thread.id, authorId: user.id, body, createdAt: now } });
  await db.messageThread.update({ where: { id: thread.id }, data: { lastMessageAt: now } });
  await logActivity({ projectId: project.id, userId: user.id, type: "message.sent", description: `Replied in "${thread.subject}"` });
  revalidate(project.id);
  redirect(`${messagesPath(project.id)}?thread=${thread.id}`);
}

export async function deleteThread(fd: FormData) {
  const user = await requireAdmin();
  const project = await getProject(str(fd, "projectId"));
  const threadId = str(fd, "id");
  const thread = await db.messageThread.findFirst({ where: { id: threadId, projectId: project.id } });
  if (!thread) throw new Error("Thread not found");
  await db.messageThread.delete({ where: { id: thread.id } });
  await logActivity({ projectId: project.id, userId: user.id, type: "message.thread_deleted", description: `Deleted conversation "${thread.subject}"` });
  revalidate(project.id);
  redirect(messagesPath(project.id));
}
