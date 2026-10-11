import { NextResponse } from "next/server";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { settled } from "@/lib/takeoff-background";

/**
 * The plan screen asks this after saving: it answers once the job's background follow-up
 * (lumber lines, joists sized again) is done, so the screen can refresh with the results.
 * A plain request, not a server action — those run one at a time and would hold up saves.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) return new NextResponse(null, { status: 403 });
  const projectId = new URL(req.url).searchParams.get("project") ?? "";
  // Through the company gatekeeper: only this company's jobs.
  if (!projectId || !(await db.project.findUnique({ where: { id: projectId }, select: { id: true } }))) return new NextResponse(null, { status: 404 });
  await Promise.race([settled(projectId), new Promise((r) => setTimeout(r, 120_000))]);
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
