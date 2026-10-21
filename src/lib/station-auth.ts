import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { systemDb } from "./db";
import { getStationKey, STATION_COOKIE } from "./station-key";
import QRCode from "qrcode";
import { seal, unseal } from "./secret-box";
import { hashCode, newSecret, otpauthUrl, verifyTotp } from "./totp";

/**
 * Signing in to The Builder Station — its owner and employees, never a builder's login (those are
 * src/lib/auth.ts). Everything here is apart from the builder side: its own people (StationUser), its
 * own cookie and key (station-key.ts), its own sign-in at /station/login, and two-step sign-in
 * always — whoever signs in here can see every builder.
 *
 * Station people belong to no company: their pages read through the system login (systemDb), and the
 * app's own database login can't touch these tables at all (tenant-rules.ts).
 */

export type StationRole = "OWNER" | "STAFF";
export type StationUserInfo = { id: string; email: string; name: string; role: StationRole };

/** How long a Station sign-in lasts: a working day (then the password and code again). */
const SESSION_HOURS = 12;
const STEP = "bs_station_step";
const secure = process.env.NODE_ENV === "production";

async function sign(claims: Record<string, unknown>, life: string) {
  return new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(life).sign(getStationKey());
}
async function read(token: string | undefined, kind: string) {
  if (!token || token.length > 4000) return null;
  try {
    const { payload } = await jwtVerify(token, getStationKey());
    return payload.kind === kind && typeof payload.sub === "string" ? payload : null;
  } catch {
    return null;
  }
}

/** Writes to the Station's log (who did what; `by` null for the website or the program itself; `builderId` the company it's about). */
export async function stationLog(by: string | null, type: string, description: string, builderId?: string) {
  await systemDb.stationLog.create({ data: { stationUserId: by, type, description, builderId: builderId ?? null } });
}

/** Signed in on this browser (after the password and the code). */
export async function createStationSession(userId: string) {
  const user = await systemDb.stationUser.update({ where: { id: userId }, data: { lastSignInAt: new Date() }, select: { sessionVersion: true } });
  (await cookies()).set(STATION_COOKIE, await sign({ sub: userId, v: user.sessionVersion, kind: "station" }, `${SESSION_HOURS}h`), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_HOURS * 60 * 60,
  });
}

export async function clearStationSession() {
  const store = await cookies();
  store.set(STATION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 });
  store.set(STEP, "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 });
}

/** Who's signed in to the Station on this browser, or null. */
export const getStationUser = cache(async (): Promise<StationUserInfo | null> => {
  const p = await read((await cookies()).get(STATION_COOKIE)?.value, "station");
  if (!p) return null;
  const user = await systemDb.stationUser.findUnique({ where: { id: p.sub as string } });
  // Signed out everywhere since (a new setup link, removed): no longer good.
  if (!user || !user.active || !user.passwordHash || !user.totpEnabledAt || user.sessionVersion !== p.v) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role === "OWNER" ? "OWNER" : "STAFF" };
});

/** A Station page: signed in (as the owner, for `owner`), or off to the Station's sign-in. */
export async function requireStation(opts: { owner?: boolean } = {}): Promise<StationUserInfo> {
  const me = await getStationUser();
  if (!me) redirect("/station/login");
  if (opts.owner && me.role !== "OWNER") redirect("/station");
  return me;
}

// --- The second step -------------------------------------------------------------------

/** Half signed in (the password, or a setup link, was right): the code — or setting up the app — is next. */
export async function startStationStep(userId: string, step: "code" | "setup") {
  (await cookies()).set(STEP, await sign({ sub: userId, step, kind: "station-step" }, "10m"), { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 600 });
}

export async function readStationStep(): Promise<{ userId: string; step: "code" | "setup" } | null> {
  const p = await read((await cookies()).get(STEP)?.value, "station-step");
  return p ? { userId: p.sub as string, step: p.step === "setup" ? "setup" : "code" } : null;
}

export async function clearStationStep() {
  (await cookies()).set(STEP, "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 });
}

/** The 6-digit code, or one of the backup codes (used up once used). */
export async function checkStationCode(userId: string, input: string): Promise<"ok" | "backup" | "wrong"> {
  const user = await systemDb.stationUser.findUnique({ where: { id: userId }, select: { totpSecret: true, totpEnabledAt: true, backupCodes: true } });
  if (!user?.totpSecret || !user.totpEnabledAt) return "wrong";
  const code = input.trim();
  if (/^\d[\d\s]{4,}\d$/.test(code) && verifyTotp(unseal(user.totpSecret), code)) return "ok";
  const hashes: string[] = user.backupCodes ? JSON.parse(user.backupCodes) : [];
  const h = hashCode(code);
  if (code.replace(/[^a-z0-9]/gi, "").length === 8 && hashes.includes(h)) {
    await systemDb.stationUser.update({ where: { id: userId }, data: { backupCodes: JSON.stringify(hashes.filter((x) => x !== h)) } });
    return "backup";
  }
  return "wrong";
}

// --- Setup links -----------------------------------------------------------------------

/** How long a setup link works. */
export const SETUP_DAYS = 7;

/**
 * A link for someone to set their Station password (and then their authenticator app): for a new
 * person, or after the owner sends a new one. Good until used — setting the password, or a newer
 * link, bumps their session version and spends it.
 */
export async function makeSetupLink(userId: string, sessionVersion: number) {
  return sign({ sub: userId, v: sessionVersion, kind: "station-setup" }, `${SETUP_DAYS}d`);
}

/** The person a setup link is for, while it's still good. */
export async function readSetupLink(token: string | null | undefined) {
  const p = await read(token ?? undefined, "station-setup");
  if (!p) return null;
  const user = await systemDb.stationUser.findUnique({ where: { id: p.sub as string } });
  return user && user.active && !user.passwordHash && user.sessionVersion === p.v ? user : null;
}

/**
 * The secret for setting up the authenticator app: the one already waiting (so the code on screen
 * doesn't change if the page reloads mid-scan), or a new one. Named "The Builder Station · Station"
 * in the app, so it sits apart from the person's builder sign-in. Null when it's already set up.
 */
export async function stationSetupSecret(userId: string) {
  const user = await systemDb.stationUser.findUniqueOrThrow({ where: { id: userId }, select: { email: true, totpSecret: true, totpEnabledAt: true } });
  if (user.totpEnabledAt) return null;
  let secret = user.totpSecret ? unseal(user.totpSecret) : null;
  if (!secret) {
    secret = newSecret();
    await systemDb.stationUser.update({ where: { id: userId }, data: { totpSecret: seal(secret) } });
  }
  const qr = await QRCode.toDataURL(otpauthUrl(secret, user.email, "The Builder Station · Station"), { margin: 1, width: 360 });
  return { secret, qr };
}
