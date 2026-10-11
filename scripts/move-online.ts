/**
 * Moves every company on this PC — its records and its uploaded files — to the online
 * database and cloud storage. Run once, when going online (see GOING-ONLINE.md):
 *
 *   npm run go-online:copy            check everything, change nothing online
 *   npm run go-online:copy -- --go    copy
 *
 * Reads .env (this PC's database) and .env.online (never committed):
 *   ONLINE_DATABASE_URL   Render → the database → Connect → "External Database URL"
 *   S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY   (Cloudflare R2)
 *
 * The online database must already be set up (the first deploy does that). A company that's
 * already online is replaced only with --replace. Every file is checked after it's copied.
 * Two-step sign-in is turned off for the copied logins (its secrets can't move); each person
 * sets it up again the first time they sign in online.
 */
import path from "path";
import { promises as fs } from "fs";
import { connectPg, jsonSource, replaceCompany } from "../src/lib/db-copy";
import { dumpTables, storedFileKeys } from "../src/lib/backup";
import { cloud, cloudConfigured } from "../src/lib/cloud-storage";
import { normalizeKey } from "../src/lib/storage-key";

const args = new Set(process.argv.slice(2));
const GO = args.has("--go");
const REPLACE = args.has("--replace");

function uploadDir() {
  const configured = process.env.UPLOAD_DIR || "./uploads";
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

async function online() {
  const url = process.env.ONLINE_DATABASE_URL;
  if (!url) throw new Error("Put ONLINE_DATABASE_URL in .env.online (Render → database → Connect → External Database URL)");
  const host = new URL(url).hostname;
  const local = host === "localhost" || host === "127.0.0.1";
  return connectPg(url, local ? undefined : { rejectUnauthorized: !args.has("--trust-db-cert") });
}

async function main() {
  if (!cloudConfigured()) throw new Error("Put S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY in .env.online");
  const here = await connectPg(process.env.SYSTEM_DATABASE_URL);
  const there = await online();
  try {
    // 1. Same version of the program's tables on both.
    const steps = async (c: typeof here) =>
      (await c.query(`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY 1`)).rows.map((r) => r.migration_name as string).join(",");
    const [a, b] = await Promise.all([steps(here), steps(there).catch(() => "")]);
    if (!b) throw new Error("The online database isn't set up yet — deploy the program on Render first");
    if (a !== b) throw new Error("This PC and the online database are on different versions — deploy the latest version first");
    const notReady = await there.query(
      `SELECT 1 FROM pg_constraint con JOIN pg_namespace ns ON ns.oid = con.connamespace WHERE con.contype = 'f' AND ns.nspname = 'public' AND NOT con.condeferrable LIMIT 1`,
    );
    if (notReady.rowCount) throw new Error("The online database rules aren't set — the deploy's setup step didn't finish");
    console.log("✓ Online database is set up and on the same version");

    // 2. Each company: records, then files.
    const companies = (await here.query(`SELECT "id", "name" FROM "Company" ORDER BY "createdAt"`)).rows as { id: string; name: string }[];
    for (const co of companies) {
      console.log(`\n${co.name}`);
      const exists = (await there.query(`SELECT 1 FROM "Company" WHERE "id" = $1`, [co.id])).rowCount;
      if (exists && !REPLACE) {
        console.log("  already online — skipped (add --replace to overwrite it with this PC's copy)");
        continue;
      }
      const tables = await dumpTables(co.id);
      // Authenticator-app secrets are locked with this PC's ENCRYPTION_KEY, not the online one:
      // those people set two-step up again when they first sign in online.
      const twoStep = (tables.User ?? []).filter((u) => u.totpEnabledAt || u.totpSecret);
      for (const u of twoStep) Object.assign(u, { totpSecret: null, totpEnabledAt: null, backupCodes: null });
      if (twoStep.length) console.log(`  two-step sign-in will need setting up again online for: ${twoStep.map((u) => u.email).join(", ")}`);
      const rows = Object.values(tables).reduce((n, t) => n + t.length, 0);
      const keys = storedFileKeys(tables);
      console.log(`  ${rows.toLocaleString()} records, ${keys.length} files`);

      // Every file must be on this PC before anything is copied.
      const files: { key: string; size: number }[] = [];
      for (const raw of keys) {
        const key = normalizeKey(raw);
        const st = await fs.stat(path.join(uploadDir(), key)).catch(() => null);
        if (!st?.isFile()) throw new Error(`File missing on this PC: ${key} — nothing was copied`);
        files.push({ key, size: st.size });
      }
      if (!GO) {
        console.log("  ready (nothing copied — run again with --go)");
        continue;
      }

      let sent = 0;
      for (const f of files) {
        if ((await cloud.size(f.key)) === f.size) continue;
        await cloud.put(f.key, await fs.readFile(path.join(uploadDir(), f.key)), "application/octet-stream");
        if ((await cloud.size(f.key)) !== f.size) throw new Error(`${f.key} didn't arrive whole — run again`);
        sent++;
      }
      console.log(`  ✓ files: ${sent} copied, ${files.length - sent} already there, all ${files.length} checked`);

      const copied = await replaceCompany(there, co.id, jsonSource(co.name, { tables }));
      const total = Object.values(copied).reduce((n, x) => n + x, 0);
      if (total !== rows) throw new Error(`Expected ${rows} records online, found ${total}`);
      console.log(`  ✓ records: all ${total.toLocaleString()} copied and counted`);
    }
    if (!GO) console.log("\nEverything checks out. Run `npm run go-online:copy -- --go` to copy.");
  } finally {
    await Promise.all([here.end(), there.end()]);
  }
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exitCode = 1;
});
