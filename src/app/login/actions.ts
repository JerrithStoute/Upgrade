"use server";

import { redirect } from "next/navigation";
import { systemDb } from "@/lib/db";
import { hashPassword, upgradePasswordHash, verifyPassword } from "@/lib/auth";
import { afterFirstStep } from "@/lib/two-step";
import { clearFailures, failures, recordFailure, retryAfter } from "@/lib/rate-limit";
import { passedRobotCheck, robotCheckKey, ROBOT_CHECK_FAILED } from "@/lib/turnstile";
import { clientIp, logSecurity } from "@/lib/security-log";
import { PAUSED_MESSAGE } from "@/lib/builder-status";

export type LoginState = { error?: string; unconfirmed?: string; check?: boolean } | undefined;

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 20;
/** After this many wrong tries, the "I'm not a robot" check is added. */
const CHECK_AFTER = 2;

/** Roles that can sign in today. SUB is excluded until there is a subcontractor portal. */
const LOGIN_ROLES = ["ADMIN", "STAFF", "CLIENT", "VENDOR"];

// Compared against when the email doesn't exist, so a miss takes as long as a wrong password.
let dummyHash: Promise<string> | null = null;
function getDummyHash() {
  dummyHash ??= hashPassword("not-a-real-password");
  return dummyHash;
}

function tooMany(seconds: number): LoginState {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return { error: `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  if (!email || !password) return { error: "Enter your email and password." };

  const emailKey = `login:email:${email}`;
  const ipKey = `login:ip:${await clientIp()}`;
  const wait = Math.max(retryAfter(emailKey, MAX_FAILURES_PER_EMAIL), retryAfter(ipKey, MAX_FAILURES_PER_IP));
  if (wait > 0) return tooMany(wait);
  const needsCheck = () => !!robotCheckKey() && Math.max(failures(emailKey), failures(ipKey)) >= CHECK_AFTER;
  if (needsCheck() && !(await passedRobotCheck(formData))) return { error: ROBOT_CHECK_FAILED, check: true };

  // Emails are unique across all companies; signing in comes before knowing the company.
  const user = await systemDb.user.findUnique({ where: { email } });
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !user.active || !passwordOk) {
    recordFailure(emailKey, WINDOW_MS);
    recordFailure(ipKey, WINDOW_MS);
    if (user && user.active) await logSecurity(user, "failed", "entered a wrong password");
    return { error: "Invalid email or password.", check: needsCheck() };
  }

  if (!LOGIN_ROLES.includes(user.role)) {
    return { error: "Subcontractor sign-in isn't available yet. Contact your project manager." };
  }

  clearFailures(emailKey);
  if ((await systemDb.stationBuilder.findUnique({ where: { companyId: user.companyId }, select: { status: true } }))?.status === "PAUSED") return { error: PAUSED_MESSAGE };
  await upgradePasswordHash(user.id, password, user.passwordHash);
  if (!user.emailVerifiedAt) return { error: `Confirm your email first — we sent a link to ${user.email} when you signed up.`, unconfirmed: user.email };
  // Signed in now — or on to the authenticator code, when they use one.
  redirect(await afterFirstStep(user.id, next));
}
