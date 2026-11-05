import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { requireStaff } from "@/lib/auth";
import { authUrl, providerByRoute, providerConfigured } from "@/lib/mailbox";

/**
 * Connect Gmail / Outlook (Your account → My email): off to Google (/api/mailbox/google/…) or Microsoft
 * (/api/mailbox/microsoft/…) to sign in and allow sending; they come back to …/callback.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const p = providerByRoute((await params).provider);
  let me;
  try {
    me = await requireStaff();
  } catch {
    return back("not-allowed");
  }
  if (!p) return back("failed");
  if (!providerConfigured(p)) return back(`not-set-up-${p.key}`);
  // A one-time code that has to come back with the answer, so no one else's answer is taken.
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set("mailbox_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/mailbox", maxAge: 15 * 60 });
  const hint = p.key === "gmail" ? (/@gmail\.com$/i.test(me.email) ? me.email : undefined) : undefined;
  return new Response(null, { status: 303, headers: { Location: authUrl(p, state, hint), "Cache-Control": "no-store" } });
}

const back = (why: string) => new Response(null, { status: 303, headers: { Location: `/account?mail=${why}#email` } });
