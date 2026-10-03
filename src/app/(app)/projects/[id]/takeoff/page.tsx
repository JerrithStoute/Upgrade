import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { syncAutoItems } from "@/lib/walls";

/**
 * The Takeoff tab opens the drawing screen: the sheet you were last on, else the
 * first plan set. With no plans yet, the Plans tab (to upload one).
 */
export default async function TakeoffPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const project = await getProject(id);
  const plans = await db.takeoffPlan.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "asc" }, select: { id: true, supersededAt: true } });
  if (!plans.length) redirect(`/projects/${project.id}/plans`);
  // Keep the job's takeoff lines in step with the Item List (new prices, cost codes).
  await syncAutoItems(project.id);
  // The sheet you were last on (the drawing screen remembers it per job).
  const [planId, page] = ((await cookies()).get(`takeoff-last-${project.id}`)?.value ?? "").split(":");
  const last = plans.find((p) => p.id === planId);
  const target = last ?? plans.find((p) => !p.supersededAt) ?? plans[0];
  redirect(`/projects/${project.id}/takeoff/${target.id}${last && Number(page) > 1 ? `?page=${Number(page)}` : ""}`);
}
