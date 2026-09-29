"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { str, intField } from "@/lib/utils";

function done() {
  revalidatePath("/settings/cost-codes");
  revalidatePath("/projects", "layout");
}

export async function createCostCode(formData: FormData) {
  const admin = await requireAdmin();
  const code = str(formData, "code");
  const name = str(formData, "name");
  const division = str(formData, "division") || "General";
  if (!code || !name) throw new Error("Code and name are required");
  const exists = await db.costCode.findUnique({ where: { code } });
  if (exists) throw new Error(`Cost code ${code} already exists`);

  await db.costCode.create({ data: { code, name, division, sortOrder: intField(formData, "sortOrder", 0), active: true } });
  await logActivity({ userId: admin.id, type: "cost_code.created", description: `Added cost code ${code} ${name}` });
  done();
  redirect("/settings/cost-codes");
}

export async function updateCostCode(formData: FormData) {
  const admin = await requireAdmin();
  const id = str(formData, "id");
  const code = str(formData, "code");
  const name = str(formData, "name");
  const division = str(formData, "division") || "General";
  if (!code || !name) throw new Error("Code and name are required");
  const current = await db.costCode.findUnique({ where: { id } });
  if (!current) throw new Error("Cost code not found");
  if (code !== current.code) {
    const clash = await db.costCode.findUnique({ where: { code } });
    if (clash) throw new Error(`Cost code ${code} already exists`);
  }

  await db.costCode.update({ where: { id }, data: { code, name, division, sortOrder: intField(formData, "sortOrder", current.sortOrder) } });
  await logActivity({ userId: admin.id, type: "cost_code.updated", description: `Updated cost code ${code} ${name}` });
  done();
  redirect("/settings/cost-codes");
}

export async function toggleCostCodeActive(formData: FormData) {
  await requireAdmin();
  const id = str(formData, "id");
  const current = await db.costCode.findUnique({ where: { id } });
  if (!current) throw new Error("Cost code not found");
  await db.costCode.update({ where: { id }, data: { active: !current.active } });
  done();
}

export async function deleteCostCode(formData: FormData) {
  const admin = await requireAdmin();
  const id = str(formData, "id");
  const current = await db.costCode.findUnique({
    where: { id },
    include: { _count: { select: { estimateItems: true, changeOrderItems: true, expenses: true, selections: true } } },
  });
  if (!current) throw new Error("Cost code not found");
  const refs = current._count.estimateItems + current._count.changeOrderItems + current._count.expenses + current._count.selections;

  if (refs > 0) {
    await db.costCode.update({ where: { id }, data: { active: false } });
    await logActivity({ userId: admin.id, type: "cost_code.deactivated", description: `Deactivated cost code ${current.code} (in use by ${refs} records)` });
  } else {
    await db.costCode.delete({ where: { id } });
    await logActivity({ userId: admin.id, type: "cost_code.deleted", description: `Deleted cost code ${current.code} ${current.name}` });
  }
  done();
  redirect("/settings/cost-codes");
}
