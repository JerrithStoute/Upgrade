"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { str } from "@/lib/utils";

export async function completeTodo(formData: FormData) {
  const user = await requireStaff();
  const id = str(formData, "id");
  if (!id) return;
  const todo = await db.todo.findUnique({ where: { id } });
  if (!todo || todo.status === "DONE") return;
  await db.todo.update({ where: { id }, data: { status: "DONE", completedAt: new Date() } });
  await logActivity({
    projectId: todo.projectId,
    userId: user.id,
    type: "todo.completed",
    description: `Completed to-do "${todo.title}"`,
  });
  revalidatePath("/dashboard");
  revalidatePath("/todos");
  if (todo.projectId) revalidatePath(`/projects/${todo.projectId}`);
}
