/**
 * `npm run test:isolation` — break-in test for company separation.
 *
 * Makes a throwaway company with its own login and data, then tries to reach another
 * company's records from it every way it can — and the other way around:
 *   1. Through the program's database layer: every kind of record (all tables) — read
 *      by id, count, update, delete, and link to another company's rows.
 *   2. Through the running app (it must be running: npm run dev): signed in as the
 *      throwaway company, every page / file / download / printout of the other company's
 *      records by its address — each must come back "not found", with none of its data.
 * Then deletes the throwaway company and everything it made. Exits non-zero on any leak.
 *
 *   npm run test:isolation              tests against the first company in the database
 *   APP_URL=http://localhost:3001 …     a different running app
 */
import { randomUUID } from "crypto";
import { SignJWT } from "jose";
import { Prisma } from "@prisma/client";
import { db, systemDb } from "../src/lib/db";
import { runAsCompany } from "../src/lib/tenant";
import { getSessionSecret } from "../src/lib/session-secret";

const APP = process.env.APP_URL ?? "http://localhost:3000";
// The sign-in cookie's name: "__Host-bs_session" when testing a production build.
const COOKIE = process.env.SESSION_COOKIE_NAME ?? "upgrade_session";
const failures: string[] = [];
const fail = (msg: string) => (failures.push(msg), console.log(`  ✗ ${msg}`));
let checks = 0;
const ok = () => void checks++;

type AnyDelegate = {
  findMany(a: unknown): Promise<{ id: string }[]>;
  findFirst(a: unknown): Promise<unknown>;
  count(a?: unknown): Promise<number>;
  updateMany(a: unknown): Promise<{ count: number }>;
  deleteMany(a: unknown): Promise<{ count: number }>;
};
const lower = (m: string) => m[0].toLowerCase() + m.slice(1);
const delegate = (client: unknown, model: string) => (client as Record<string, AnyDelegate>)[lower(model)];

async function token(userId: string) {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(getSessionSecret()));
}

async function main() {
  const victim = await systemDb.company.findFirst({ orderBy: { createdAt: "asc" } });
  if (!victim) throw new Error("No company to test against");
  console.log(`Testing separation around "${victim.name}"…`);

  // --- The throwaway company, with a login and a little data ------------------------
  const tag = randomUUID().slice(0, 8);
  const intruder = await systemDb.company.create({ data: { name: `Break-in Test ${tag}` } });
  try {
    const [vProject, vUser] = await Promise.all([
      systemDb.project.findFirst({ where: { companyId: victim.id } }),
      systemDb.user.findFirst({ where: { companyId: victim.id, role: "ADMIN" } }),
    ]);
    if (!vProject || !vUser) throw new Error(`"${victim.name}" needs a project and an admin to test with`);
    const mine = await runAsCompany(intruder.id, async () => {
      const user = await db.user.create({ data: { email: `break-in-${tag}@example.invalid`, name: "Break-in Tester", passwordHash: "x", role: "ADMIN" } });
      const client = await db.client.create({ data: { firstName: "Test", lastName: `Client ${tag}` } });
      // Same project number and cost code as the other company: numbering is per company.
      const project = await db.project.create({ data: { number: vProject.number, name: `Intruder job ${tag}`, clientId: client.id } });
      const code = await db.costCode.create({ data: { code: `TEST-${tag}`, name: "Test code", division: "Test" } });
      await db.todo.create({ data: { title: `Intruder to-do ${tag}`, projectId: project.id } });
      return { user, client, project, code };
    });
    console.log(`  made "${intruder.name}" with its own project #${mine.project.number} (same number as theirs — fine, numbering is per company)`);

    // --- 1. The database layer, every kind of record -------------------------------
    console.log("1. Every kind of record, through the program's database layer…");
    const models = Prisma.dmmf.datamodel.models.map((m) => m.name);
    for (const model of models) {
      const theirIds = (await delegate(systemDb, model).findMany({ where: model === "Company" ? { id: victim.id } : { companyId: victim.id }, select: { id: true }, take: 200 })).map(
        (r) => r.id,
      );
      const myCount = await delegate(systemDb, model).count({ where: model === "Company" ? { id: intruder.id } : { companyId: intruder.id } });
      await runAsCompany(intruder.id, async () => {
        const d = delegate(db, model);
        const seen = theirIds.length ? (await d.findMany({ where: { id: { in: theirIds } }, select: { id: true } })).filter((r) => theirIds.includes(r.id)) : [];
        if (seen.length) fail(`${model}: saw ${seen.length} of the other company's rows`);
        else ok();
        const n = await d.count();
        if (n !== myCount) fail(`${model}: counted ${n}, its own are ${myCount}`);
        else ok();
        if (theirIds.length && model !== "Company") {
          const upd = await d.updateMany({ where: { id: { in: theirIds } }, data: {} }).catch(() => ({ count: 0 }));
          if (upd.count) fail(`${model}: changed ${upd.count} of the other company's rows`);
          else ok();
        }
      });
    }
    // Deleting: aim at a row made just for this, in the other company.
    const bait = await runAsCompany(victim.id, () => db.todo.create({ data: { title: `Isolation bait ${tag}` } }));
    const gone = await runAsCompany(intruder.id, () => db.todo.deleteMany({ where: { id: bait.id } }));
    if (gone.count || !(await systemDb.todo.findUnique({ where: { id: bait.id } }))) fail("Todo: deleted the other company's row");
    else ok();
    const baitByUnique = await runAsCompany(intruder.id, () => db.todo.findUnique({ where: { id: bait.id } }));
    if (baitByUnique) fail("Todo: findUnique by id reached the other company's row");
    else ok();
    await systemDb.todo.delete({ where: { id: bait.id } });
    // Linking to the other company's records.
    for (const [what, attempt] of [
      ["to-do on their job", () => db.todo.create({ data: { title: "x", projectId: vProject.id } })],
      ["time entry on their job", () => db.timeEntry.create({ data: { userId: mine.user.id, projectId: vProject.id, clockIn: new Date() } })],
      ["their admin on my job", () => db.project.update({ where: { id: mine.project.id }, data: { managerId: vUser.id } })],
    ] as [string, () => PromiseLike<unknown>][]) {
      const linked = await runAsCompany(intruder.id, attempt)
        .then(() => true)
        .catch(() => false);
      if (linked) fail(`linked a ${what}`);
      else ok();
    }
    // Their settings, as seen from my company.
    const myCompany = await runAsCompany(intruder.id, () => db.company.findFirst());
    if (myCompany?.id !== intruder.id) fail("Company: the company record wasn't my own");
    else ok();

    // --- 2. The running app, signed in as the throwaway company -------------------
    console.log(`2. Their pages, files and downloads through the running app (${APP})…`);
    const alive = await fetch(`${APP}/login`).then((r) => r.ok).catch(() => false);
    if (!alive) {
      fail(`the app isn't running at ${APP} — start it (npm run dev) and run this again`);
    } else {
      const cookie = `${COOKIE}=${await token(mine.user.id)}`;
      const get = (path: string) => fetch(`${APP}${path}`, { headers: { cookie }, redirect: "manual" });
      // Words that only appear in the other company's data.
      const markers = [victim.name, ...(await systemDb.project.findMany({ where: { companyId: victim.id }, select: { name: true } })).map((p) => p.name)]
        .flatMap((s) => [s, s.replace(/&/g, "&amp;")])
        .filter((s) => s.length >= 5);
      const leaks = (body: string) => markers.filter((m) => body.includes(m));

      const v = victim.id;
      const ids = async (model: string, extra: object = {}) =>
        (await delegate(systemDb, model).findMany({ where: { companyId: v, ...extra }, select: { id: true }, take: 3 })).map((r) => r.id);
      const projects = await systemDb.project.findMany({ where: { companyId: v }, select: { id: true }, take: 3 });
      const urls: string[] = [];
      const tabs = ["", "/plans", "/materials", "/takeoff", "/estimate", "/selections", "/change-orders", "/schedule", "/spec", "/purchasing", "/budget", "/invoices", "/daily-logs", "/todos", "/files", "/messages", "/edit"];
      for (const p of projects) for (const t of tabs) urls.push(`/projects/${p.id}${t}`);
      const p0 = projects[0]?.id ?? "x";
      const each = async (model: string, path: (id: string, project: string) => string, select: Record<string, true> = {}) => {
        for (const r of (await delegate(systemDb, model).findMany({ where: { companyId: v }, select: { id: true, ...select }, take: 3 })) as Record<string, string>[])
          urls.push(path(r.id, r.projectId ?? p0));
      };
      await each("Bid", (id, p) => `/projects/${p}/bids/${id}`, { projectId: true });
      await each("Bid", (id, p) => `/projects/${p}/bids/${id}/print`, { projectId: true });
      await each("Bid", (id, p) => `/projects/${p}/bids/${id}/excel`, { projectId: true });
      await each("ChangeOrder", (id, p) => `/projects/${p}/change-orders/${id}`, { projectId: true });
      await each("ChangeOrder", (id, p) => `/projects/${p}/change-orders/${id}/print`, { projectId: true });
      await each("DailyLog", (id, p) => `/projects/${p}/daily-logs/${id}/edit`, { projectId: true });
      await each("Estimate", (id, p) => `/projects/${p}/estimate/${id}/proposal`, { projectId: true });
      await each("Invoice", (id, p) => `/projects/${p}/invoices/${id}`, { projectId: true });
      await each("Invoice", (id, p) => `/projects/${p}/invoices/${id}/print`, { projectId: true });
      await each("VendorBill", (id, p) => `/projects/${p}/purchasing/bills/${id}`, { projectId: true });
      await each("PurchaseOrder", (id, p) => `/projects/${p}/purchasing/po/${id}`, { projectId: true });
      await each("PurchaseOrder", (id, p) => `/projects/${p}/purchasing/po/${id}/print`, { projectId: true });
      await each("Selection", (id, p) => `/projects/${p}/selections/${id}`, { projectId: true });
      await each("TakeoffPlan", (id, p) => `/projects/${p}/takeoff/${id}`, { projectId: true });
      await each("TakeoffPlan", (id, p) => `/projects/${p}/takeoff/${id}/print`, { projectId: true });
      for (const id of await ids("FileAsset")) urls.push(`/api/files/${id}`, `/api/files/${id}?download=1`);
      for (const id of await ids("VendorInsurance")) urls.push(`/api/vendor-files/${id}`);
      for (const p of projects) urls.push(`/api/projects/${p.id}/cover`, `/projects/${p.id}/takeoff/materials/csv`);
      for (const id of await ids("Client")) urls.push(`/clients/${id}`);
      for (const id of await ids("Vendor")) urls.push(`/settings/vendors/${id}`);
      for (const id of await ids("Lead")) urls.push(`/leads/${id}`);
      for (const id of await ids("User")) urls.push(`/settings/team?edit=${id}`);
      urls.push("/api/company/logo", "/time/sheets/export");
      // And my own lists and pages: none of their data may show anywhere.
      urls.push("/dashboard", "/projects", "/projects?q=a", "/clients", "/clients?q=a", "/leads", "/spec", "/schedule", "/schedule/calendar", "/todos", "/time", "/time/sheets");
      urls.push("/invoices", "/bills", "/inventory", "/reports", "/settings", "/settings/team", "/settings/cost-codes", "/settings/items", "/settings/vendors");
      urls.push(`/projects/${mine.project.id}`, `/projects/${mine.project.id}/estimate`, `/projects/${mine.project.id}/budget`);

      for (const url of urls) {
        const r = await get(url);
        const body = r.status >= 300 && r.status < 400 ? "" : await r.text();
        const found = leaks(body);
        const theirs = !url.startsWith("/dashboard") && !url.startsWith(`/projects/${mine.project.id}`) && !/^\/(projects|clients|leads|spec|schedule|todos|time|invoices|bills|inventory|reports|settings)(\?|$|\/(team|cost-codes|items|vendors)$)/.test(url) && url !== "/settings/team" && url !== "/time/sheets/export" && !url.startsWith("/schedule/") && !url.startsWith("/time/");
        if (found.length) fail(`${url}: shows their data (${found.slice(0, 2).join(", ")})`);
        else if (theirs && url.startsWith("/api/") && r.status === 200) fail(`${url}: served their file`);
        else if (r.status >= 500) fail(`${url}: server error ${r.status}`);
        else ok();
      }
      console.log(`   ${urls.length} addresses tried`);

      // --- 3. The other way: their login can't see my throwaway company's data ---------
      console.log("3. The other way around…");
      const theirCookie = `${COOKIE}=${await token(vUser.id)}`;
      for (const url of [`/projects/${mine.project.id}`, `/projects/${mine.project.id}/budget`, `/clients/${mine.client.id}`, "/projects", "/settings/cost-codes"]) {
        const r = await fetch(`${APP}${url}`, { headers: { cookie: theirCookie }, redirect: "manual" });
        const body = r.status >= 300 && r.status < 400 ? "" : await r.text();
        if (body.includes(`Intruder job ${tag}`) || body.includes(`Client ${tag}`) || body.includes(`TEST-${tag}`)) fail(`${url}: "${victim.name}" saw the throwaway company's data`);
        else ok();
      }
    }
  } finally {
    // --- Clean up: the throwaway company and everything it made -------------------
    await systemDb.company.delete({ where: { id: intruder.id } });
    const left = await systemDb.user.count({ where: { companyId: intruder.id } });
    if (left) fail("cleanup left rows behind");
  }

  console.log(failures.length ? `\nFAILED: ${failures.length} problem(s) in ${checks + failures.length} checks.` : `\nPassed: ${checks} checks, nothing reached the other company.`);
  if (failures.length) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("Test couldn't run:", err);
    process.exitCode = 1;
  })
  .finally(() => systemDb.$disconnect());
