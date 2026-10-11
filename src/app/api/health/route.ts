import { NextResponse } from "next/server";
import { systemDb } from "@/lib/db";

/** For the host: is the program up and can it reach its database? Says nothing else. */
export async function GET() {
  try {
    await systemDb.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
