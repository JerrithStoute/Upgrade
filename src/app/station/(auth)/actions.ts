"use server";

import { redirect } from "next/navigation";
import { systemDb } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { passwordProblem } from "@/lib/passwords";
import { clearFailures, failures, recordFailure, retryAfter } from "@/lib/rate-limit";
import { passedRobotCheck, robotCheckKey, ROBOT_CHECK_FAILED } from "@/lib/turnstile";
import { clientIp } from "@/lib/security-log";
import { newBackupCodes, verifyTotp } from "@/lib/totp";
import { unseal } from "@/lib/secret-box";
import {
  checkStationCode,
  clearStationSession,
  clearStationStep,
  createStationSession,
  readSetupLink,
  readStationStep,
  startStationStep,
  stationLog,
} from "@/lib/station-auth";

export type StationFormState = { error?: string; check?: boolean; codes?: string[] } | undefined;

const WINDOW_MS = 15 * 60 * 1000;
const CHECK_AFTER = 2;

// Compared against when the email doesn't exist, so a miss takes as long as a wrong password.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword("not-a-real-password"));

/** The password — then on to the code from their phone (or setting it up, the first time). */
export async function stationLogin(_prev: StationFormState, fd: FormData): Promise<StationFormState> {
  const email = String(fd.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const emailKey = `station-login:email:${email}`;
  const ipKey = `station-login:ip:${await clientIp()}`;
  const wait = Math.max(await retryAfter(emailKey, 5), await retryAfter(ipKey, 20));
  if (wait > 0) return { error: `Too many failed sign-in attempts. Try again in ${Math.max(1, Math.ceil(wait / 60))} minutes.` };
  const needsCheck = async () => !!robotCheckKey() && Math.max(await failures(emailKey), await failures(ipKey)) >= CHECK_AFTER;
  if ((await needsCheck()) && !(await passedRobotCheck(fd))) return { error: ROBOT_CHECK_FAILED, check: true };

  const user = await systemDb.stationUser.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !user.active || !user.passwordHash || !ok) {
    await recordFailure(emailKey, WINDOW_MS);
    await recordFailure(ipKey, WINDOW_MS);
    if (user && user.active) await stationLog(user.id, "sign-in.failed", `${user.name}: wrong password`);
    return { error: "Invalid email or password.", check: await needsCheck() };
  }
  await clearFailures(emailKey);
  await startStationStep(user.id, user.totpEnabledAt ? "code" : "setup");
  redirect(user.totpEnabledAt ? "/station/two-step" : "/station/two-step/setup");
}

/** The 6-digit code (or a backup code): signed in. */
export async function finishStationCode(_prev: StationFormState, fd: FormData): Promise<StationFormState> {
  const step = await readStationStep();
  if (!step || step.step !== "code") return { error: "That took too long — sign in again" };
  const key = `station-two-step:${step.userId}`;
  if (await retryAfter(key, 5) > 0) return { error: "Too many wrong codes — wait 15 minutes, or sign in again later" };
  const result = await checkStationCode(step.userId, String(fd.get("code") ?? ""));
  const user = await systemDb.stationUser.findUniqueOrThrow({ where: { id: step.userId }, select: { id: true, name: true } });
  if (result === "wrong") {
    await recordFailure(key, WINDOW_MS);
    await stationLog(user.id, "sign-in.failed", `${user.name}: wrong two-step code`);
    return { error: "That code isn't right — check the app and try again" };
  }
  await clearFailures(key);
  await clearStationStep();
  await createStationSession(user.id);
  await stationLog(user.id, "sign-in", result === "backup" ? `${user.name} signed in with a backup code` : `${user.name} signed in`);
  redirect("/station");
}

/** From a setup link: their password. Then on to setting up the authenticator app. */
export async function setStationPassword(_prev: StationFormState, fd: FormData): Promise<StationFormState> {
  const user = await readSetupLink(String(fd.get("t") ?? ""));
  if (!user) return { error: "This link has been used or is too old — ask for a new one" };
  const password = String(fd.get("password") ?? "");
  if (password !== String(fd.get("confirm") ?? "")) return { error: "The two passwords don't match" };
  const problem = passwordProblem(password, user.email);
  if (problem) return { error: problem };
  // (A new password spends the link, and any sign-in from before.)
  await systemDb.stationUser.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password), sessionVersion: { increment: 1 }, totpSecret: null, totpEnabledAt: null, backupCodes: null },
  });
  await stationLog(user.id, "password.set", `${user.name} set their password`);
  await startStationStep(user.id, "setup");
  redirect("/station/two-step/setup");
}

/** The first code from the app: two-step is on. Hands back the backup codes (shown once). */
export async function confirmStationTwoStep(_prev: StationFormState, fd: FormData): Promise<StationFormState> {
  const step = await readStationStep();
  if (!step || step.step !== "setup") return { error: "That took too long — sign in again" };
  const user = await systemDb.stationUser.findUnique({ where: { id: step.userId }, select: { id: true, name: true, totpSecret: true } });
  if (!user?.totpSecret) return { error: "Start the setup again" };
  if (!verifyTotp(unseal(user.totpSecret), String(fd.get("code") ?? ""))) return { error: "That code isn't right — make sure you scanned this page's code, then try the newest one" };
  const { codes, hashes } = newBackupCodes();
  await systemDb.stationUser.update({ where: { id: user.id }, data: { totpEnabledAt: new Date(), backupCodes: JSON.stringify(hashes) } });
  await stationLog(user.id, "two-step", `${user.name} turned on two-step sign-in`);
  return { codes };
}

/** After the backup codes are saved: signed in. */
export async function finishStationSetup() {
  const step = await readStationStep();
  if (!step || step.step !== "setup") redirect("/station/login");
  const user = await systemDb.stationUser.findUniqueOrThrow({ where: { id: step.userId }, select: { id: true, name: true, totpEnabledAt: true } });
  if (!user.totpEnabledAt) redirect("/station/two-step/setup");
  await clearStationStep();
  await createStationSession(user.id);
  await stationLog(user.id, "sign-in", `${user.name} signed in`);
  redirect("/station");
}

export async function stationSignOut() {
  await clearStationSession();
  redirect("/station/login");
}
