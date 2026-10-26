import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isStaff, requireEdit } from "@/lib/auth";
import { getProject } from "@/lib/projects";
import { MAX_BYTES, PLAN_MAX_BYTES } from "@/lib/uploads";
import { startUpload } from "@/lib/direct-upload";

/**
 * Step 1 of an upload straight to cloud storage (direct-upload.ts): after checking who may upload there,
 * a one-time link for the browser to send the file to — or { direct: false }, to send it the old way.
 *   purpose "plan": a plan set for takeoff (staff; up to 100 MB)
 *   purpose "file": a file for the job's Files (who may edit Files; up to 25 MB)
 */
export async function POST(req: Request) {
  // Only from this site's own pages.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: { projectId?: unknown; purpose?: unknown; name?: unknown; size?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const projectId = String(body.projectId ?? "");
  const name = String(body.name ?? "");
  const size = Number(body.size);

  if (body.purpose === "plan") {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    if (!isStaff(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json(await startUpload({ folder: project.id, name, size, maxBytes: PLAN_MAX_BYTES, kind: "plan" }));
  }
  if (body.purpose === "file") {
    await requireEdit("files");
    const project = await getProject(projectId);
    return NextResponse.json(await startUpload({ folder: project.id, name, size, maxBytes: MAX_BYTES, kind: "document" }));
  }
  return NextResponse.json({ error: "Bad request" }, { status: 400 });
}
