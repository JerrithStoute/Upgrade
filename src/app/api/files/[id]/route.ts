import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { fileResponse } from "@/lib/uploads";
import { recordClientView } from "@/lib/file-views";

/**
 * Serves an uploaded file to authenticated users (clients only see their own project's files). Who may
 * see it is checked here; the file itself comes straight from cloud storage when files go direct, else
 * streamed — never whole in the server's memory (uploads.ts fileResponse). Only safe types ever open in
 * the browser; anything else (HTML, SVG, XML, JavaScript…) is always saved instead.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const file = await db.fileAsset.findUnique({ where: { id }, include: { project: { select: { clientId: true } } } });
  if (!file) return new NextResponse("Not found", { status: 404 });

  if (user.role === "CLIENT") {
    if (file.project.clientId !== user.clientId || !file.clientVisible) return new NextResponse("Forbidden", { status: 403 });
  } else if (user.role === "VENDOR") {
    // A sub / vendor: only the bills they sent, and the photos on warranty work they're sent to.
    const theirs = !user.vendorId
      ? null
      : file.warrantyRequestId
        ? await db.warrantyRequest.findFirst({ where: { id: file.warrantyRequestId, vendorId: user.vendorId }, select: { id: true } })
        : await db.vendorBill.findFirst({ where: { fileId: file.id, vendorId: user.vendorId }, select: { id: true } });
    if (!theirs) return new NextResponse("Forbidden", { status: 403 });
  } else if (!isStaff(user)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const search = new URL(req.url).searchParams;
  // ?open=1 is a client opening it from its link (not a thumbnail): remembered as seen.
  if (user.role === "CLIENT" && search.get("open") === "1") await recordClientView(file, { id: user.id, name: user.name });

  try {
    // ?download=1 saves the file instead of opening it.
    return await fileResponse(file.storagePath, { name: file.name, mimeType: file.mimeType, inline: search.get("download") !== "1" });
  } catch {
    return new NextResponse("File missing on disk", { status: 404 });
  }
}
