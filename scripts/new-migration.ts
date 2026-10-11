/**
 * `npm run db:migration -- <short-name>`: after changing prisma/schema.prisma, writes
 * the change as a new migration (prisma/migrations/<time>_<name>/migration.sql), applies
 * it, and re-applies the company lock. The online database gets the same files with
 * `npm run db:deploy` — never a reset, never a guess.
 *
 * (Why not `prisma migrate dev`: the company lock adds rules Prisma doesn't know about,
 * and migrate dev would offer to wipe the database over them.)
 */
import { execFileSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import pg from "pg";
import { applyTenantRules } from "../src/lib/tenant-rules";

const run = (args: string[], env: NodeJS.ProcessEnv = process.env) => execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), ...args], { env, encoding: "utf8" });

async function main() {
  const name = (process.argv[2] ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (!name) throw new Error('Give the change a short name: npm run db:migration -- add-time-clock');
  const system = process.env.SYSTEM_DATABASE_URL;
  if (!system) throw new Error("SYSTEM_DATABASE_URL isn't set");

  // A scratch database Prisma replays the old migrations into, to see what changed.
  const shadowUrl = new URL(system);
  const shadowName = `${shadowUrl.pathname.slice(1)}_shadow`;
  shadowUrl.pathname = `/${shadowName}`;
  const admin = new pg.Client({ connectionString: system });
  await admin.connect();
  if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [shadowName])).rowCount) await admin.query(`CREATE DATABASE "${shadowName}"`);
  await admin.end();

  const sql = run([
    "migrate",
    "diff",
    "--from-migrations",
    "prisma/migrations",
    "--to-schema-datamodel",
    "prisma/schema.prisma",
    "--shadow-database-url",
    shadowUrl.toString(),
    "--script",
  ]);
  if (!sql.trim() || /^-- This is an empty migration\.\s*$/.test(sql.trim())) {
    console.log("No changes in schema.prisma since the last migration.");
    return;
  }
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const dir = path.join("prisma", "migrations", `${stamp}_${name}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "migration.sql"), sql);
  console.log(`Wrote ${dir}/migration.sql:\n\n${sql}`);
  console.log(run(["migrate", "deploy"]));
  try {
    run(["generate"]);
  } catch {
    console.log("(The app is running and holds the database engine file — restart it to pick up the change.)");
  }
  // The company lock covers the new or changed tables too.
  const client = new pg.Client({ connectionString: system });
  await client.connect();
  try {
    const r = await applyTenantRules(client, process.env.DATABASE_URL);
    console.log(`Company lock re-applied: ${r.tables} tables, ${r.links} links checked.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Couldn't make the migration:", err instanceof Error ? err.message : err);
  process.exit(1);
});
