import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { db } from "@/lib/db";
import { uploadDir } from "@/lib/uploads";

/** The company logo — public, so the sign-in page can show it. Only PNG, JPG and WebP are ever stored. */
export async function GET() {
  const c = await db.company.findFirst({ select: { logoPath: true, logoType: true } });
  if (!c?.logoPath || !c.logoType) return new NextResponse("No logo", { status: 404 });
  try {
    const data = await fs.readFile(path.join(uploadDir(), c.logoPath));
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
