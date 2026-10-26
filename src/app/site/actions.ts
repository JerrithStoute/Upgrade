"use server";

import { headers } from "next/headers";
import { systemDb } from "@/lib/db";
import { stationLog } from "@/lib/station-auth";
import { appUrl, sendMail, simpleEmail } from "@/lib/mail";
import { inviteRequestText, type InviteRequest } from "@/lib/builder-invites";
import { recordFailure, retryAfter } from "@/lib/rate-limit";
import { passedRobotCheck, ROBOT_CHECK_FAILED } from "@/lib/turnstile";
import { HOMES_PER_YEAR } from "@/lib/site";

export type RequestState = { error?: string; ok?: boolean } | undefined;

const field = (fd: FormData, k: string, max = 120) => String(fd.get(k) ?? "").trim().slice(0, max);

/**
 * "Request an invite" on the website: the request lands on the Station's Invites page (its log), and
 * the Station's owners get an email about it.
 */
export async function requestInvite(_prev: RequestState, fd: FormData): Promise<RequestState> {
  if (!(await passedRobotCheck(fd))) return { error: ROBOT_CHECK_FAILED };
  const r: InviteRequest = {
    name: field(fd, "name"),
    company: field(fd, "company"),
    email: field(fd, "email", 200).toLowerCase(),
    phone: field(fd, "phone", 40),
    where: field(fd, "where"),
    homes: (HOMES_PER_YEAR as readonly string[]).includes(field(fd, "homes")) ? field(fd, "homes") : "",
    notes: field(fd, "notes", 1000),
  };
  if (!r.name || !r.company) return { error: "Fill in your name and your company" };
  if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(r.email)) return { error: "That email doesn't look right" };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  if (await retryAfter(`invite-request:${ip}`, 5) > 0) return { error: "We've had a few requests from here already — try again later, or email us." };
  await recordFailure(`invite-request:${ip}`, 60 * 60 * 1000);

  const text = inviteRequestText(r);
  await stationLog(null, "invite.requested", text);
  // The Station's owners (before any is set up: the first of PLATFORM_ADMIN_EMAILS).
  const owners = (await systemDb.stationUser.findMany({ where: { role: "OWNER", active: true }, select: { email: true } })).map((o) => o.email);
  const to = owners.length ? owners : [(process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",")[0]?.trim().toLowerCase()].filter(Boolean);
  const invite = new URLSearchParams({ email: r.email, name: r.name, company: r.company });
  for (const email of to)
    try {
      await sendMail(
        simpleEmail({
          to: email,
          subject: `Invite request: ${r.company}`,
          heading: "Someone asked for an invitation",
          lines: [text],
          button: { label: "Invite them", url: appUrl(`/station/invites?${invite}`) },
        }),
      );
    } catch (err) {
      console.error("Invite request email not sent:", err);
    }
  return { ok: true };
}
