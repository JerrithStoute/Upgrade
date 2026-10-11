import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readUpload } from "@/lib/uploads";

/** The signed-in company's logo. Only PNG, JPG and WebP are ever stored. */
export async function GET() {
  try {
    // Only after signing in: the logo belongs to the signed-in person's company.
    const c = await db.company.findFirst({ select: { logoPath: true, logoType: true } });
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
