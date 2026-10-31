import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { fileResponse } from "@/lib/uploads";

/**
 * A sub's or vendor's paperwork file (their W-9, an insurance certificate…): for your team, and for that vendor's
 * own logins. Straight from cloud storage when files go direct, else streamed (uploads.ts fileResponse).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const doc = await db.vendorDoc.findUnique({ where: { id } });
  if (!doc?.storagePath) return new NextResponse("Not found", { status: 404 });
  if (!isStaff(user) && !(user.role === "VENDOR" && user.vendorId === doc.vendorId)) return new NextResponse("Forbidden", { status: 403 });
  try {
    return await fileResponse(doc.storagePath, {
      name: doc.fileName ?? "paperwork",
      mimeType: doc.mimeType ?? "application/octet-stream",
      inline: new URL(req.url).searchParams.get("download") !== "1",
    });
  } catch {
    return new NextResponse("File missing on disk", { status: 404 });
  }
}
