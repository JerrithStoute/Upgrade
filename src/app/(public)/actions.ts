"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, systemDb } from "@/lib/db";
import { stationLog } from "@/lib/station-auth";
import { hashPassword, signOutEverywhere } from "@/lib/auth";
import { hashToken, sendResetEmail, sendSecurityNotice, sendVerifyEmail, redeemLink } from "@/lib/account";
import { passwordProblem } from "@/lib/passwords";
import { recordFailure, retryAfter } from "@/lib/rate-limit";
import { runAsCompany } from "@/lib/tenant";
import { afterFirstStep } from "@/lib/two-step";
import { logSecurity } from "@/lib/security-log";
import { addStarterLumber } from "@/lib/starter-lumber";
import { readBuilderInvite } from "@/lib/builder-invites";
import { passedRobotCheck, ROBOT_CHECK_FAILED } from "@/lib/turnstile";
import { STARTER_COST_CODES } from "@/lib/starter-cost-codes";
import { logActivity } from "@/lib/activity";

export type FormState = { error?: string; ok?: string; email?: string } | undefined;

const HOUR = 60 * 60 * 1000;
const field = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;

/**
 * A team invitation's position: the one picked when they were invited, or the default. An invite
 * sent before positions existed carries the four old permissions — they become this person's changes.
 */
async function invitedPosition(perms: Record<string, unknown>) {
  const { companyPositions, defaultPositionId } = await import("@/lib/positions");
  const rows = await companyPositions();
  const positionId = rows.find((r) => r.id === perms.positionId)?.id ?? (await defaultPositionId());
  const old = Object.fromEntries(
    Object.entries({ reports: perms.canSeeReports ? 1 : undefined, time: perms.canManageTime ? 2 : undefined, delay: perms.canDelay ? true : undefined, approveBills: perms.canApproveBills ? true : undefined }).filter(([, v]) => v !== undefined),
  );
  return { positionId, access: Object.keys(old).length ? JSON.stringify(old) : null };
}

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Counts an attempt; true when there have been too many lately. */
async function tooMany(key: string, limit: number, windowMs: number) {
  if (await retryAfter(key, limit) > 0) return true;
  await recordFailure(key, windowMs);
  return false;
}

// --- Sign up: a new company and its first admin ------------------------------------

export async function signUp(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!(await passedRobotCheck(fd))) return { error: ROBOT_CHECK_FAILED };
  // Invite-only for now: the link's invitation, for this very email.
  const invite = await readBuilderInvite(field(fd, "invite"));
  if (!invite) return { error: "Sign-up is by invitation for now — this link isn't valid or has expired. Ask for a new one." };
  const companyName = field(fd, "companyName").slice(0, 120);
  const name = field(fd, "name").slice(0, 120);
  const email = field(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  const starter = fd.get("starter") === "standard";
  const starterLumber = fd.get("starterLumber") === "on";
  if (!companyName || !name) return { error: "Fill in your company name and your name" };
  if (!emailOk(email)) return { error: "That email doesn't look right" };
  if (email !== invite.email) return { error: `This invitation is for ${invite.email} — sign up with that email` };
  const problem = passwordProblem(password, email);
  if (problem) return { error: problem };
  if (await tooMany(`signup:ip:${await clientIp()}`, 5, HOUR)) return { error: "Too many sign-ups from here — try again in an hour" };
  if (await systemDb.user.findUnique({ where: { email }, select: { id: true } }))
    return { error: "There's already an account with that email — sign in, or use “Forgot password?”" };

  const company = await systemDb.company.create({ data: { name: companyName } });
  const user = await runAsCompany(company.id, async () => {
    const u = await db.user.create({ data: { email, name, passwordHash: await hashPassword(password), role: "ADMIN", passwordChangedAt: new Date() } });
    if (starter) await db.costCode.createMany({ data: STARTER_COST_CODES.map((c, i) => ({ code: c.code, name: c.name, division: c.division, sortOrder: i })) });
    if (starterLumber) await addStarterLumber();
    await logActivity({ userId: u.id, type: "company.created", description: `${name} created ${companyName}` });
    return u;
  });
  // On the Station's Log (and the builder's own page there).
  await stationLog(null, "builder.signed-up", `${companyName} signed up (${name}, ${email})`, company.id);
  await sendVerifyEmail(user, company.name);
  return { ok: "sent", email };
}

/** "Send the confirmation email again" (from sign-in or the sign-up page). */
export async function resendConfirmation(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = field(fd, "email").toLowerCase();
  if ((await tooMany(`verify:${email}`, 3, HOUR)) || (await tooMany(`verify:ip:${await clientIp()}`, 10, HOUR))) return { error: "We've sent it a few times already — check your spam folder, or try again in an hour" };
  const user = emailOk(email) ? await systemDb.user.findUnique({ where: { email } }) : null;
  if (user && user.active && !user.emailVerifiedAt) {
    const company = await systemDb.company.findUnique({ where: { id: user.companyId }, select: { name: true } });
    await sendVerifyEmail(user, company?.name ?? "your company");
  }
  return { ok: `If ${email} is waiting to be confirmed, a new link is on its way.`, email };
}

/** The confirm button on the link from the email (a button, so email scanners can't use the link up). */
export async function confirmEmail(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await redeemLink(field(fd, "token"), "VERIFY_EMAIL");
  if ("error" in r) return { error: r.error };
  await systemDb.user.update({ where: { id: r.user.id }, data: { emailVerifiedAt: r.user.emailVerifiedAt ?? new Date() } });
  redirect(await afterFirstStep(r.user.id, "/dashboard?welcome=1"));
}

// --- Forgot / reset password ------------------------------------------------------

export async function forgotPassword(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!(await passedRobotCheck(fd))) return { error: ROBOT_CHECK_FAILED };
  const email = field(fd, "email").toLowerCase();
  if (!emailOk(email)) return { error: "That email doesn't look right" };
  // The same answer whether or not there's an account, so this can't be used to find out who has one.
  const answer: FormState = { ok: `If ${email} has an account, a link to reset the password is on its way. It works for 1 hour.` };
  if ((await tooMany(`reset:${email}`, 3, HOUR)) || (await tooMany(`reset:ip:${await clientIp()}`, 10, HOUR))) return answer;
  const user = await systemDb.user.findUnique({ where: { email } });
  if (user && user.active && ["ADMIN", "STAFF", "CLIENT", "VENDOR"].includes(user.role)) await sendResetEmail(user);
  return answer;
}

export async function resetPassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const password = String(fd.get("password") ?? "");
  if (password !== String(fd.get("confirm") ?? "")) return { error: "The two passwords don't match" };
  const token = field(fd, "token");
  const row = await systemDb.authToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { select: { email: true } } } });
  const problem = passwordProblem(password, row?.user.email);
  if (problem) return { error: problem };
  const r = await redeemLink(token, "RESET_PASSWORD");
  if ("error" in r) return { error: r.error };
  await systemDb.user.update({
    where: { id: r.user.id },
    data: { passwordHash: await hashPassword(password), passwordChangedAt: new Date(), emailVerifiedAt: r.user.emailVerifiedAt ?? new Date() },
  });
  // Any other sign-in (a lost phone, an old laptop) ends now.
  await signOutEverywhere(r.user.id);
  await logSecurity(r.user, "password", "reset their password with an emailed link");
  await sendSecurityNotice(r.user, "password-reset");
  redirect(await afterFirstStep(r.user.id));
}

// --- Accept an invitation -----------------------------------------------------------

export async function acceptInvite(_prev: FormState, fd: FormData): Promise<FormState> {
  const token = field(fd, "token");
  const name = field(fd, "name").slice(0, 120);
  const password = String(fd.get("password") ?? "");
  const invite = token ? await systemDb.invite.findUnique({ where: { tokenHash: hashToken(token) } }) : null;
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) return { error: "That invitation isn't valid any more — ask for a new one" };
  if (!name) return { error: "Put in your name" };
  if (password !== String(fd.get("confirm") ?? "")) return { error: "The two passwords don't match — type them again" };
  const problem = passwordProblem(password, invite.email);
  if (problem) return { error: problem };
  if (await systemDb.user.findUnique({ where: { email: invite.email }, select: { id: true } }))
    return { error: `There's already an account for ${invite.email} — sign in with it, or ask for an invitation to a different email` };

  const userId = await runAsCompany(invite.companyId, async () => {
    // Used once, even if the button's pressed twice.
    const { count } = await db.invite.updateMany({ where: { id: invite.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
    if (!count) throw new Error("That invitation has already been used");
    const perms = invite.permissions ? (JSON.parse(invite.permissions) as Record<string, unknown>) : {};
    const role = invite.kind === "CLIENT" ? "CLIENT" : invite.kind === "VENDOR" ? "VENDOR" : invite.role === "ADMIN" ? "ADMIN" : "STAFF";
    if (invite.kind === "CLIENT" && (!invite.clientId || !(await db.client.findFirst({ where: { id: invite.clientId, userId: null }, select: { id: true } }))))
      throw new Error("That client already has a portal login");
    if (invite.kind === "VENDOR" && (!invite.vendorId || !(await db.vendor.findFirst({ where: { id: invite.vendorId }, select: { id: true } }))))
      throw new Error("That vendor isn't there any more");
    const user = await db.user.create({
      data: {
        email: invite.email,
        name,
        passwordHash: await hashPassword(password),
        role,
        emailVerifiedAt: new Date(),
        passwordChangedAt: new Date(),
        ...(role === "STAFF" ? await invitedPosition(perms) : {}),
        vendorId: invite.kind === "VENDOR" ? invite.vendorId : null,
      },
    });
    if (invite.kind === "CLIENT") await db.client.update({ where: { id: invite.clientId! }, data: { userId: user.id } });
    // Any other links waiting for this email are done with.
    await db.invite.deleteMany({ where: { email: invite.email, acceptedAt: null } });
    await logActivity({ userId: user.id, type: "user.joined", description: `${name} accepted an invitation (${invite.email})` });
    return user.id;
  }).catch((e: Error) => e);
  if (userId instanceof Error) return { error: userId.message };
  redirect(await afterFirstStep(userId, "/dashboard?welcome=1"));
}
