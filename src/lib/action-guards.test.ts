import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Every button that changes something runs a server action, and anyone can call a server
 * action directly — so each one must check who is signed in, and what they're allowed to do,
 * itself. These tests read the code and fail if a new action (or download link) forgets.
 */

const APP = join(process.cwd(), "src", "app");
const GUARD =
  /\b(requireUser|requireStaff|requireAdmin|requireReports|requireVendor|requireClient|requireTimeManager|getCurrentUser|setupUser|readTwoStep)\s*\(/;

/** Actions meant for people who aren't signed in yet (each protects itself with its own link, code or rate limit). */
const PUBLIC_ACTIONS = new Set([
  "(public)/actions.ts:signUp",
  "(public)/actions.ts:resendConfirmation",
  "(public)/actions.ts:confirmEmail",
  "(public)/actions.ts:forgotPassword",
  "(public)/actions.ts:resetPassword",
  "(public)/actions.ts:acceptInvite",
  "login/actions.ts:login",
]);

/** Download addresses that don't need their own check, and why. */
const PUBLIC_ROUTES = new Set([
  "api/pdfjs/[...path]/route.ts", // the plan viewer's own program files — nothing private
  "api/health/route.ts", // for the host: "up or not", nothing else
  "api/company/logo/route.ts", // reads through the company gatekeeper, which refuses anyone not signed in
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

test("Settings actions are for administrators only", () => {
  const loose = serverActions().filter((a) => a.file.startsWith("(app)/settings/") && !/\brequireAdmin\s*\(/.test(a.body));
  assert.deepEqual(loose.map((a) => `${a.file}: ${a.name}`), []);
});

test("every download address checks who is signed in", () => {
  const routes = files(APP, (f) => f === "route.ts").map((p) => ({ file: rel(p), body: read(p) }));
  const missing = routes.filter((r) => !PUBLIC_ROUTES.has(r.file) && r.file !== "logout/route.ts" && !GUARD.test(r.body));
  assert.deepEqual(missing.map((r) => r.file), []);
});
