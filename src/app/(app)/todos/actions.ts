"use server";

import { friendly } from "@/lib/friendly-action";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff, type SessionUser } from "@/lib/auth";
import { allows } from "@/lib/access";
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

/**
 * Everyone keeps their own to-dos (assigned to them or added by them). Other people's take a
 * position that may edit "Schedule, daily logs & to-dos".
 */
function checkTodo(user: SessionUser, todo: { assigneeId: string | null; createdById?: string | null }) {
  if (allows(user.access, "field", 2) || todo.assigneeId === user.id || todo.createdById === user.id) return;
  throw new Error("Your position can't change other people's to-dos — an admin can allow it in Settings → Team");
}

export const createTodo = friendly(async function createTodo(fd: FormData) {
  const user = await requireStaff();
  const data = await readFields(fd);
  checkTodo(user, { assigneeId: data.assigneeId ?? user.id, createdById: user.id });
  await db.todo.create({ data: { ...data, createdById: user.id } });
  await logActivity({ projectId: data.projectId, userId: user.id, type: "todo.created", description: `Added to-do "${data.title}"` });
  revalidate(data.projectId);
  redirect(returnTo(fd));
});

export const updateTodo = friendly(async function updateTodo(fd: FormData) {
  const user = await requireStaff();
  const id = str(fd, "id");
  const existing = await db.todo.findUnique({ where: { id } });
  if (!existing) throw new Error("To-do not found");
  checkTodo(user, existing);
  const data = await readFields(fd);
  // The project tab never sends a project select; keep the existing project in that case.
  if (!fd.has("projectId")) data.projectId = existing.projectId;
  await db.todo.update({ where: { id }, data });
  if (existing.projectId !== data.projectId) revalidate(existing.projectId);
  revalidate(data.projectId);
  redirect(returnTo(fd));
});

export const toggleTodo = friendly(async function toggleTodo(fd: FormData) {
  const user = await requireStaff();
  const id = str(fd, "id");
  const existing = await db.todo.findUnique({ where: { id } });
  if (!existing) throw new Error("To-do not found");
  checkTodo(user, existing);
  const done = existing.status !== "DONE";
  await db.todo.update({ where: { id }, data: { status: done ? "DONE" : "OPEN", completedAt: done ? new Date() : null } });
  if (done) await logActivity({ projectId: existing.projectId, userId: user.id, type: "todo.completed", description: `Completed to-do "${existing.title}"` });
  revalidate(existing.projectId);
  redirect(returnTo(fd));
});

export const deleteTodo = friendly(async function deleteTodo(fd: FormData) {
  const user = await requireStaff();
  const id = str(fd, "id");
  const existing = await db.todo.findUnique({ where: { id } });
  if (!existing) throw new Error("To-do not found");
  checkTodo(user, existing);
  await db.todo.delete({ where: { id } });
  revalidate(existing.projectId);
  redirect(returnTo(fd));
});
