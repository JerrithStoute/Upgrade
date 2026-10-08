"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { money, numField, parseDateInput, str, strOrNull } from "@/lib/utils";

function budgetPath(projectId: string) {
  return `/projects/${projectId}/budget`;
}

function revalidate(projectId: string) {
  revalidatePath(budgetPath(projectId));
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
}

async function loadExpense(projectId: string, id: string) {
  const expense = await db.expense.findFirst({ where: { id, projectId } });
  if (!expense) throw new Error("Expense not found");
  if (expense.billId) throw new Error("This cost is from a vendor bill — change it on the bill (Purchasing)");
  return expense;
}

function expenseData(fd: FormData) {
  const vendor = str(fd, "vendor");
  if (!vendor) throw new Error("Vendor is required");
  const category = str(fd, "category");
  const status = str(fd, "status") === "PAID" ? "PAID" : "UNPAID";
  return {
    vendor,
    date: parseDateInput(fd.get("date")) ?? new Date(),
    costCodeId: strOrNull(fd, "costCodeId"),
    category: (EXPENSE_CATEGORIES as readonly string[]).includes(category) ? category : "OTHER",
    amount: numField(fd, "amount", 0),
    description: strOrNull(fd, "description"),
    reference: strOrNull(fd, "reference"),
    status,
  };
}

export async function createExpense(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Project not found");
  const data = expenseData(formData);
  await db.expense.create({ data: { projectId, enteredById: user.id, ...data } });
  await logActivity({
    projectId,
    userId: user.id,
    type: "expense.created",
    description: `Expense ${money(data.amount)} from ${data.vendor} recorded`,
  });
  revalidate(projectId);
  redirect(budgetPath(projectId));
}

export async function updateExpense(formData: FormData) {
  await requireStaff();
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  await loadExpense(projectId, id);
  await db.expense.update({ where: { id }, data: expenseData(formData) });
  revalidate(projectId);
  redirect(budgetPath(projectId));
}

export async function toggleExpensePaid(formData: FormData) {
  await requireStaff();
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const expense = await loadExpense(projectId, id);
  await db.expense.update({ where: { id }, data: { status: expense.status === "PAID" ? "UNPAID" : "PAID" } });
  revalidate(projectId);
  redirect(budgetPath(projectId));
}

export async function deleteExpense(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const expense = await loadExpense(projectId, id);
  await db.expense.delete({ where: { id } });
  await logActivity({ projectId, userId: user.id, type: "expense.deleted", description: `Expense ${money(expense.amount)} from ${expense.vendor} deleted` });
  revalidate(projectId);
  redirect(budgetPath(projectId));
}
