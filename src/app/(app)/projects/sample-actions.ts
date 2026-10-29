"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { friendly } from "@/lib/friendly-action";
import { logActivity } from "@/lib/activity";
import { addSampleJob, removeSampleJob } from "@/lib/sample-job";

/** "Add a sample job" (Getting started): a made-up house to explore (sample-job.ts). Admins — it's company-wide. */
export const addSample = friendly(async function addSample() {
  const user = await requireAdmin();
  const id = await addSampleJob(user.id);
  await logActivity({ projectId: id, userId: user.id, type: "sample.added", description: "Added the sample job" });
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  redirect(`/projects/${id}`);
});

/** "Remove sample job": the job, everything in it, its client, and cost codes it added that nothing else uses. */
export const removeSample = friendly(async function removeSample() {
  const user = await requireAdmin();
  if (await removeSampleJob()) await logActivity({ userId: user.id, type: "sample.removed", description: "Removed the sample job" });
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  revalidatePath("/clients");
  revalidatePath("/settings/cost-codes");
  redirect("/dashboard");
});
