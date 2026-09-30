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

export type Role = "ADMIN" | "STAFF" | "CLIENT" | "SUB";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  clientId: string | null;
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
  const token = await new SignJWT({ sub: userId })
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
  if (!isStaff(user)) redirect("/logout");
  return user;
}

/** Require an administrator. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireStaff();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}

/** Require a client portal user. Staff are sent to the dashboard. */
export async function requireClient(): Promise<SessionUser & { clientId: string }> {
  const user = await requireUser();
  if (user.role !== "CLIENT" || !user.clientId) redirect("/dashboard");
  return { ...user, clientId: user.clientId };
}

export function isStaff(user: SessionUser) {
  return user.role === "ADMIN" || user.role === "STAFF";
}
