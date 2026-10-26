"use server";

import { redirect } from "next/navigation";
import { systemDb } from "@/lib/db";
import { createSession, getCurrentUser } from "@/lib/auth";
import { clearFailures, recordFailure, retryAfter } from "@/lib/rate-limit";
import { checkSecondStep, clearTwoStep, homeFor, readTwoStep, trustThisDevice } from "@/lib/two-step";
import { newBackupCodes, verifyTotp } from "@/lib/totp";
import { unseal } from "@/lib/secret-box";
import { logSecurity } from "@/lib/security-log";

export type StepState = { error?: string; codes?: string[] } | undefined;

/** The 6-digit code (or a backup code) — the second half of signing in. */
export async function finishTwoStep(_prev: StepState, fd: FormData): Promise<StepState> {
  const pending = await readTwoStep();
  if (!pending || pending.step !== "code") return { error: "That took too long — sign in again" };
  const key = `two-step:${pending.userId}`;
  if (await retryAfter(key, 5) > 0) return { error: "Too many wrong codes — wait 15 minutes, or sign in again later" };
  const result = await checkSecondStep(pending.userId, String(fd.get("code") ?? ""));
  if (result === "wrong") {
    await recordFailure(key, 15 * 60 * 1000);
    const who = await systemDb.user.findUnique({ where: { id: pending.userId }, select: { id: true, companyId: true, name: true } });
    if (who) await logSecurity(who, "failed", "entered a wrong two-step code");
    return { error: "That code isn't right — check the app and try again" };
  }
  await clearFailures(key);
  const user = await systemDb.user.findUniqueOrThrow({ where: { id: pending.userId }, select: { id: true, companyId: true, name: true, role: true, sessionVersion: true } });
  await clearTwoStep();
  if (fd.get("remember") === "on") await trustThisDevice(pending.userId, user.sessionVersion);
  await createSession(pending.userId);
  await logSecurity(user, "sign-in", result === "backup" ? "signed in with a backup code" : "signed in with two-step");
  redirect(homeFor(user.role, pending.next));
}

/** Whose two-step is being set up: someone half signed in whose company requires it, or the signed-in person (Account). */
async function setupUser() {
  const pending = await readTwoStep();
  if (pending?.step === "setup") return { userId: pending.userId, pending };
  const me = await getCurrentUser();
  return me ? { userId: me.id, pending: null } : null;
}

/** Checks the first code from the app, turns two-step on, and hands back the backup codes (shown once). */
export async function confirmTwoStepSetup(_prev: StepState, fd: FormData): Promise<StepState> {
  const who = await setupUser();
  if (!who) return { error: "That took too long — sign in again" };
  const user = await systemDb.user.findUnique({ where: { id: who.userId }, select: { id: true, companyId: true, name: true, totpSecret: true, totpEnabledAt: true } });
  if (!user?.totpSecret) return { error: "Start the setup again" };
  if (!verifyTotp(unseal(user.totpSecret), String(fd.get("code") ?? "")))
    return { error: "That code isn't right — make sure you scanned this page's code, then try the newest one" };
  const { codes, hashes } = newBackupCodes();
  await systemDb.user.update({ where: { id: who.userId }, data: { totpEnabledAt: new Date(), backupCodes: JSON.stringify(hashes) } });
  await logSecurity(user, "two-step", "turned on two-step sign-in");
  return { codes };
}

/** After the backup codes are saved: on into the program (sign-in), or back to Account. */
export async function finishTwoStepSetup() {
  const who = await setupUser();
  if (!who) redirect("/login");
  if (who.pending) {
    const user = await systemDb.user.findUniqueOrThrow({ where: { id: who.userId }, select: { id: true, companyId: true, name: true, role: true, totpEnabledAt: true } });
    if (!user.totpEnabledAt) redirect("/login/two-step/setup");
    await clearTwoStep();
    await createSession(who.userId);
    await logSecurity(user, "sign-in", "signed in");
    redirect(homeFor(user.role, who.pending.next));
  }
  redirect("/account?twostep=on");
}
