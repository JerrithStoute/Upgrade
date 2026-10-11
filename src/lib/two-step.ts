import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { systemDb } from "./db";
import { createSession } from "./auth";
import { getSessionKey } from "./session-secret";
import { unseal } from "./secret-box";
import { hashCode, verifyTotp } from "./totp";
import { logSecurity } from "./security-log";

/**
 * Two-step sign-in. After the right password, someone with an authenticator app set up
 * (or whose company requires one) is only half signed in: a short-lived cookie says who,
 * and they finish with the 6-digit code (or a backup code). "Remember this computer"
 * skips the code on that browser for 30 days — until they're signed out everywhere.
 */

const PENDING = "bs_two_step";
const DEVICE = "bs_device";
const secure = process.env.NODE_ENV === "production";

type Pending = { userId: string; step: "code" | "setup"; next: string };

async function sign(claims: Record<string, unknown>, life: string) {
  return new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(life).sign(getSessionKey());
}

export async function startTwoStep(p: Pending) {
  (await cookies()).set(PENDING, await sign({ sub: p.userId, step: p.step, next: p.next, kind: "two-step" }, "10m"), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 600,
  });
}

export async function readTwoStep(): Promise<Pending | null> {
  const token = (await cookies()).get(PENDING)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSessionKey());
    if (payload.kind !== "two-step" || typeof payload.sub !== "string") return null;
    return { userId: payload.sub, step: payload.step === "setup" ? "setup" : "code", next: typeof payload.next === "string" ? payload.next : "" };
  } catch {
    return null;
  }
}

export async function clearTwoStep() {
  (await cookies()).set(PENDING, "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 });
}

/** Does this browser skip the code for `userId` ("remember this computer")? */
export async function trustedDevice(userId: string, sessionVersion: number) {
  const token = (await cookies()).get(DEVICE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getSessionKey());
    return payload.kind === "device" && payload.sub === userId && payload.v === sessionVersion;
  } catch {
    return false;
  }
}

export async function trustThisDevice(userId: string, sessionVersion: number) {
  (await cookies()).set(DEVICE, await sign({ sub: userId, v: sessionVersion, kind: "device" }, "30d"), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
}

/** The 6-digit code, or one of the backup codes (used up once used). */
export async function checkSecondStep(userId: string, input: string): Promise<"ok" | "backup" | "wrong"> {
  const user = await systemDb.user.findUnique({ where: { id: userId }, select: { totpSecret: true, backupCodes: true } });
  if (!user?.totpSecret) return "wrong";
  const code = input.trim();
  if (/^\d[\d\s]{4,}\d$/.test(code) && verifyTotp(unseal(user.totpSecret), code)) return "ok";
  const hashes: string[] = user.backupCodes ? JSON.parse(user.backupCodes) : [];
  const h = hashCode(code);
  if (code.replace(/[^a-z0-9]/gi, "").length === 8 && hashes.includes(h)) {
    await systemDb.user.update({ where: { id: userId }, data: { backupCodes: JSON.stringify(hashes.filter((x) => x !== h)) } });
    return "backup";
  }
  return "wrong";
}

/** Where someone goes once signed in. */
export function homeFor(role: string, next?: string) {
  const safe = next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;
  return safe ?? (role === "CLIENT" ? "/portal" : role === "VENDOR" ? "/vendor" : "/dashboard");
}

/**
 * After the password (or a link that proves the email): sign in now, or go on to the
 * second step when the person uses one — or must set one up for their company.
 * Returns where to send them.
 */
export async function afterFirstStep(userId: string, next = ""): Promise<string> {
  const user = await systemDb.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, role: true, totpEnabledAt: true, sessionVersion: true, companyId: true } });
  const company = await systemDb.company.findUnique({ where: { id: user.companyId }, select: { requireTwoStep: true } });
  const team = user.role === "ADMIN" || user.role === "STAFF";
  if (user.totpEnabledAt) {
    if (await trustedDevice(userId, user.sessionVersion)) {
      await createSession(userId);
      await logSecurity(user, "sign-in", "signed in (remembered device)");
      return homeFor(user.role, next);
    }
    await startTwoStep({ userId, step: "code", next });
    return "/login/two-step";
  }
  if (team && company?.requireTwoStep) {
    await startTwoStep({ userId, step: "setup", next });
    return "/login/two-step/setup";
  }
  await createSession(userId);
  await logSecurity(user, "sign-in", "signed in");
  return homeFor(user.role, next);
}
