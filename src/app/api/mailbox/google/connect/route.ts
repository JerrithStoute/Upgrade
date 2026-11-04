import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { requireStaff } from "@/lib/auth";
import { gmailAuthUrl, gmailConfigured } from "@/lib/mailbox";

/** Connect Gmail (Your account → My email): off to Google to sign in and allow sending (back at /api/mailbox/google/callback). */
export async function GET() {
  let me;
  try {
    me = await requireStaff();
  } catch {
    return back("not-allowed");
  }
  if (!gmailConfigured()) return back("not-set-up");
  // A one-time code that has to come back with the answer, so no one else's answer is taken.
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set("mailbox_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/mailbox", maxAge: 15 * 60 });
  return new Response(null, { status: 303, headers: { Location: gmailAuthUrl(state, /@gmail\.com$/i.test(me.email) ? me.email : undefined), "Cache-Control": "no-store" } });
}

const back = (why: string) => new Response(null, { status: 303, headers: { Location: `/account?mail=${why}#email` } });
