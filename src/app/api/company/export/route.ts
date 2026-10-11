import { Readable } from "stream";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { companyExport } from "@/lib/company-export";
import { logSecurity } from "@/lib/security-log";

/** Settings → "Download all our data": the whole company in one ZIP. Admins only. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (user.role !== "ADMIN") return new NextResponse("Only an admin can download all of the company's data", { status: 403 });
  const { zip, filename } = await companyExport(user.companyId);
  await logSecurity(user, "export", "downloaded all of the company's data");
  return new NextResponse(Readable.toWeb(zip) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
