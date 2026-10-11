/**
 * `npm run db:rules`: (re)applies the database's company lock — see src/lib/tenant-rules.ts.
 * Runs as the system login (SYSTEM_DATABASE_URL); the app's login comes from DATABASE_URL.
 */
import pg from "pg";
import { applyTenantRules } from "../src/lib/tenant-rules";

async function main() {
  const systemUrl = process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!systemUrl) throw new Error("Set SYSTEM_DATABASE_URL (the tables' owner) and DATABASE_URL (the app's login)");
  const client = new pg.Client({ connectionString: systemUrl });
  await client.connect();
  try {
    const r = await applyTenantRules(client, process.env.DATABASE_URL);
    console.log(`Company lock applied: ${r.tables} tables, ${r.links} links checked${r.appRole ? `, app login "${r.appRole}" limited to one company at a time` : ""}.`);
    if (r.note) console.warn(`Note: ${r.note}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Couldn't apply the company lock:", err instanceof Error ? err.message : err);
  process.exit(1);
});
