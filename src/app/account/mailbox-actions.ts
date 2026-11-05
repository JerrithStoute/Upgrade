"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { simpleEmail } from "@/lib/mail";
import { MailboxError, providerOf, revokeMailbox, sendViaMailbox } from "@/lib/mailbox";

/** Disconnect: emails go from the program again (and Google lets go of the permission too). */
export async function disconnectMailbox() {
  const me = await requireStaff();
  const box = await db.mailbox.findUnique({ where: { userId: me.id } });
  if (box) {
    await db.mailbox.delete({ where: { id: box.id } });
    await revokeMailbox(box);
    await logActivity({ userId: me.id, type: "mailbox.disconnected", description: `${me.name} disconnected ${providerOf(box.provider).label} (${box.email})` });
  }
  redirect("/account?mail=disconnected#email");
}

/** Send a test: one short email to themselves, through their mailbox — the real thing, on this PC too. */
export async function sendMailboxTest() {
  const me = await requireStaff();
  const box = await db.mailbox.findUnique({ where: { userId: me.id } });
  if (!box) redirect("/account#email");
  const company = await db.company.findFirst({ select: { name: true } });
  try {
    await sendViaMailbox(box, {
      ...simpleEmail({
        to: box.email,
        subject: "Test from The Builder Station",
        heading: "Your email is connected",
        lines: ["Emails you send from the program — bids, POs, emails to clients — now go from this address and show in your Sent folder."],
        brand: company?.name ?? undefined,
      }),
      fromName: company?.name ?? undefined,
    });
  } catch (e) {
    if (e instanceof MailboxError && e.broken) await db.mailbox.update({ where: { id: box.id }, data: { brokenAt: new Date(), problem: e.message.slice(0, 300) } });
    console.error("[mailbox] test failed:", e);
    redirect("/account?mail=test-failed#email");
  }
  await db.mailbox.update({ where: { id: box.id }, data: { lastSentAt: new Date(), brokenAt: null, problem: null } });
  redirect("/account?mail=tested#email");
}
