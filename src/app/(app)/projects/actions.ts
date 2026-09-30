"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { nextProjectNumber } from "@/lib/projects";
import { createProjectEstimate } from "@/lib/estimate-lines";
import { PROJECT_STATUSES, PROJECT_TYPES } from "@/lib/constants";
import { parseDateInput, str, strOrNull, titleCase } from "@/lib/utils";

function readProjectFields(fd: FormData) {
  const name = str(fd, "name");
  if (!name) throw new Error("Project name is required.");
  const type = str(fd, "type");
  const status = str(fd, "status");
  if (!(PROJECT_TYPES as readonly string[]).includes(type)) throw new Error("Invalid project type.");
  if (!(PROJECT_STATUSES as readonly string[]).includes(status)) throw new Error("Invalid project status.");
  // Square feet, target end date and contract amount are no longer entered here;
  // they are left untouched on save so existing values are kept.
  return {
    name,
    type,
    status,
    clientId: strOrNull(fd, "clientId"),
    managerId: strOrNull(fd, "managerId"),
    address: strOrNull(fd, "address"),
    city: strOrNull(fd, "city"),
    state: strOrNull(fd, "state"),
    zip: strOrNull(fd, "zip"),
    startDate: parseDateInput(fd.get("startDate")),
    description: strOrNull(fd, "description"),
  };
}

export async function createProject(formData: FormData) {
  const user = await requireStaff();
  const data = readProjectFields(formData);
  const number = await nextProjectNumber();
  const project = await db.project.create({ data: { ...data, number } });
  await logActivity({
    projectId: project.id,
    userId: user.id,
    type: "project.created",
    description: `Created project #${project.number} ${project.name}`,
  });
  // Optionally start the estimate from a template.
  const templateId = strOrNull(formData, "templateId");
  if (templateId) {
    const { estimate, template } = await createProjectEstimate(project.id, templateId);
    await logActivity({
      projectId: project.id,
      userId: user.id,
      type: "estimate.created",
      description: `Estimate v${estimate.version} created from template "${template?.name}"`,
    });
  }
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  redirect(templateId ? `/projects/${project.id}/estimate` : `/projects/${project.id}`);
}

export async function updateProject(formData: FormData) {
  const user = await requireStaff();
  const id = str(formData, "id");
  const existing = await db.project.findUnique({ where: { id } });
  if (!existing) throw new Error("Project not found.");
  const data = readProjectFields(formData);
  const actualEndDate = parseDateInput(formData.get("actualEndDate"));
  const project = await db.project.update({ where: { id }, data: { ...data, actualEndDate } });
  if (existing.status !== project.status) {
    await logActivity({
      projectId: project.id,
      userId: user.id,
      type: "project.status_changed",
      description: `Status changed from ${titleCase(existing.status)} to ${titleCase(project.status)}`,
    });
  } else {
    await logActivity({
      projectId: project.id,
      userId: user.id,
      type: "project.updated",
      description: `Updated project details`,
    });
  }
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  revalidatePath("/dashboard");
  redirect(`/projects/${id}`);
}

export async function deleteProject(formData: FormData) {
  const user = await requireStaff();
  const id = str(formData, "id");
  const existing = await db.project.findUnique({ where: { id } });
  if (!existing) throw new Error("Project not found.");
  await db.project.delete({ where: { id } });
  await logActivity({
    userId: user.id,
    type: "project.deleted",
    description: `Deleted project #${existing.number} ${existing.name}`,
  });
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  redirect("/projects");
}
