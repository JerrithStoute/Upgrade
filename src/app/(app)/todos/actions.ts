"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { parseDateInput, str, strOrNull } from "@/lib/utils";
import { TODO_PRIORITIES } from "@/lib/constants";

/** Where to go after the action: the `returnTo` hidden field (same page, minus `?edit=`), defaulting to /todos. */
function returnTo(fd: FormData) {
  const r = str(fd, "returnTo");
  return r.startsWith("/") ? r : "/todos";
}

function revalidate(projectId?: string | null) {
  revalidatePath("/todos");
  revalidatePath("/dashboard");
  if (projectId) {
    revalidatePath(`/projects/${projectId}/todos`);
    revalidatePath(`/projects/${projectId}`);
  }
}

async function readFields(fd: FormData) {
  const title = str(fd, "title");
  if (!title) throw new Error("Title is required");
  const priority = str(fd, "priority");
  let projectId = strOrNull(fd, "projectId");
  if (projectId) {
    const p = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!p) projectId = null;
  }
  return {
    title,
    description: strOrNull(fd, "description"),
    dueDate: parseDateInput(fd.get("dueDate")),
    priority: (TODO_PRIORITIES as readonly string[]).includes(priority) ? priority : "NORMAL",
    assigneeId: strOrNull(fd, "assigneeId"),
    projectId,
  };
}

export async function createTodo(fd: FormData) {
  const user = await requireStaff();
  const data = await readFields(fd);
  await db.todo.create({ data: { ...data, createdById: user.id } });
  await logActivity({ projectId: data.projectId, userId: user.id, type: "todo.created", description: `Added to-do "${data.title}"` });
  revalidate(data.projectId);
  redirect(returnTo(fd));
}

export async function updateTodo(fd: FormData) {
  await requireStaff();
  const id = str(fd, "id");
  const existing = await db.todo.findUnique({ where: { id } });
  if (!existing) throw new Error("To-do not found");
  const data = await readFields(fd);
  // The project tab never sends a project select; keep the existing project in that case.
  if (!fd.has("projectId")) data.projectId = existing.projectId;
  await db.todo.update({ where: { id }, data });
  if (existing.projectId !== data.projectId) revalidate(existing.projectId);
  revalidate(data.projectId);
  redirect(returnTo(fd));
}

export async function toggleTodo(fd: FormData) {
  const user = await requireStaff();
  const id = str(fd, "id");
  const existing = await db.todo.findUnique({ where: { id } });
  if (!existing) throw new Error("To-do not found");
  const done = existing.status !== "DONE";
  await db.todo.update({ where: { id }, data: { status: done ? "DONE" : "OPEN", completedAt: done ? new Date() : null } });
  if (done) await logActivity({ projectId: existing.projectId, userId: user.id, type: "todo.completed", description: `Completed to-do "${existing.title}"` });
  revalidate(existing.projectId);
  redirect(returnTo(fd));
}

export async function deleteTodo(fd: FormData) {
  await requireStaff();
  const id = str(fd, "id");
  const existing = await db.todo.findUnique({ where: { id } });
  if (!existing) throw new Error("To-do not found");
  await db.todo.delete({ where: { id } });
  revalidate(existing.projectId);
  redirect(returnTo(fd));
}
