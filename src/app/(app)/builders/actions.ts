"use server";

import { requireUser } from "@/lib/auth";
import { systemDb } from "@/lib/db";
import { isPlatformAdmin, makeBuilderInvite, INVITE_DAYS } from "@/lib/builder-invites";
import { appUrl, sendMail, simpleEmail } from "@/lib/mail";
import { logActivity } from "@/lib/activity";

export type InviteState = { error?: string; link?: string; email?: string; sent?: boolean } | undefined;

/** The platform owner invites a builder: a sign-up link for their email, by email (and to copy). */
export async function inviteBuilder(_prev: InviteState, fd: FormData): Promise<InviteState> {
  const me = await requireUser();
  if (!isPlatformAdmin(me.email)) return { error: "Only The Builder Station's owner can invite builders" };
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const name = String(fd.get("name") ?? "").trim().slice(0, 120) || null;
  const companyName = String(fd.get("companyName") ?? "").trim().slice(0, 120) || null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Put in the builder's email" };
  if (await systemDb.user.findUnique({ where: { email }, select: { id: true } })) return { error: `${email} already has an account` };

  const link = appUrl(`/signup?invite=${await makeBuilderInvite({ email, name, companyName })}`);
  let sent = true;
  try {
    await sendMail(
      simpleEmail({
        to: email,
        subject: `${me.name} invited you to The Builder Station`,
        heading: name ? `Hi ${name.split(" ")[0]},` : "You're invited",
        lines: [
          `${me.name} invited you to set up ${companyName ?? "your company"} on The Builder Station — estimates, takeoffs, schedules, budgets and your clients in one place.`,
          "The link is just for you. It takes a minute to start.",
        ],
        button: { label: "Start my company", url: link },
        after: [`The link works for ${INVITE_DAYS} days.`],
      }),
    );
  } catch (err) {
    console.error("Builder invitation email not sent:", err);
    sent = false;
  }
  await logActivity({ userId: me.id, type: "platform.builder-invited", description: `Invited ${email}${companyName ? ` (${companyName})` : ""} to The Builder Station` });
  return { link, email, sent };
}
