"use server";

import { revalidatePath } from "next/cache";
import { systemDb } from "@/lib/db";
import { appUrl, sendMail, simpleEmail } from "@/lib/mail";
import { getStationUser, makeSetupLink, SETUP_DAYS, stationLog } from "@/lib/station-auth";

export type TeamState = { error?: string; link?: string; email?: string; sent?: boolean } | undefined;

/** Only the Station's owners change who's on its team. */
async function stationOwner() {
  const me = await getStationUser();
  return me?.role === "OWNER" ? me : null;
}

/** Sends (and hands back, to copy) a setup link: a password, then the phone code. */
async function sendSetup(by: { name: string }, user: { id: string; email: string; name: string; sessionVersion: number }, fresh: boolean): Promise<TeamState> {
  const link = appUrl(`/station/setup?t=${await makeSetupLink(user.id, user.sessionVersion)}`);
  let sent = true;
  try {
    await sendMail(
      simpleEmail({
        to: user.email,
        subject: fresh ? "Your new Station sign-in link" : `${by.name} added you to The Builder Station`,
        heading: `Hi ${user.name.split(" ")[0]},`,
        lines: fresh
          ? [`${by.name} sent you a new link to set your password for The Builder Station · Station. Your old password and phone code no longer work.`]
          : [`${by.name} added you to the team that runs The Builder Station. Set a password, then a code from your phone — the Station has its own sign-in, apart from any builder's.`],
        button: { label: "Set up my sign-in", url: link },
        after: [`The link works for ${SETUP_DAYS} days.`],
      }),
    );
  } catch (err) {
    console.error("Station setup email not sent:", err);
    sent = false;
  }
  return { link, email: user.email, sent };
}

export async function addStationPerson(_prev: TeamState, fd: FormData): Promise<TeamState> {
  const me = await stationOwner();
  if (!me) return { error: "Only the owner adds people" };
  const name = String(fd.get("name") ?? "")
    .trim()
    .slice(0, 120);
  const email = String(fd.get("email") ?? "")
    .trim()
    .toLowerCase();
  const role = fd.get("role") === "OWNER" ? "OWNER" : "STAFF";
  if (!name) return { error: "Put in their name" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Put in their email" };
  if (await systemDb.stationUser.findUnique({ where: { email }, select: { id: true } })) return { error: `${email} is already on the team` };
  const user = await systemDb.stationUser.create({ data: { name, email, role } });
  await stationLog(me.id, "staff.added", `${me.name} added ${name} (${email}) as ${role === "OWNER" ? "an owner" : "staff"}`);
  revalidatePath("/station/team");
  return sendSetup(me, user, false);
}

/** A new setup link: their password and phone code start over (and every sign-in they have ends). */
export async function newSetupLink(_prev: TeamState, fd: FormData): Promise<TeamState> {
  const me = await stationOwner();
  if (!me) return { error: "Only the owner does this" };
  const id = String(fd.get("id") ?? "");
  if (id === me.id) return { error: "That's you — another owner can send you one" };
  const user = await systemDb.stationUser.update({
    where: { id },
    data: { passwordHash: null, totpSecret: null, totpEnabledAt: null, backupCodes: null, sessionVersion: { increment: 1 }, active: true },
  });
  await stationLog(me.id, "staff.reset", `${me.name} sent ${user.name} a new setup link`);
  revalidatePath("/station/team");
  return sendSetup(me, user, true);
}

async function otherOwners(exceptId: string) {
  return systemDb.stationUser.count({ where: { role: "OWNER", active: true, id: { not: exceptId } } });
}

export async function setStationRole(fd: FormData) {
  const me = await stationOwner();
  if (!me) return;
  const id = String(fd.get("id") ?? "");
  const role = fd.get("role") === "OWNER" ? "OWNER" : "STAFF";
  if (id === me.id) return; // (no taking away your own say)
  const user = await systemDb.stationUser.update({ where: { id }, data: { role } });
  await stationLog(me.id, "staff.role", `${me.name} made ${user.name} ${role === "OWNER" ? "an owner" : "staff"}`);
  revalidatePath("/station/team");
}

/** Removed: can't sign in (signed out now); kept on the list, and in the log, by name. Restore brings them back. */
export async function setStationActive(fd: FormData) {
  const me = await stationOwner();
  if (!me) return;
  const id = String(fd.get("id") ?? "");
  const active = fd.get("active") === "1";
  if (id === me.id) return;
  if (!active && !(await otherOwners(id))) return; // (never the last owner)
  const user = await systemDb.stationUser.update({ where: { id }, data: { active, sessionVersion: { increment: 1 } } });
  await stationLog(me.id, active ? "staff.restored" : "staff.removed", `${me.name} ${active ? "restored" : "removed"} ${user.name}`);
  revalidatePath("/station/team");
}
