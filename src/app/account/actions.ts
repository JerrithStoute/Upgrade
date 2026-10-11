"use server";

import { redirect } from "next/navigation";
import { systemDb } from "@/lib/db";
import { createSession, destroySession, hashPassword, requireUser, signOutEverywhere, verifyPassword } from "@/lib/auth";
import { passwordProblem } from "@/lib/passwords";
import { newBackupCodes } from "@/lib/totp";
import { logSecurity } from "@/lib/security-log";
import { sendSecurityNotice } from "@/lib/account";

export type AccountState = { error?: string; ok?: string; codes?: string[] } | undefined;

async function checkPassword(userId: string, password: string) {
  const u = await systemDb.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  return verifyPassword(password, u.passwordHash);
}

export async function changePassword(_prev: AccountState, fd: FormData): Promise<AccountState> {
  const me = await requireUser();
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("password") ?? "");
  if (next !== String(fd.get("confirm") ?? "")) return { error: "The two new passwords don't match" };
  if (!(await checkPassword(me.id, current))) return { error: "Your current password isn't right" };
  const problem = passwordProblem(next, me.email);
  if (problem) return { error: problem };
  await systemDb.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(next), passwordChangedAt: new Date() } });
  // Everywhere else is signed out; this browser stays signed in.
  await signOutEverywhere(me.id);
  await createSession(me.id);
  await logSecurity(me, "password", "changed their password");
  await sendSecurityNotice(me, "password-changed");
  return { ok: "Password changed. Any other devices were signed out." };
}

export async function signOutAll() {
  const me = await requireUser();
  await signOutEverywhere(me.id);
  await logSecurity(me, "sign-out", "signed out everywhere");
  await destroySession();
  redirect("/login");
}

export async function turnOffTwoStep(_prev: AccountState, fd: FormData): Promise<AccountState> {
  const me = await requireUser();
  if (!(await checkPassword(me.id, String(fd.get("password") ?? "")))) return { error: "Your password isn't right" };
  const company = await systemDb.company.findUnique({ where: { id: me.companyId }, select: { requireTwoStep: true } });
  if (company?.requireTwoStep && (me.role === "ADMIN" || me.role === "STAFF")) return { error: "Your company requires two-step sign-in for the team, so it can't be turned off" };
  await systemDb.user.update({ where: { id: me.id }, data: { totpSecret: null, totpEnabledAt: null, backupCodes: null } });
  await logSecurity(me, "two-step", "turned off two-step sign-in");
  await sendSecurityNotice(me, "two-step-off");
  return { ok: "Two-step sign-in is off." };
}

export async function newCodes(_prev: AccountState, fd: FormData): Promise<AccountState> {
  const me = await requireUser();
  if (!(await checkPassword(me.id, String(fd.get("password") ?? "")))) return { error: "Your password isn't right" };
  const { codes, hashes } = newBackupCodes();
  await systemDb.user.update({ where: { id: me.id }, data: { backupCodes: JSON.stringify(hashes) } });
  await logSecurity(me, "two-step", "made new backup codes");
  return { codes, ok: "New backup codes — the old ones no longer work." };
}
