"use server";

import { friendly } from "@/lib/friendly-action";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { str } from "@/lib/utils";
import { dashboardLayout, withCards, type Layout } from "@/lib/dashboard-cards";
import { canSeeReports } from "@/lib/reports";
import { cookies } from "next/headers";

export const completeTodo = friendly(async function completeTodo(formData: FormData) {
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
});

/** Turns cards on and off (Customize): the others stay put, new ones go to the shortest column. null = back to the default. */
/** Getting started: hidden on this browser. */
export async function hideGettingStarted() {
  await requireStaff();
  (await cookies()).set("bs_hide_getting_started", "1", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  revalidatePath("/dashboard");
}

export async function saveDashboardCards(keys: string[] | null) {
  const user = await requireStaff();
  const me = await db.user.findUnique({ where: { id: user.id }, select: { dashboardCards: true } });
  const layout = keys ? withCards(dashboardLayout(me?.dashboardCards, canSeeReports(user)), keys, canSeeReports(user)) : null;
  await db.user.update({ where: { id: user.id }, data: { dashboardCards: layout ? JSON.stringify(layout) : null } });
  revalidatePath("/dashboard");
}

/** Saves where your cards are, after a drag. */
export async function saveDashboardLayout(layout: Layout) {
  const user = await requireStaff();
  // Cleaned the same way it's read: only cards you may see, each once.
  const clean = dashboardLayout(JSON.stringify(layout), canSeeReports(user));
  await db.user.update({ where: { id: user.id }, data: { dashboardCards: JSON.stringify(clean) } });
}
