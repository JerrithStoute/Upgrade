import "server-only";
import { brandForPerson } from "./customer-brand";
import { createHash, randomBytes } from "crypto";
import { systemDb } from "./db";
import { appUrl, sendMail, simpleEmail } from "./mail";

/**
 * Account emails and their one-time links: confirm an email, reset a password, accept
 * an invitation. Each link holds a random token; only its hash is stored, it works once,
 * and it expires.
 */

export const randomToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const HOUR = 60 * 60 * 1000;
export const LINK_LIFE = { VERIFY_EMAIL: 3 * 24 * HOUR, RESET_PASSWORD: HOUR, INVITE: 7 * 24 * HOUR } as const;

type Purpose = "VERIFY_EMAIL" | "RESET_PASSWORD";
type Person = { id: string; companyId: string; email: string; name: string };

/** A fresh one-time link for `user` (earlier unused ones of the same kind stop working). */
async function issueLink(user: Person, purpose: Purpose) {
  const token = randomToken();
  await systemDb.$transaction([
    systemDb.authToken.updateMany({ where: { userId: user.id, purpose, usedAt: null }, data: { usedAt: new Date() } }),
    systemDb.authToken.create({ data: { companyId: user.companyId, userId: user.id, purpose, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + LINK_LIFE[purpose]) } }),
  ]);
  return token;
}

/** Uses up a one-time link. Returns its person — or why it can't be used. */
export async function redeemLink(token: string, purpose: Purpose) {
  const row = token ? await systemDb.authToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } }) : null;
  if (!row || row.purpose !== purpose) return { error: "That link isn't valid. Ask for a new one." } as const;
  if (row.usedAt) return { error: "That link has already been used. Ask for a new one if you need it." } as const;
  if (row.expiresAt < new Date()) return { error: "That link has expired. Ask for a new one." } as const;
  if (!row.user.active) return { error: "That login has been turned off. Ask your company's admin." } as const;
  // Used exactly once, even if clicked twice at the same moment.
  const { count } = await systemDb.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (!count) return { error: "That link has already been used. Ask for a new one if you need it." } as const;
  return { user: row.user } as const;
}

/** Checks a link without using it up (to show the form behind it). */
export async function peekLink(token: string, purpose: Purpose) {
  const row = token ? await systemDb.authToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { select: { email: true, name: true, active: true, companyId: true, role: true } } } }) : null;
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt < new Date() || !row.user.active) return null;
  return row.user;
}

export async function sendVerifyEmail(user: Person, companyName: string) {
  const token = await issueLink(user, "VERIFY_EMAIL");
  await sendMail(
    simpleEmail({
      to: user.email,
      subject: "Confirm your email for The Builder Station",
      heading: `Welcome, ${user.name.split(" ")[0]}!`,
      lines: [`Confirm this is your email to finish setting up ${companyName} on The Builder Station.`],
      button: { label: "Confirm my email", url: appUrl(`/verify?token=${token}`) },
      after: ["The link works for 3 days. If you didn't sign up, you can ignore this email."],
    }),
  );
}

/**
 * A client's or sub's emails about their login come from their builder, by name — never The Builder
 * Station (customer-brand.ts). Null for a builder's own team.
 */
async function customerMail(email: string) {
  const brand = await brandForPerson(await systemDb.user.findUnique({ where: { email }, select: { companyId: true, role: true } }));
  return brand ? { brand: brand.name, fromName: brand.name, slug: brand.slug } : null;
}

export async function sendResetEmail(user: Person) {
  const token = await issueLink(user, "RESET_PASSWORD");
  const theirs = await customerMail(user.email);
  await sendMail(
    simpleEmail({
      ...(theirs ? { brand: theirs.brand, fromName: theirs.fromName } : {}),
      to: user.email,
      subject: "Reset your password",
      heading: "Reset your password",
      lines: [`Someone (hopefully you) asked to reset the password for ${user.email}.`],
      button: { label: "Choose a new password", url: appUrl(`/reset?token=${token}`) },
      after: ["The link works for 1 hour. If you didn't ask, ignore this email — your password stays the same."],
    }),
  );
}

export async function sendInviteEmail(invite: { email: string; name: string | null; kind: string }, token: string, companyName: string, fromName: string) {
  const what = invite.kind === "CLIENT" ? `your client portal with ${companyName}` : invite.kind === "VENDOR" ? `${companyName}'s vendor portal` : `${companyName}'s team`;
  // A client or sub hears from the builder only; the builder's team is joining The Builder Station.
  const customer = invite.kind === "CLIENT" || invite.kind === "VENDOR";
  await sendMail(
    simpleEmail({
      ...(customer ? { brand: companyName, fromName: companyName } : {}),
      to: invite.email,
      subject: `${fromName} invited you to ${companyName}`,
      heading: invite.name ? `Hi ${invite.name.split(" ")[0]},` : "You're invited",
      lines: [`${fromName} invited you to ${what}${customer ? "" : " on The Builder Station"}.`, "Choose a password to get started."],
      button: { label: "Accept the invitation", url: appUrl(`/invite?token=${token}`) },
      after: ["The invitation works for 7 days."],
    }),
  );
}

const CHANGES = {
  "password-changed": { subject: "Your password was changed", line: "The password for your login was just changed." },
  "password-reset": { subject: "Your password was reset", line: "The password for your login was just reset with an emailed link." },
  "two-step-off": { subject: "Two-step sign-in was turned off", line: "Two-step sign-in was just turned off for your login. Signing in now takes only your password." },
} as const;

/**
 * Tells someone a security change was just made to their login, so a stranger can't do it
 * quietly. Never stops the change itself if the email can't be sent.
 */
export async function sendSecurityNotice(user: { email: string; name: string }, change: keyof typeof CHANGES) {
  const c = CHANGES[change];
  const theirs = await customerMail(user.email).catch(() => null);
  await sendMail(
    simpleEmail({
      ...(theirs ? { brand: theirs.brand, fromName: theirs.fromName } : {}),
      to: user.email,
      subject: c.subject,
      heading: c.subject,
      lines: [`Hi ${user.name.split(" ")[0]},`, c.line, "If this was you, there's nothing to do."],
      button: { label: "Wasn't me — reset my password", url: appUrl(theirs ? `/forgot?b=${theirs.slug}` : "/forgot") },
      after: ["Resetting your password signs every device out of your login."],
    }),
  ).catch((err) => console.error("Security email not sent:", err));
}
