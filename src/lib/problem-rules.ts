/**
 * The plain rules behind the Station's Problems tab (problems.ts): which errors are worth keeping, which
 * are the same error again, and when the owner gets an email. No database — tested in problem-rules.test.ts.
 */

/** The owner's emailed about the same error again at most this often (while it keeps happening). */
export const ALERT_EVERY_MS = 6 * 60 * 60 * 1000;

/** A page's address without what changes from job to job: /projects/cmabc…/estimate → /projects/[id]/estimate. */
export function pagePattern(page: string) {
  const path = page.split(/[?#]/)[0] || "/";
  return path
    .split("/")
    .map((part) => (/^c[a-z0-9]{20,}$/.test(part) || /^\d+$/.test(part) || /^[0-9a-f-]{32,36}$/i.test(part) ? "[id]" : part))
    .join("/");
}

/** The message without what changes each time (numbers, ids, quoted names) — so the same error counts as one. */
export function plainMessage(message: string) {
  return message
    .replace(/\bc[a-z0-9]{20,}\b/g, "*")
    .replace(/"[^"]{0,200}"|'[^']{0,200}'|“[^”]{0,200}”/g, "…")
    .replace(/\d+/g, "#")
    .slice(0, 300);
}

/** What makes two errors the same one: where it happened, what it said, on which page. */
export function errorKey(side: "server" | "browser", message: string, page: string) {
  return `${side}|${plainMessage(message)}|${pagePattern(page)}`;
}

/**
 * Browser errors that aren't the program's: a phone losing signal, a browser add-on, the browser's own
 * hiccups, a page left open over an update (it reloads itself).
 */
export function isBrowserNoise(message: string, stack = "") {
  const m = message.toLowerCase();
  return (
    !m.trim() ||
    m === "script error." ||
    m.includes("resizeobserver loop") ||
    m.includes("failed to fetch") ||
    m.includes("load failed") ||
    m.includes("networkerror") ||
    m.includes("network error") ||
    m.includes("the user aborted") ||
    m.includes("aborterror") ||
    m.includes("loading chunk") ||
    m.includes("chunkloaderror") ||
    m.includes("failed to load module script") ||
    m.includes("importing a module script failed") ||
    (m.includes("server action") && m.includes("was not found")) ||
    /(chrome|moz|safari(-web)?)-extension:\/\//.test(stack)
  );
}

/**
 * Server errors worth keeping. A form's own "That email doesn't look right" (a plain Error from a
 * server action) is the program saying what's wrong — not something broken.
 */
export function isServerProblem(e: { name?: string; constructorName?: string }, kind: string) {
  if (kind !== "action") return true;
  const name = e.constructorName || e.name || "";
  return name !== "Error";
}

/** Email the owner? Always the first time, when one marked fixed comes back, and again after ALERT_EVERY_MS. */
export function shouldAlert(row: { alertedAt: Date | null; fixedAt: Date | null } | null, now: Date) {
  if (!row || row.fixedAt || !row.alertedAt) return true;
  return now.getTime() - row.alertedAt.getTime() >= ALERT_EVERY_MS;
}

/** A short, safe piece of text from whatever was sent. */
export const clip = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
