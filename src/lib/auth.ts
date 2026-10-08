import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cache } from "react";
import { db } from "./db";
import { getSessionKey } from "./session-secret";

export const SESSION_COOKIE = "upgrade_session";
const SESSION_DAYS = 14;

export type Role = "ADMIN" | "STAFF" | "CLIENT" | "SUB" | "VENDOR";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  clientId: string | null;
  /** May delay a job's schedule (admins always can). */
  canDelay: boolean;
  /** May approve vendor bills (admins always can). */
  canApproveBills: boolean;
  canSeeReports: boolean;
  /** A vendor portal login: the vendor it's for. */
  vendorId: string | null;
};

function secretKey() {
  return getSessionKey();
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${SESSION_DAYS}d`).sign(secretKey());
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Verifies a raw session token. Safe to call from the edge proxy. */
export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Current logged-in user, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const userId = await verifySessionToken(token);
  if (!userId) return null;
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { client: { select: { id: true } } },
  });
  if (!user || !user.active) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
    clientId: user.client?.id ?? null,
    canDelay: user.canDelay,
    canApproveBills: user.canApproveBills,
    canSeeReports: user.canSeeReports,
    vendorId: user.vendorId,
  };
});

/** Require any logged-in user. Redirects to /login otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
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

/** Require someone who may see Reports: admins, and team members allowed in Settings → Team. */
export async function requireReports(): Promise<SessionUser> {
  const user = await requireStaff();
  if (user.role !== "ADMIN" && !user.canSeeReports) redirect("/dashboard");
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
        clientId: client.id,
        canDelay: false,
        canApproveBills: false,
        canSeeReports: false,
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
