"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";

export type LoginState = { error?: string } | undefined;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  if (!email || !password) return { error: "Enter your email and password." };

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Invalid email or password." };
  }

  await createSession(user.id);
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : null;
  redirect(safeNext ?? (user.role === "CLIENT" ? "/portal" : "/dashboard"));
}
