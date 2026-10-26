"use server";

import { friendly } from "@/lib/friendly-action";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireStaff, type SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getProject, nextProjectNumber } from "@/lib/projects";
import { refreshJobSite, siteAddressOf } from "@/lib/job-site";
import { runAsCompany } from "@/lib/tenant";
import { createProjectEstimate } from "@/lib/estimate-lines";
import { copyJob } from "@/lib/job-copy";
import { PROJECT_STATUSES, PROJECT_TYPES } from "@/lib/constants";
import { parseDateInput, str, strOrNull, titleCase } from "@/lib/utils";

function readProjectFields(fd: FormData) {
  const name = str(fd, "name");
  if (!name) throw new Error("Project name is required.");
  const type = str(fd, "type");
  const status = str(fd, "status");
  if (!type) throw new Error("Pick what kind of job it is — Spec home, Custom home or Remodel (at the top).");
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
    isSpec: fd.get("isSpec") === "on",
  };
}

/**
 * The job's team from the form (team members only). Someone who sees only their jobs is kept on
 * a job they make or change — it doesn't vanish from under them.
 */
async function readTeam(fd: FormData, user: SessionUser, managerId: string | null) {
  const picked = fd.getAll("teamIds").map(String);
  const staff = await db.user.findMany({ where: { id: { in: picked }, role: { in: ["ADMIN", "STAFF"] } }, select: { id: true } });
  const ids = new Set(staff.map((u) => u.id));
  if (user.access.jobs === "MINE" && managerId !== user.id) ids.add(user.id);
  if (managerId) ids.delete(managerId);
  return [...ids];
}

/** The job's spot on the map, from its address (time clock: on site or not) — looked up after the save, never holding it up. */
function findSiteLater(user: SessionUser, projectId: string) {
  void runAsCompany(user.companyId, () => refreshJobSite(projectId)).catch(() => {});
}

export const createProject = friendly(async function createProject(formData: FormData) {
  const user = await requireStaff();
  const data = readProjectFields(formData);
  const number = await nextProjectNumber();
  const team = await readTeam(formData, user, data.managerId);
  const project = await db.project.create({ data: { ...data, number, members: { create: team.map((userId) => ({ userId })) } } });
  findSiteLater(user, project.id);
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
});

export const updateProject = friendly(async function updateProject(formData: FormData) {
  const user = await requireStaff();
  const id = str(formData, "id");
  const existing = await db.project.findUnique({ where: { id } });
  if (!existing) throw new Error("Project not found.");
  const data = readProjectFields(formData);
  const actualEndDate = parseDateInput(formData.get("actualEndDate"));
  const team = await readTeam(formData, user, data.managerId);
  const project = await db.project.update({
    where: { id },
    data: { ...data, actualEndDate, members: { deleteMany: {}, create: team.map((userId) => ({ userId })) } },
  });
  findSiteLater(user, id);
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
});

export const deleteProject = friendly(async function deleteProject(formData: FormData) {
  const user = await requireAdmin(); // wipes a whole job — administrators only
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
});

/** The job's spot on the map: where the phone is now (standing at the site), or its address looked up again. */
export async function setJobSite(projectId: string, spot: { lat: number; lng: number } | "address"): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireStaff();
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } });
  if (!project) return { ok: false, error: "Project not found." };
  if (spot === "address") {
    await refreshJobSite(projectId, true);
    const p = await db.project.findUnique({ where: { id: projectId }, select: { siteLat: true } });
    if (p?.siteLat == null) return { ok: false, error: "The address wasn't found on the map — stand at the site and use where you are instead." };
  } else {
    if (!Number.isFinite(spot.lat) || !Number.isFinite(spot.lng) || Math.abs(spot.lat) > 90 || Math.abs(spot.lng) > 180) return { ok: false, error: "That spot didn't come through." };
    // Kept until the address changes: the address it was set against is noted with it.
    const p = await db.project.findUnique({ where: { id: projectId }, select: { address: true, city: true, state: true, zip: true } });
    await db.project.update({ where: { id: projectId }, data: { siteLat: spot.lat, siteLng: spot.lng, siteFrom: "PHONE", siteAddress: p ? siteAddressOf(p) : null } });
  }
  await logActivity({ projectId, userId: user.id, type: "project.updated", description: spot === "address" ? "Job site found from the address" : "Job site set from a phone at the site" });
  revalidatePath(`/projects/${projectId}/edit`);
  return { ok: true };
}

/** The subs and vendors who see this job's location in their portal (picked on the job's Edit page). */
export const saveJobVendors = friendly(async function saveJobVendors(projectId: string, fd: FormData) {
  const user = await requireStaff();
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new Error("Project not found.");
  const picked = fd.getAll("vendorIds").map(String);
  const vendors = await db.vendor.findMany({ where: { id: { in: picked } }, select: { id: true, name: true } });
  await db.project.update({ where: { id: projectId }, data: { siteVendors: { deleteMany: {}, create: vendors.map((v) => ({ vendorId: v.id })) } } });
  await logActivity({
    projectId,
    userId: user.id,
    type: "project.updated",
    description: vendors.length ? `Job location shared with ${vendors.map((v) => v.name).join(", ")}` : "Job location shared with no subs or vendors",
  });
  revalidatePath(`/projects/${projectId}/edit`);
  redirect(`/projects/${projectId}`);
});

/**
 * ⋯ Copy this job: a new job from this one — its plans and takeoff, its estimate and its schedule, as
 * picked (job-copy.ts) — for the new lot, client and address. Or kept as a plan template.
 */
export const copyThisJob = friendly(async function copyThisJob(fd: FormData) {
  const user = await requireStaff();
  const from = await getProject(str(fd, "fromId"));
  const isTemplate = fd.get("isTemplate") === "on";
  const name = str(fd, "name").slice(0, 200);
  if (!name) throw new Error("Name the new job.");
  const clientId = isTemplate ? null : strOrNull(fd, "clientId");
  if (clientId && !(await db.client.findUnique({ where: { id: clientId }, select: { id: true } }))) throw new Error("That client isn't on your list any more.");
  const what = {
    takeoff: fd.get("takeoff") === "on",
    estimate: fd.get("estimate") === "on",
    schedule: fd.get("schedule") === "on",
    start: parseDateInput(fd.get("start")),
  };
  if (what.schedule && !what.start) throw new Error("Pick the date the schedule starts — or leave the schedule off.");
  const project = await copyJob(
    from.id,
    {
      name,
      clientId,
      address: isTemplate ? null : strOrNull(fd, "address"),
      city: isTemplate ? null : strOrNull(fd, "city"),
      state: isTemplate ? null : strOrNull(fd, "state"),
      zip: isTemplate ? null : strOrNull(fd, "zip"),
      isTemplate,
    },
    what,
    user.id,
  );
  if (!isTemplate) findSiteLater(user, project.id);
  const parts = [what.takeoff && "plans & takeoff", what.estimate && "estimate", what.schedule && "schedule"].filter(Boolean).join(", ");
  await logActivity({
    projectId: project.id,
    userId: user.id,
    type: "project.created",
    description: `${isTemplate ? "Plan template" : "Job"} #${project.number} ${project.name} copied from #${from.number} ${from.name}${parts ? ` (${parts})` : ""}`,
  });
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  redirect(`/projects/${project.id}`);
});

/** A job kept as a plan template (off the job lists, to copy new jobs from) — or back to a regular job. */
export const setPlanTemplate = friendly(async function setPlanTemplate(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "id"));
  const on = fd.get("on") === "1";
  await db.project.update({ where: { id: project.id }, data: { isTemplate: on } });
  await logActivity({
    projectId: project.id,
    userId: user.id,
    type: "project.updated",
    description: on ? "Kept as a plan template (off the job lists)" : "Back to a regular job (no longer a plan template)",
  });
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  redirect(`/projects/${project.id}/copy`);
});
