import "server-only";
import { rememberHome } from "./customer-brand";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cache } from "react";
import { db, systemDb } from "./db";
import { getSessionKey } from "./session-secret";
import { AREAS, NO_ACCESS, allows, resolveAccess, type Access, type AreaKey } from "./access";

// Online the cookie name starts with __Host-: browsers then only accept it over HTTPS, from this exact site.
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-bs_session" : "upgrade_session";
const SESSION_DAYS = 14;

export type Role = "ADMIN" | "STAFF" | "CLIENT" | "SUB" | "VENDOR";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** The company they belong to — everything they see and change is that company's. */
  companyId: string;
  clientId: string | null;
  /** What they may see and change (their position and their own changes; admins everything). See access.ts. */
  access: Access;
  /** A vendor portal login: the vendor it's for. */
  vendorId: string | null;
};

function secretKey() {
  return getSessionKey();
}

/** How much work scrambling a password takes (each +1 doubles it). Older, weaker hashes are redone at sign-in. */
export const PASSWORD_ROUNDS = 12;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, PASSWORD_ROUNDS);
}

/** After a successful sign-in: redo an older, weaker password hash at today's strength. */
export async function upgradePasswordHash(userId: string, password: string, hash: string) {
  if (bcrypt.getRounds(hash) >= PASSWORD_ROUNDS) return;
  await systemDb.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password) } });
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

/**
 * Signs someone in on this browser. The sign-in carries their session "version": bumping
 * it (signOutEverywhere) ends every sign-in they have, on every device.
 */
export async function createSession(userId: string) {
  const user = await systemDb.user.update({ where: { id: userId }, data: { lastSignInAt: new Date() }, select: { sessionVersion: true, companyId: true, role: true } });
  const token = await new SignJWT({ sub: userId, v: user.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  // A client's or sub's browser remembers their builder: signing out goes back to its page.
  await rememberHome(user);
}

export async function destroySession() {
  // Removed with the same settings it was made with: online the browser ignores a removal of
  // this cookie that isn't marked secure — the old sign-in would linger and loop.
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}

/** Ends every sign-in this person has, everywhere (password changed, deactivated, "sign out everywhere"). */
export async function signOutEverywhere(userId: string) {
  await systemDb.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
}

/** Verifies a raw session token: who, and which session version. */
export async function verifySessionToken(token: string): Promise<{ userId: string; version: number } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return typeof payload.sub === "string" ? { userId: payload.sub, version: typeof payload.v === "number" ? payload.v : 0 } : null;
  } catch {
    return null;
  }
}

/** Current logged-in user, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;
  const userId = session.userId;
  // Before the company is known, so past the gatekeeper (it's how the gatekeeper learns the company).
  const user = await systemDb.user.findUnique({
    where: { id: userId },
    include: { client: { select: { id: true } }, position: { select: { access: true } } },
  });
  // Signed out everywhere since this sign-in (or deactivated): no longer valid.
  if (!user || !user.active || user.sessionVersion !== session.version) return null;
  // The company's account is paused by The Builder Station (builder-status.ts): nobody in it is signed in.
  if ((await systemDb.stationBuilder.findUnique({ where: { companyId: user.companyId }, select: { status: true } }))?.status === "PAUSED") return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
    companyId: user.companyId,
    clientId: user.client?.id ?? null,
    access: user.role === "ADMIN" || user.role === "STAFF" ? resolveAccess(user.role, user.position?.access, user.access) : NO_ACCESS,
    vendorId: user.vendorId,
  };
});

/** Require any logged-in user. Redirects to /login otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    // A sign-in that's no longer good (signed out everywhere, deactivated) is cleared first,
    // so the sign-in page doesn't bounce them straight back.
    if ((await cookies()).get(SESSION_COOKIE)) redirect("/logout");
    redirect("/login");
  }
  return user;
}

/**
 * Require an internal team member (ADMIN or STAFF). Clients are sent to the portal.
 * Any other role (e.g. SUB — subcontractors have no portal yet) is signed out, so a
 * subcontractor can never see budgets, margins or other clients' projects.
 */
export async function requireStaff(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === "CLIENT") redirect("/portal");
  if (user.role === "VENDOR") redirect("/vendor");
  if (!isStaff(user)) redirect("/logout");
  return user;
}

export type VendorUser = SessionUser & { vendorId: string };

/** Require a sub / vendor portal login. Anyone else goes home. */
export async function requireVendor(): Promise<VendorUser> {
  const user = await requireUser();
  if (user.role !== "VENDOR") redirect(user.role === "CLIENT" ? "/portal" : "/dashboard");
  if (!user.vendorId) redirect("/logout");
  return { ...user, vendorId: user.vendorId };
}

/**
 * A page in `area`: the team members whose position shows it (Can view or Can edit). Others go home.
 * `costs`: a page that's your costs (the estimate sheet, a change order's working view, lumber bids) —
 * someone who doesn't see costs and profit goes to the given page instead (the client's view).
 */
export async function requireView(area: AreaKey, opts?: { costs?: string }): Promise<SessionUser> {
  const user = await requireStaff();
  if (!allows(user.access, area, 1)) redirect("/dashboard");
  if (opts?.costs && !user.access.costs) redirect(opts.costs);
  return user;
}

/** A change in `area`: the team members whose position may edit it (and, with `costs`, sees costs and profit). Others are told why. */
export async function requireEdit(area: AreaKey, opts?: { costs?: boolean }): Promise<SessionUser> {
  const user = await requireStaff();
  if (!allows(user.access, area, 2)) {
    const label = AREAS.find((a) => a.key === area)?.label ?? area;
    throw new Error(`Your position can't change ${label} — an admin can allow it in Directory → Team`);
  }
  if (opts?.costs && !user.access.costs) throw new Error("Your position doesn't see costs and profit, so it can't change this — an admin can allow it in Directory → Team");
  return user;
}

/** Require an administrator. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireStaff();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}

/** "Client view": a team member looking at a client's portal ("<clientId>:<projectId>"). */
export const CLIENT_VIEW_COOKIE = "upgrade_client_view";
export const CLIENT_VIEW_HOURS = 2;

export type ClientUser = SessionUser & {
  clientId: string;
  /** A team member in Client view: look only — nothing they do is saved, nothing is marked seen. */
  preview: boolean;
  /** Client view: the job it was opened from (the way back). */
  previewProjectId: string | null;
};

/**
 * Require a client portal user. A team member in Client view gets the client — their
 * own portal user, so everything shows exactly as they see it — flagged as a preview.
 * Anyone else (staff not in Client view) is sent to the dashboard.
 */
export const requireClient = cache(async (): Promise<ClientUser> => {
  const user = await requireUser();
  if (user.role === "CLIENT" && user.clientId) return { ...user, clientId: user.clientId, preview: false, previewProjectId: null };
  if (isStaff(user)) {
    const view = (await cookies()).get(CLIENT_VIEW_COOKIE)?.value;
    const [clientId, projectId] = (view ?? "").split(":");
    const client = clientId ? await db.client.findUnique({ where: { id: clientId }, include: { user: { select: { id: true, name: true, email: true } } } }) : null;
    if (client)
      return {
        id: client.user?.id ?? user.id,
        email: client.user?.email ?? client.email ?? user.email,
        name: client.user?.name ?? `${client.firstName} ${client.lastName}`.trim(),
        role: "CLIENT",
        companyId: user.companyId,
        clientId: client.id,
        access: NO_ACCESS,
        vendorId: null,
        preview: true,
        previewProjectId: projectId || null,
      };
  }
  redirect("/dashboard");
});

export function isStaff(user: SessionUser) {
  return user.role === "ADMIN" || user.role === "STAFF";
}
