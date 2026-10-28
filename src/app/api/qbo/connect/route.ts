import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { requireEdit } from "@/lib/auth";
import { db } from "@/lib/db";
import { authorizeUrl, qboConfigured } from "@/lib/qbo/client";

/** Connect QuickBooks Online: off to Intuit to sign in and allow it (it comes back to /api/qbo/callback). */
export async function GET() {
  try {
    await requireEdit("quickbooks");
  } catch {
    return back("not-allowed");
  }
  if (!qboConfigured()) return back("not-set-up");
  if (await db.qbConnection.findFirst({ select: { id: true } })) return back("desktop");
  // A one-time code that has to come back with the answer, so no one else's answer is taken.
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set("qbo_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/qbo", maxAge: 15 * 60 });
  return new Response(null, { status: 303, headers: { Location: authorizeUrl(state), "Cache-Control": "no-store" } });
}

// (A path, not a full address: online, this server's own address isn't the one people use.)
const back = (why: string) => new Response(null, { status: 303, headers: { Location: `/settings/quickbooks?qbo=${why}` } });
