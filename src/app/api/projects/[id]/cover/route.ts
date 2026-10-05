import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { db } from "@/lib/db";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { uploadDir } from "@/lib/uploads";

/** A job's proposal cover picture: staff, and the job's own client. Only PNG, JPG and WebP are ever stored. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const project = await db.project.findUnique({ where: { id }, select: { clientId: true, coverPath: true, coverType: true } });
  if (!project?.coverPath || !project.coverType) return new NextResponse("No picture", { status: 404 });
  if (user.role === "CLIENT" ? project.clientId !== user.clientId : !isStaff(user)) return new NextResponse("Forbidden", { status: 403 });
  try {
    const data = await fs.readFile(path.join(uploadDir(), project.coverPath));
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": project.coverType,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
        // The address changes with each new picture.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Picture missing", { status: 404 });
  }
}
