import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { createPlanFromFile } from "@/lib/takeoff-plans";

/**
 * Uploads one plan file for takeoff. The Takeoff page posts each dropped or
 * chosen file here separately so it can show progress per file.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!isStaff(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Only accept uploads from this site's own pages.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return NextResponse.json({ error: "Upload was interrupted or is too large" }, { status: 400 });
  }
  const projectId = fd.get("projectId");
  const file = fd.get("file");
  if (typeof projectId !== "string" || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  try {
    const revisionOf = fd.get("revisionOf");
    const plan = await createPlanFromFile({
      file,
      projectId,
      userId: user.id,
      clientVisible: fd.get("clientVisible") === "true",
      revisionOf: typeof revisionOf === "string" && revisionOf ? revisionOf : null,
    });
    revalidatePath(`/projects/${projectId}/plans`);
    revalidatePath(`/projects/${projectId}/takeoff`, "layout");
    revalidatePath(`/projects/${projectId}/files`);
    return NextResponse.json({ id: plan.id, name: plan.name });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 400 });
  }
}
