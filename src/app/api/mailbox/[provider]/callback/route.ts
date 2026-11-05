import { cookies } from "next/headers";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { MailboxError, exchangeCode, providerByRoute, revokeMailbox } from "@/lib/mailbox";

/** Back from Google or Microsoft: allowed (a code) or not. One mailbox per person — connecting again replaces it. */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const p = providerByRoute((await params).provider);
  let me;
  try {
    me = await requireStaff();
  } catch {
    return back("not-allowed");
  }
  if (!p) return back("failed");
  const q = new URL(req.url).searchParams;
  const store = await cookies();
  const expected = store.get("mailbox_state")?.value;
  store.set("mailbox_state", "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/mailbox", maxAge: 0 });
  if (q.get("error")) {
    // A work account whose company only lets its IT person allow apps (Microsoft 365).
    if (/admin|AADSTS65001|AADSTS90094/i.test(`${q.get("error")} ${q.get("error_description") ?? ""}`)) return back("needs-admin");
    if (q.get("error") !== "access_denied") console.error(`[mailbox] ${p.label} said:`, q.get("error"), q.get("error_description"));
    return back("denied");
  }
  const code = q.get("code");
  if (!expected || q.get("state") !== expected || !code) return back("expired");

  let got;
  try {
    got = await exchangeCode(p, code);
  } catch (e) {
    if (e instanceof MailboxError && e.message === "no-send") return back(`no-send-${p.key}`);
    console.error("[mailbox] connect failed:", e);
    return back("failed");
  }
  const before = await db.mailbox.findUnique({ where: { userId: me.id } });
  const data = { ...got, brokenAt: null, problem: null };
  await db.mailbox.upsert({ where: { userId: me.id }, create: { userId: me.id, ...data }, update: data });
  // A different mailbox than before: let go of the old one. (The same one: no — that would take back the new key too.)
  if (before && (before.email !== got.email || before.provider !== got.provider)) await revokeMailbox(before);
  await logActivity({ userId: me.id, type: "mailbox.connected", description: `${me.name} connected ${p.label} (${got.email}) to send from` });
  return back("connected");
}

const back = (why: string) => new Response(null, { status: 303, headers: { Location: `/account?mail=${why}#email` } });
