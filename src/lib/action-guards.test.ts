import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { areaForPath } from "./access";

/**
 * Every button that changes something runs a server action, and anyone can call a server
 * action directly — so each one must check who is signed in, and what they're allowed to do,
 * itself. These tests read the code and fail if a new action (or download link) forgets.
 */

const APP = join(process.cwd(), "src", "app");
const GUARD =
  /\b(requireUser|requireStaff|requireAdmin|requireView|requireEdit|requireVendor|requireClient|requireTimeManager|getCurrentUser|setupUser|readTwoStep|requireStation|getStationUser|stationOwner|readStationStep|readSetupLink)\s*\(/;

/** Actions meant for people who aren't signed in yet (each protects itself with its own link, code or rate limit). */
const PUBLIC_ACTIONS = new Set([
  "(public)/actions.ts:signUp",
  "(public)/actions.ts:resendConfirmation",
  "(public)/actions.ts:confirmEmail",
  "(public)/actions.ts:forgotPassword",
  "(public)/actions.ts:resetPassword",
  "(public)/actions.ts:acceptInvite",
  "login/actions.ts:login",
  // The Station's own sign-in (its rate limits and robot check), and signing out of it.
  "station/(auth)/actions.ts:stationLogin",
  "station/(auth)/actions.ts:stationSignOut",
  // A vendor typing prices from their bid's email — the signed link is the key to that one bid (bid-link.ts), plus a limit per address.
  "prices/actions.ts:submitBidPrices",
  // The website's "Request an invite" — robot check and a limit per address.
  "site/actions.ts:requestInvite",
]);

/** Download addresses that don't need their own check, and why. */
const PUBLIC_ROUTES = new Set([
  "api/pdfjs/[...path]/route.ts", // the plan viewer's own program files — nothing private
  "api/health/route.ts", // for the host: "up or not", nothing else
  "api/qbwc/route.ts", // the QuickBooks Web Connector: signs in with its own username and password (src/lib/qb/sync.ts)
  "api/company/logo/route.ts", // reads through the company gatekeeper, which refuses anyone not signed in
  "prices/[token]/file/route.ts", // a vendor's bid files: the signed link is the key to that one bid (bid-link.ts)
  "prices/[token]/plan/[fileId]/route.ts", // the plans sent with a sub's bid: the signed link, and only the files picked for that bid
]);

function files(dir: string, name: (f: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name), name) : name(e.name) ? [join(dir, e.name)] : [],
  );
}
const rel = (p: string) => relative(APP, p).split(sep).join("/");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

/** Each exported function in a "use server" file, with its code. */
function serverActions() {
  const out: { file: string; name: string; body: string }[] = [];
  for (const p of files(APP, (f) => /\.tsx?$/.test(f))) {
    const src = read(p);
    if (!/^\s*["']use server["']/.test(src)) continue;
    for (const part of src.split(/\nexport (?=async function |function |const )/).slice(1)) {
      const name = part.replace(/^(async function |function |const )/, "").split(/[\s(=<:]/)[0];
      out.push({ file: rel(p), name, body: part });
    }
  }
  return out;
}

test("every server action checks who is signed in", () => {
  const actions = serverActions();
  assert.ok(actions.length > 200, "found the actions");
  const guarded = new Set(actions.filter((a) => GUARD.test(a.body)).map((a) => `${a.file}:${a.name}`));
  const missing = actions.filter((a) => {
    const key = `${a.file}:${a.name}`;
    if (guarded.has(key) || PUBLIC_ACTIONS.has(key)) return false;
    // A thin wrapper that hands straight to a checked action in the same file is fine.
    return !actions.some((b) => b.file === a.file && guarded.has(`${b.file}:${b.name}`) && new RegExp(`\\b${b.name}\\(`).test(a.body));
  });
  assert.deepEqual(
    missing.map((a) => `${a.file}: ${a.name}`),
    [],
    "These actions need requireStaff() / requireAdmin() / requireClient() etc. at the top",
  );
});

/** The area (src/lib/access.ts) an action's folder belongs to, if any. */
const areaOf = (file: string) => areaForPath("/" + file.replace(/^\(app\)\//, "").replace("projects/[id]/", "projects/x/").replace(/\/[^/]*$/, ""));
const asksFor = (body: string, area: string) => new RegExp(`\\brequireEdit\\(\\s*"${area}"\\s*[,)]`).test(body);

test("Settings actions are for administrators — or a position allowed that part of Settings", () => {
  const loose = serverActions().filter((a) => {
    if (!a.file.startsWith("(app)/settings/") || /\brequireAdmin\s*\(/.test(a.body)) return false;
    const area = areaOf(a.file);
    return !(area && asksFor(a.body, area));
  });
  assert.deepEqual(loose.map((a) => `${a.file}: ${a.name}`), []);
});

test("a change in an area checks the position may edit that area", () => {
  // Positions: every action in a folder that belongs to an area asks for that area — a plain
  // "signed in" check would let a view-only (or hidden) position change it.
  const own = new Set(["(app)/todos/actions.ts"]); // everyone keeps their own to-dos (the action checks the rest)
  const loose = serverActions().filter((a) => {
    const area = areaOf(a.file);
    if (!area || own.has(a.file) || !GUARD.test(a.body)) return false;
    return !(asksFor(a.body, area) || /\brequireAdmin\s*\(/.test(a.body));
  });
  assert.deepEqual(loose.map((a) => `${a.file}: ${a.name}`), []);
});

test("every download address checks who is signed in", () => {
  const routes = files(APP, (f) => f === "route.ts").map((p) => ({ file: rel(p), body: read(p) }));
  const missing = routes.filter((r) => !PUBLIC_ROUTES.has(r.file) && r.file !== "logout/route.ts" && !GUARD.test(r.body));
  assert.deepEqual(missing.map((r) => r.file), []);
});

test("no redirect is built from the request's own address", () => {
  // Online the program sees requests at the host's internal address (localhost:10000);
  // a redirect built from it sends people somewhere their browser can't reach.
  const bad = files(APP, (f) => /\.tsx?$/.test(f)).filter((p) => /redirect\([^)]*new URL\([^)]*\b(req|request)\.url/.test(read(p)));
  assert.deepEqual(bad.map(rel), []);
});

test("links don't load pages in the background (use @/components/link)", () => {
  // Every page is built fresh per company: background loading ("prefetch") of each link on a
  // screen swamped the server and made real clicks wait. The program's own Link turns it off.
  const src = join(process.cwd(), "src");
  const bad = files(src, (f) => /\.tsx?$/.test(f) && f !== "link.tsx").filter((p) => /from "next\/link"/.test(read(p)));
  assert.deepEqual(bad.map((p) => relative(src, p).split(sep).join("/")), []);
});
