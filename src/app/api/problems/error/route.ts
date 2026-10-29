import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";
import { clientIp } from "@/lib/security-log";
import { failures, recordFailure } from "@/lib/rate-limit";
import { recordError, whoFromToken } from "@/lib/problems";
import { clip, isBrowserNoise } from "@/lib/problem-rules";

/**
 * Something broke in someone's browser (<ErrorCatcher>, and the "Something went wrong" pages): kept on
 * the Station's Problems tab (src/lib/problems.ts). Open without a sign-in — a sign-in page can break
 * too — so it takes only a little text, and at most 30 a quarter-hour from one address.
 */
export async function POST(req: Request) {
  const ok = new NextResponse(null, { status: 204 });
  const key = `problems.browser:${await clientIp()}`;
  if ((await failures(key)) >= 30) return ok;
  await recordFailure(key, 15 * 60 * 1000);

  const raw = await req.text().catch(() => "");
  if (raw.length > 20_000) return ok;
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return ok;
  }
  const message = clip(body.message, 1000);
  const stack = clip(body.stack, 4000);
  if (isBrowserNoise(message, stack)) return ok;
  const who = await whoFromToken((await cookies()).get(SESSION_COOKIE)?.value).catch(() => null);
  await recordError({ side: "browser", message, stack, page: clip(body.page, 300) || "/", who });
  return ok;
}
