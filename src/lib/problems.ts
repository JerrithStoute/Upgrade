import "server-only";
import { systemDb } from "./db";
import { SESSION_COOKIE, verifySessionToken } from "./auth";
import { appUrl, sendMail, simpleEmail } from "./mail";
import { failures, recordFailure } from "./rate-limit";
import { clip, errorKey, shouldAlert } from "./problem-rules";

/**
 * The Station's Problems tab: what broke, and what people reported.
 *
 * - Errors: anything that breaks on the server (instrumentation.ts onRequestError, and form actions —
 *   friendly-action.ts) or in someone's browser (/api/problems/error, from <ErrorCatcher>). The same
 *   error again is counted on its row (problem-rules.ts errorKey). The Station's owners are emailed
 *   the first time, when one marked fixed comes back, and every few hours while it keeps happening.
 * - Reports: "Report a problem" in the top bar — a sentence, maybe a picture, and the page they were on.
 *   Emailed to the owners too.
 *
 * Through the system login: these tables are the Station's, no company's (tenant-rules.ts). Nothing
 * here may throw — a problem with the problem log must never become the person's problem.
 */

type Who = { userName: string; userId: string; builderName: string; builderId: string } | null;

/** Who a sign-in cookie belongs to (their name and company), or null. */
export async function whoFromToken(token: string | undefined | null): Promise<Who> {
  if (!token) return null;
  const s = await verifySessionToken(token);
  if (!s) return null;
  const u = await systemDb.user.findUnique({ where: { id: s.userId }, select: { id: true, name: true, companyId: true } });
  if (!u) return null;
  const c = await systemDb.company.findUnique({ where: { id: u.companyId }, select: { name: true } });
  return { userName: u.name, userId: u.id, builderName: c?.name ?? "(no name)", builderId: u.companyId };
}

/** The sign-in cookie out of a request's Cookie header. */
export function tokenFromCookieHeader(header: string | string[] | undefined) {
  const all = Array.isArray(header) ? header.join("; ") : (header ?? "");
  for (const part of all.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === SESSION_COOKIE) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

/** Emails to the Station's owners — at most 20 an hour, however much is breaking. */
async function emailOwners(subject: string, heading: string, lines: string[]) {
  if ((await failures("problems.email")) >= 20) return;
  const owners = await systemDb.stationUser.findMany({ where: { role: "OWNER", active: true }, select: { email: true } });
  if (!owners.length) return;
  await recordFailure("problems.email", 60 * 60 * 1000);
  for (const o of owners) {
    await sendMail(simpleEmail({ to: o.email, subject, heading, lines, button: { label: "Open Problems", url: appUrl("/station/problems") } })).catch((e) => console.error("[problems] email", e));
  }
}

/** Something broke: counted on its row, and the owners told when it's time. */
export async function recordError(input: { side: "server" | "browser"; message: string; stack?: string | null; page: string; who: Who }) {
  try {
    const message = clip(input.message, 1000) || "(no message)";
    const page = clip(input.page.split(/[?#]/)[0], 300) || "/";
    const stack = clip(input.stack ?? "", 4000) || null;
    const key = errorKey(input.side, message, page);
    const now = new Date();
    const before = await systemDb.stationError.findUnique({ where: { key }, select: { alertedAt: true, fixedAt: true } });
    const alert = shouldAlert(before, now);
    const last = { lastUserName: input.who?.userName ?? null, lastBuilderName: input.who?.builderName ?? null, lastBuilderId: input.who?.builderId ?? null };
    const row = await systemDb.stationError.upsert({
      where: { key },
      create: { key, side: input.side, message, stack, page, ...last, ...(alert ? { alertedAt: now } : {}) },
      update: { count: { increment: 1 }, message, stack, page, lastAt: now, fixedAt: null, ...last, ...(alert ? { alertedAt: now } : {}) },
    });
    console.error(`[problem] ${input.side} ${page}: ${message}`);
    if (!alert) return;
    const again = before?.fixedAt ? "It was marked fixed, and it's happened again." : row.count > 1 ? `It has happened ${row.count} times so far.` : "This is the first time.";
    await emailOwners(`Something broke: ${message.slice(0, 70)}`, "Something broke in The Builder Station", [
      `${input.side === "server" ? "On the server" : "In someone's browser"}, on the page ${page}`,
      `What it said: ${message.slice(0, 400)}`,
      input.who ? `It happened to ${input.who.userName} (${input.who.builderName}).` : "Nobody was signed in.",
      again,
    ]);
  } catch (e) {
    console.error("[problems] couldn't record an error", e);
  }
}

/** A server error, from instrumentation.ts or a form action (friendly-action.ts). */
export async function recordServerError(err: unknown, page: string, token: string | null) {
  const e = err instanceof Error ? err : new Error(String(err));
  await recordError({ side: "server", message: `${e.constructor?.name && e.constructor.name !== "Error" ? `${e.constructor.name}: ` : ""}${e.message}`, stack: e.stack, page, who: await whoFromToken(token).catch(() => null) });
}

/** "Report a problem": kept for the Station, and the owners emailed. */
export async function saveProblemReport(input: {
  who: { userId: string; userName: string; userEmail: string; builderId: string; builderName: string };
  page: string;
  message: string;
  screenshot: Buffer | null;
  device: string;
}) {
  const row = await systemDb.stationProblem.create({
    data: {
      builderId: input.who.builderId,
      builderName: input.who.builderName,
      userId: input.who.userId,
      userName: input.who.userName,
      userEmail: input.who.userEmail,
      page: clip(input.page, 300) || "/",
      message: clip(input.message, 4000),
      screenshot: input.screenshot ? new Uint8Array(input.screenshot) : null,
      device: clip(input.device, 300) || null,
    },
    select: { id: true },
  });
  await emailOwners(`Problem reported by ${input.who.userName} (${input.who.builderName})`, `${input.who.userName} reported a problem`, [
    `${input.who.builderName} · ${input.who.userEmail}`,
    `On the page ${input.page}`,
    `“${input.message.slice(0, 1500)}”`,
    input.screenshot ? "They added a picture — it's on the Problems tab." : "",
  ].filter(Boolean)).catch((e) => console.error("[problems] email", e));
  return row.id;
}
