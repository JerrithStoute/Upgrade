"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { costCodeLabel, str, strOrNull, intField } from "@/lib/utils";
import { parseCostCodeCsv, planCostCodeImport } from "@/lib/cost-code-csv";

function done() {
  revalidatePath("/settings/cost-codes");
  revalidatePath("/projects", "layout");
}

export async function createCostCode(formData: FormData) {
  const admin = await requireAdmin();
  const code = strOrNull(formData, "code");
  const name = str(formData, "name");
  const division = str(formData, "division") || "General";
  if (!name) throw new Error("Name is required");
  if (code && (await db.costCode.findUnique({ where: { code } }))) throw new Error(`Cost code ${code} already exists`);

  await db.costCode.create({ data: { code, name, division, sortOrder: intField(formData, "sortOrder", 0), active: true } });
  await logActivity({ userId: admin.id, type: "cost_code.created", description: `Added cost code ${costCodeLabel({ code, name }, " ")}` });
  done();
  redirect("/settings/cost-codes");
}

export async function updateCostCode(formData: FormData) {
  const admin = await requireAdmin();
  const id = str(formData, "id");
  const code = strOrNull(formData, "code");
  const name = str(formData, "name");
  const division = str(formData, "division") || "General";
  if (!name) throw new Error("Name is required");
  const current = await db.costCode.findUnique({ where: { id } });
  if (!current) throw new Error("Cost code not found");
  if (code && code !== current.code) {
    const clash = await db.costCode.findUnique({ where: { code } });
    if (clash) throw new Error(`Cost code ${code} already exists`);
  }

  await db.costCode.update({ where: { id }, data: { code, name, division, sortOrder: intField(formData, "sortOrder", current.sortOrder) } });
  await logActivity({ userId: admin.id, type: "cost_code.updated", description: `Updated cost code ${costCodeLabel({ code, name }, " ")}` });
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
    await logActivity({ userId: admin.id, type: "cost_code.deactivated", description: `Deactivated cost code ${costCodeLabel(current, " ")} (in use by ${refs} records)` });
  } else {
    await db.costCode.delete({ where: { id } });
    await logActivity({ userId: admin.id, type: "cost_code.deleted", description: `Deleted cost code ${costCodeLabel(current, " ")}` });
  }
  done();
  redirect("/settings/cost-codes");
}

/**
 * Replaces the whole cost code library with the uploaded CSV (column A = group,
 * column B = cost code, optionally starting with a number). Existing codes with the
 * same name are kept (so estimates, expenses, etc. stay linked) and updated to the
 * file's group, number and order; every other existing code is deleted and any
 * records using it lose their cost code. All-or-nothing.
 */
export async function replaceCostCodesFromCsv(formData: FormData) {
  const admin = await requireAdmin();
  const csv = String(formData.get("csv") ?? "");
  const parsed = parseCostCodeCsv(csv);
  if (parsed.errors.length) throw new Error(`The CSV has problems: ${parsed.errors.slice(0, 5).join(" ")}`);

  const existing = await db.costCode.findMany({
    include: { _count: { select: { estimateItems: true, templateItems: true, changeOrderItems: true, expenses: true, selections: true } } },
  });
  const plan = planCostCodeImport(
    parsed.codes,
    existing.map((e) => ({ id: e.id, code: e.code, name: e.name, division: e.division, refs: Object.values(e._count).reduce((a, b) => a + b, 0) })),
  );
  const matchedIds = plan.rows.flatMap((r) => (r.match ? [r.match.id] : []));

  await db.$transaction(
    async (tx) => {
      if (plan.removed.length) await tx.costCode.deleteMany({ where: { id: { in: plan.removed.map((r) => r.id) } } });
      // Clear kept codes' numbers first so numbers can move between codes without unique clashes.
      if (matchedIds.length) await tx.costCode.updateMany({ where: { id: { in: matchedIds } }, data: { code: null } });
      for (const [i, row] of plan.rows.entries()) {
        const data = { code: row.code, name: row.name, division: row.group, sortOrder: (i + 1) * 10, active: true };
        if (row.match) await tx.costCode.update({ where: { id: row.match.id }, data });
        else await tx.costCode.create({ data });
      }
    },
    { timeout: 60_000 },
  );

  const kept = matchedIds.length;
  await logActivity({
    userId: admin.id,
    type: "cost_code.imported",
    description: `Replaced cost codes from CSV: ${parsed.codes.length} codes in ${parsed.groups.length} groups (${kept} kept, ${parsed.codes.length - kept} new, ${plan.removed.length} deleted)`,
  });
  done();
  redirect("/settings/cost-codes?imported=1");
}
