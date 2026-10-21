import pg from "pg";
import { STATION_TABLES } from "./tenant-rules";

// Times are stored as UTC (that's what the app, through Prisma, reads and writes). The
// plain Postgres connector would otherwise read and write them in this computer's own
// time zone — hours off. So every direct connection works in UTC.
pg.types.setTypeParser(1114, (s: string) => new Date(s.replace(" ", "T") + "Z"));
// …and sends them as UTC: Postgres drops any time-zone offset on these columns, so a
// time sent as local clock time would be stored hours off.
pg.defaults.parseInputDatesAsUTC = true;

/** A direct Postgres connection (backups, copies, scripts) — always in UTC. */
export async function connectPg(url: string | undefined, ssl?: pg.ClientConfig["ssl"]) {
  const client = new pg.Client({ connectionString: url, ...(ssl ? { ssl } : {}) });
  await client.connect();
  await client.query("SET TIME ZONE 'UTC'");
  return client;
}

/**
 * Restoring a company's records from a source — its backup file, or an old one-company
 * SQLite database — in one go: it all goes in, or nothing changes. Tables the source
 * doesn't have are left empty (they're newer than it); columns it doesn't have get their
 * defaults. Other companies are never touched.
 */

export type Source = {
  name: string;
  tables: Set<string>;
  columns(table: string): string[];
  rows(table: string): Record<string, unknown>[];
};

// Where a stored file lives — older keys were saved on Windows with "\".
const FILE_KEY_COLUMNS = new Set(["storagePath", "logoPath", "coverPath"]);

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

export async function appTables(client: pg.Client | pg.PoolClient) {
  return (
    await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name NOT LIKE '\\_prisma%' ORDER BY table_name`,
    )
  ).rows.map((r) => r.table_name as string);
}

/**
 * The tables that hold a company's rows — every app table but The Builder Station's own (its people, its
 * log, what it keeps about each builder: tenant-rules.ts STATION_TABLES). Those are never part of a
 * company's backup, export or restore.
 */
export async function companyTables(client: pg.Client | pg.PoolClient) {
  return (await appTables(client)).filter((t) => !STATION_TABLES.includes(t));
}

function convert(type: string, column: string, v: unknown) {
  if (v === null || v === undefined) return null;
  if (type.startsWith("timestamp")) return new Date(typeof v === "number" || typeof v === "bigint" ? Number(v) : String(v));
  if (type === "boolean") return v === 1 || v === true || v === "1" || v === "true";
  if (FILE_KEY_COLUMNS.has(column) && typeof v === "string") return v.replace(/\\/g, "/");
  return typeof v === "bigint" ? Number(v) : v;
}

/**
 * Replaces one company's rows with the rows from a source (that company's backup, or an
 * old one-company database) — every other company is untouched. Rows go in tagged with
 * this company, whatever the source says. All of it goes in, or nothing changes.
 */
export async function replaceCompany(client: pg.Client | pg.PoolClient, companyId: string, source: Source) {
  const tables = await companyTables(client);
  const copied: Record<string, number> = {};
  await client.query("BEGIN");
  try {
    // Rows go back in any order: links are checked once, at the end (made possible by tenant-rules.ts).
    const fixed = await client.query(
      `SELECT 1 FROM pg_constraint con JOIN pg_namespace ns ON ns.oid = con.connamespace WHERE con.contype = 'f' AND ns.nspname = 'public' AND NOT con.condeferrable LIMIT 1`,
    );
    if (fixed.rowCount) throw new Error("The database rules are out of date — run `npm run db:rules`, then try again");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    await client.query("SET LOCAL app.restoring = 'on'");
    for (const t of tables) await client.query(`DELETE FROM ${q(t)} WHERE ${t === "Company" ? '"id"' : '"companyId"'} = $1`, [companyId]);
    for (const t of tables) {
      copied[t] = 0;
      if (!source.tables.has(t)) continue;
      const types = new Map(
        (await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`, [t])).rows.map(
          (r) => [r.column_name as string, r.data_type as string],
        ),
      );
      let rows = source.rows(t);
      if (t === "Company") rows = rows.slice(0, 1).map((r) => ({ ...r, id: companyId }));
      else if (types.has("companyId")) rows = rows.map((r) => ({ ...r, companyId }));
      const cols = [...new Set([...source.columns(t), ...(t === "Company" ? [] : ["companyId"])])].filter((c) => types.has(c));
      if (!cols.length) continue;
      const per = Math.max(1, Math.floor(20000 / cols.length));
      for (let i = 0; i < rows.length; i += per) {
        const values: unknown[] = [];
        const tuples = rows.slice(i, i + per).map((r) => `(${cols.map((c) => (values.push(convert(types.get(c)!, c, r[c])), `$${values.length}`)).join(", ")})`);
        await client.query(`INSERT INTO ${q(t)} (${cols.map(q).join(", ")}) VALUES ${tuples.join(", ")}`, values);
      }
      copied[t] = rows.length;
    }
    // Every link stays inside this company (what the per-row check does day to day).
    const links = (
      await client.query(
        `SELECT rel.relname AS tbl, att.attname AS col, ref.relname AS ref
         FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid JOIN pg_class ref ON ref.oid = con.confrelid
         JOIN pg_namespace ns ON ns.oid = rel.relnamespace JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
         WHERE con.contype = 'f' AND ns.nspname = 'public' AND array_length(con.conkey, 1) = 1 AND att.attname <> 'companyId'`,
      )
    ).rows as { tbl: string; col: string; ref: string }[];
    for (const l of links) {
      if (!tables.includes(l.tbl) || !tables.includes(l.ref) || l.tbl === "Company") continue;
      const refCol = l.ref === "Company" ? '"id"' : '"companyId"';
      const bad = await client.query(
        `SELECT 1 FROM ${q(l.tbl)} c JOIN ${q(l.ref)} p ON p."id" = c.${q(l.col)} WHERE c."companyId" = $1 AND p.${refCol} <> $1 LIMIT 1`,
        [companyId],
      );
      if (bad.rowCount) throw new Error(`${l.tbl} links to a ${l.ref} of another company — nothing was changed`);
    }
    // Lines are worked out again after this (lumber-state.ts): the restored dates can't be trusted.
    if (tables.includes("Project")) {
      const cols = (await client.query(`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Project' AND column_name = 'lumberSyncedAt'`)).rowCount;
      if (cols) await client.query(`UPDATE "Project" SET "lumberSyncedAt" = NULL WHERE "companyId" = $1`, [companyId]);
    }
    for (const t of tables) {
      const n = Number((await client.query(`SELECT count(*) n FROM ${q(t)} WHERE ${t === "Company" ? '"id"' : '"companyId"'} = $1`, [companyId])).rows[0].n);
      if (n !== copied[t]) throw new Error(`${t}: expected ${copied[t]} rows, found ${n}`);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }
  return copied;
}

/** An old SQLite database file (the program's database before Postgres) as a source. */
export async function sqliteSource(file: string): Promise<Source & { close(): void }> {
  const { DatabaseSync } = await import("node:sqlite");
  const lite = new DatabaseSync(file, { readOnly: true });
  const tables = new Set(
    (lite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((r) => r.name),
  );
  return {
    name: file,
    tables,
    columns: (t) => (lite.prepare(`PRAGMA table_info(${q(t)})`).all() as { name: string }[]).map((c) => c.name),
    rows: (t) => lite.prepare(`SELECT * FROM ${q(t)}`).all() as Record<string, unknown>[],
    close: () => lite.close(),
  };
}

/** A backup made by the program (see backup.ts): { tables: { name: rows[] } } as a source. */
export function jsonSource(name: string, data: { tables: Record<string, Record<string, unknown>[]> }): Source {
  const tables = new Set(Object.keys(data.tables));
  return {
    name,
    tables,
    columns: (t) => [...new Set(data.tables[t].flatMap((r) => Object.keys(r)))],
    rows: (t) => data.tables[t],
  };
}
