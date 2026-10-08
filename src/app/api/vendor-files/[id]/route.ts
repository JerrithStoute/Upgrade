import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { readUpload } from "@/lib/uploads";

const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);

/** A sub's or vendor's insurance certificate: for your team, and for that vendor's own logins. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const cert = await db.vendorInsurance.findUnique({ where: { id } });
  if (!cert?.storagePath) return new NextResponse("Not found", { status: 404 });
  if (!isStaff(user) && !(user.role === "VENDOR" && user.vendorId === cert.vendorId)) return new NextResponse("Forbidden", { status: 403 });
  const mime = cert.mimeType ?? "application/octet-stream";
  const inline = INLINE_TYPES.has(mime) && new URL(req.url).searchParams.get("download") !== "1";
  const name = (cert.fileName ?? "certificate").replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  try {
    const data = await readUpload(cert.storagePath);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": inline ? mime : "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
        "X-Content-Type-Options": "nosniff",
        ...(mime === "application/pdf" && inline ? {} : { "Content-Security-Policy": "sandbox" }),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("File missing on disk", { status: 404 });
  }
}
