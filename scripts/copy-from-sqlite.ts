/**
 * Copies everything from an old SQLite database file (prisma/dev.db, or an old backup —
 * from before companies were separated) into the Postgres database as that file's
 * company, then checks every table's count matches. Other companies are untouched.
 *
 *   npm run db:copy-from-sqlite                     copies prisma/dev.db
 *   npm run db:copy-from-sqlite -- path\to\file.db  copies another file (an old backup)
 *
 * The Postgres tables must exist first (npm run db:deploy). That company's records are
 * replaced, so it asks for --yes when it already has data. All of it goes in, or nothing changes.
 */
import path from "path";
import { connectPg, replaceCompany, sqliteSource } from "../src/lib/db-copy";
import { LOCAL_URL, startLocalDb } from "./local-db";

async function main() {
  const args = process.argv.slice(2);
  const file = path.resolve(args.find((a) => !a.startsWith("--")) ?? path.join("prisma", "dev.db"));
  const url = process.env.SYSTEM_DATABASE_URL ?? (process.env.DATABASE_URL?.startsWith("postgres") ? process.env.DATABASE_URL : LOCAL_URL);
  const stopDb = url === LOCAL_URL ? await startLocalDb() : async () => {};
  const client = await connectPg(url);
  const source = await sqliteSource(file);
  try {
    const company = source.rows("Company")[0] as { id?: string; name?: string } | undefined;
    if (!company?.id) throw new Error("That file has no company in it");
    const existing = Number((await client.query(`SELECT count(*) n FROM "Project" WHERE "companyId" = $1`, [company.id])).rows[0].n);
    if (existing && !args.includes("--yes")) throw new Error(`"${company.name}" already has records here. Run again with --yes to replace them with ${path.basename(file)}.`);
    console.log(`Copying ${path.basename(file)} → Postgres, as "${company.name}"…`);
    const copied = await replaceCompany(client, company.id, source);
    const skipped = [...source.tables].filter((t) => !(t in copied));
    if (skipped.length) console.log(`  (not copied — no longer used: ${skipped.join(", ")})`);
    const total = Object.values(copied).reduce((a, b) => a + b, 0);
    console.log(`Done: ${total} rows in ${Object.values(copied).filter(Boolean).length} tables — every count matches.`);
  } finally {
    source.close();
    await client.end();
    await stopDb();
  }
}

main().catch((err) => {
  console.error("Copy failed — nothing was changed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
