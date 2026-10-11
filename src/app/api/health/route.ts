import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { systemDb } from "@/lib/db";

const ms = (t: number) => Math.round((performance.now() - t) * 10) / 10;

/**
 * For the host: is the program up and can it reach its database? Says nothing else.
 * `?timing=1` also times a few test queries (no company data — just "SELECT 1"), to see how
 * long the trip to the database takes from the server.
 */
export async function GET(req: Request) {
  try {
    await systemDb.$queryRaw`SELECT 1`;
    if (new URL(req.url).searchParams.get("timing") !== "1") return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });

    const one: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t = performance.now();
      await systemDb.$queryRaw`SELECT 1`;
      one.push(ms(t));
    }
    // The same shape every company query has: a small transaction that names the company first.
    const wrapped: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t = performance.now();
      await systemDb.$transaction([systemDb.$executeRaw(Prisma.sql`SELECT set_config('app.health', 'x', true)`), systemDb.$queryRaw`SELECT 1`]);
      wrapped.push(ms(t));
    }
    // Twelve at once, like a page that loads many things together.
    let t = performance.now();
    await Promise.all(Array.from({ length: 12 }, () => systemDb.$transaction([systemDb.$executeRaw(Prisma.sql`SELECT set_config('app.health', 'x', true)`), systemDb.$queryRaw`SELECT 1`])));
    const twelveAtOnce = ms(t);
    t = performance.now();
    await Promise.all(Array.from({ length: 12 }, () => systemDb.$queryRaw`SELECT 1`));
    const twelvePlainAtOnce = ms(t);
    return NextResponse.json({ ok: true, plainMs: one, wrappedMs: wrapped, twelveWrappedAtOnceMs: twelveAtOnce, twelvePlainAtOnceMs: twelvePlainAtOnce }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
