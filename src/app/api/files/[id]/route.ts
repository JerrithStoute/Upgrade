import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { db } from "@/lib/db";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { uploadDir } from "@/lib/uploads";
import { recordClientView } from "@/lib/file-views";

/**
 * Types that are safe to render in the browser. Anything else (HTML, SVG, XML,
 * JavaScript…) could run script on this origin, so it is always downloaded.
 */
const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "application/pdf"]);

function contentDisposition(kind: "inline" | "attachment", name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Serves an uploaded file to authenticated users (clients only see their own project's files). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const file = await db.fileAsset.findUnique({ where: { id }, include: { project: { select: { clientId: true } } } });
  if (!file) return new NextResponse("Not found", { status: 404 });

  if (user.role === "CLIENT") {
    if (file.project.clientId !== user.clientId || !file.clientVisible) return new NextResponse("Forbidden", { status: 403 });
  } else if (user.role === "VENDOR") {
    // A sub / vendor: only the bills they sent.
    const theirs = user.vendorId ? await db.vendorBill.findFirst({ where: { fileId: file.id, vendorId: user.vendorId }, select: { id: true } }) : null;
    if (!theirs) return new NextResponse("Forbidden", { status: 403 });
  } else if (!isStaff(user)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const search = new URL(req.url).searchParams;
  // ?open=1 is a client opening it from its link (not a thumbnail): remembered as seen.
  if (user.role === "CLIENT" && search.get("open") === "1") await recordClientView(file, { id: user.id, name: user.name });

  // ?download=1 saves the file instead of opening it.
  const inline = INLINE_TYPES.has(file.mimeType) && search.get("download") !== "1";

  try {
    const data = await fs.readFile(path.join(uploadDir(), file.storagePath));
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": inline ? file.mimeType : "application/octet-stream",
        "Content-Disposition": contentDisposition(inline ? "inline" : "attachment", file.name),
        "X-Content-Type-Options": "nosniff",
        // Belt and braces for anything that is rendered. Skipped for PDFs because
        // Chrome's built-in viewer refuses to open sandboxed documents.
        ...(file.mimeType === "application/pdf" && inline ? {} : { "Content-Security-Policy": "sandbox" }),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("File missing on disk", { status: 404 });
  }
}
