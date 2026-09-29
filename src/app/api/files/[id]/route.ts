import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { uploadDir } from "@/lib/uploads";

/** Serves an uploaded file to authenticated users (clients only see their own project's files). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const file = await db.fileAsset.findUnique({ where: { id }, include: { project: { select: { clientId: true } } } });
  if (!file) return new NextResponse("Not found", { status: 404 });

  if (user.role === "CLIENT" && (file.project.clientId !== user.clientId || !file.clientVisible)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const data = await fs.readFile(path.join(uploadDir(), file.storagePath));
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(file.name)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("File missing on disk", { status: 404 });
  }
}
