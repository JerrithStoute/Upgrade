import { cookies } from "next/headers";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { MailboxError, exchangeGmailCode, revokeGmail } from "@/lib/mailbox";

/** Back from Google: allowed (a code) or not. One mailbox per person — connecting again replaces it. */
export async function GET(req: Request) {
  let me;
  try {
    me = await requireStaff();
  } catch {
    return back("not-allowed");
  }
  const q = new URL(req.url).searchParams;
  const store = await cookies();
  const expected = store.get("mailbox_state")?.value;
  store.set("mailbox_state", "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/mailbox", maxAge: 0 });
  if (q.get("error")) return back("denied");
  const code = q.get("code");
  if (!expected || q.get("state") !== expected || !code) return back("expired");

  let got;
  try {
    got = await exchangeGmailCode(code);
  } catch (e) {
    if (e instanceof MailboxError && e.message === "no-send") return back("no-send");
    console.error("[mailbox] connect failed:", e);
    return back("failed");
  }
  const before = await db.mailbox.findUnique({ where: { userId: me.id } });
  const data = { provider: "gmail", ...got, brokenAt: null, problem: null };
  await db.mailbox.upsert({ where: { userId: me.id }, create: { userId: me.id, ...data }, update: data });
  // A different Gmail than before: let go of the old one at Google. (The same one: no — that would take back the new key too.)
  if (before && before.email !== got.email) await revokeGmail(before.refreshToken);
  await logActivity({ userId: me.id, type: "mailbox.connected", description: `${me.name} connected Gmail (${got.email}) to send from` });
  return back("connected");
}

const back = (why: string) => new Response(null, { status: 303, headers: { Location: `/account?mail=${why}#email` } });
