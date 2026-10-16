import { NextResponse } from "next/server";
import { db, systemDb } from "@/lib/db";
import { tryCompanyId } from "@/lib/tenant";
import { readUpload } from "@/lib/uploads";

/**
 * A company's logo: the signed-in person's company, or (no sign-in — the browser fetching the tab
 * icon on its own) the company named in the address (?c=). A logo isn't private. Only PNG, JPG and
 * WebP are ever stored.
 */
export async function GET(req: Request) {
  try {
    const named = new URL(req.url).searchParams.get("c");
    const c = (await tryCompanyId())
      ? await db.company.findFirst({ select: { logoPath: true, logoType: true } })
      : named && /^[a-z0-9]{10,40}$/.test(named)
        ? await systemDb.company.findUnique({ where: { id: named }, select: { logoPath: true, logoType: true } })
        : null;
    if (!c?.logoPath || !c.logoType) return new NextResponse("No logo", { status: 404 });
    const data = await readUpload(c.logoPath);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": c.logoType,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
        // The address changes with each new logo, so it can be cached for a long time.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Logo missing", { status: 404 });
  }
}
