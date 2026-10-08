"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, hashPassword, verifyPassword } from "@/lib/auth";
import { clearFailures, recordFailure, retryAfter } from "@/lib/rate-limit";

export type LoginState = { error?: string } | undefined;

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 20;

/** Roles that can sign in today. SUB is excluded until there is a subcontractor portal. */
const LOGIN_ROLES = ["ADMIN", "STAFF", "CLIENT", "VENDOR"];

// Compared against when the email doesn't exist, so a miss takes as long as a wrong password.
let dummyHash: Promise<string> | null = null;
function getDummyHash() {
  dummyHash ??= hashPassword("not-a-real-password");
  return dummyHash;
}

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
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

  const user = await db.user.findUnique({ where: { email } });
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !user.active || !passwordOk) {
    recordFailure(emailKey, WINDOW_MS);
    recordFailure(ipKey, WINDOW_MS);
    return { error: "Invalid email or password." };
  }

  if (!LOGIN_ROLES.includes(user.role)) {
    return { error: "Subcontractor sign-in isn't available yet. Contact your project manager." };
  }

  clearFailures(emailKey);
  await createSession(user.id);
  const safeNext = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;
  redirect(safeNext ?? (user.role === "CLIENT" ? "/portal" : user.role === "VENDOR" ? "/vendor" : "/dashboard"));
}
