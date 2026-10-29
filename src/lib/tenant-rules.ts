import type pg from "pg";

/**
 * The database's own company lock — on top of the program's gatekeeper (db.ts), so a
 * mistake in the program still can't show or link one company's rows to another's.
 *
 * - The app signs in to the database as its own login (DATABASE_URL). For that login,
 *   every table only has the rows of the company the request is for (Row-Level
 *   Security, keyed on app.company_id, which db.ts sets for each query).
 * - The system login (SYSTEM_DATABASE_URL — the tables' owner) isn't limited: sign-in,
 *   backups, migrations.
 * - Every link between rows (a time entry → its job, a bill → its vendor…) must stay
 *   inside one company: the database refuses anything else, however it was written.
 * - Links are checked when a change is saved, so a restore (db-copy.ts) can put a
 *   company's rows back in any order as the tables' owner — no database superuser needed
 *   (the online database doesn't give one).
 *
 * Safe to run again any time (it replaces what it made before): run after every
 * database change — `npm run db:rules` (db:migrate and db:deploy do it for you).
 */

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Tables of The Builder Station itself (its people and log, and the claims and sign-in limits every copy of the app shares) — no company's, and closed to the app's login. */
export const STATION_TABLES = ["StationUser", "StationLog", "StationBuilder", "JobLock", "RateLimit", "StationProblem", "StationError"];

export type RulesReport ={ appRole: string | null; tables: number; links: number; note?: string };

export async function applyTenantRules(system: pg.Client, appUrl: string | undefined): Promise<RulesReport> {
  const app = appUrl ? new URL(appUrl) : null;
  const appRole = app ? decodeURIComponent(app.username) : null;
  const me = (await system.query("SELECT current_user AS u")).rows[0].u as string;

  const tables = (
    await system.query(
      `SELECT c.table_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
       WHERE c.table_schema = 'public' AND c.column_name = 'companyId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
    )
  ).rows.map((r) => r.table_name as string);

  // Single-column links between app tables (not the company tag itself).
  const fks = (
    await system.query(
      `SELECT rel.relname AS tbl, att.attname AS col, ref.relname AS ref
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_class ref ON ref.oid = con.confrelid
       JOIN pg_namespace ns ON ns.oid = rel.relnamespace
       JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
       WHERE con.contype = 'f' AND ns.nspname = 'public' AND array_length(con.conkey, 1) = 1 AND att.attname <> 'companyId'`,
    )
  ).rows as { tbl: string; col: string; ref: string }[];

  await system.query("BEGIN");
  try {
    // 1. The company tag points at a real company (and goes with it if a company is removed).
    for (const t of tables) {
      const name = `${t}_companyId_company_fkey`.slice(0, 63);
      const has = await system.query("SELECT 1 FROM pg_constraint WHERE conname = $1", [name]);
      if (!has.rowCount) await system.query(`ALTER TABLE ${q(t)} ADD CONSTRAINT ${q(name)} FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE`);
    }

    // 2. Links stay inside one company.
    let links = 0;
    for (const t of tables) {
      const mine = fks.filter((f) => f.tbl === t && (tables.includes(f.ref) || f.ref === "Company"));
      const fn = q(`tenant_links_${t}`.slice(0, 63));
      await system.query(`DROP TRIGGER IF EXISTS tenant_links ON ${q(t)}`);
      if (!mine.length) {
        await system.query(`DROP FUNCTION IF EXISTS ${fn}()`);
        continue;
      }
      const checks = mine
        .map((f) => {
          const col = `NEW.${q(f.col)}`;
          const changed = `(TG_OP = 'INSERT' OR ${col} IS DISTINCT FROM OLD.${q(f.col)} OR NEW."companyId" IS DISTINCT FROM OLD."companyId")`;
          const sameCompany =
            f.ref === "Company" ? `${col} = NEW."companyId"` : `EXISTS (SELECT 1 FROM ${q(f.ref)} p WHERE p."id" = ${col} AND p."companyId" = NEW."companyId")`;
          return `  IF ${col} IS NOT NULL AND ${changed} AND NOT ${sameCompany} THEN
    RAISE EXCEPTION 'Not found: % links to a % that belongs to another company', TG_TABLE_NAME, ${lit(f.ref)} USING ERRCODE = 'P0404';
  END IF;`;
        })
        .join("\n");
      // A restore by the owner checks its links once, at the end (see db-copy.ts).
      await system.query(`CREATE OR REPLACE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('app.restoring', true) = 'on' AND session_user = ${lit(me)} THEN
    RETURN NEW;
  END IF;
${checks}
  RETURN NEW;
END $$`);
      await system.query(`CREATE TRIGGER tenant_links BEFORE INSERT OR UPDATE ON ${q(t)} FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
      links += mine.length;
    }

    // 3. Every link can wait to be checked until a change is saved (a restore puts rows back in any order).
    const fixed = (
      await system.query(
        `SELECT rel.relname AS tbl, con.conname AS name FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid JOIN pg_namespace ns ON ns.oid = rel.relnamespace
         WHERE con.contype = 'f' AND ns.nspname = 'public' AND NOT con.condeferrable`,
      )
    ).rows as { tbl: string; name: string }[];
    for (const f of fixed) await system.query(`ALTER TABLE ${q(f.tbl)} ALTER CONSTRAINT ${q(f.name)} DEFERRABLE INITIALLY IMMEDIATE`);

    // 4. The app's own login: only the current company's rows.
    let note: string | undefined;
    if (!appRole || appRole === me) {
      note = "DATABASE_URL uses the system login — Row-Level Security needs a separate app login (set DATABASE_URL to it).";
    } else {
      const exists = await system.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [appRole]);
      const password = decodeURIComponent(app!.password);
      if (!exists.rowCount) await system.query(`CREATE ROLE ${q(appRole)} LOGIN PASSWORD ${lit(password)} NOSUPERUSER NOBYPASSRLS`);
      else await system.query(`ALTER ROLE ${q(appRole)} WITH LOGIN PASSWORD ${lit(password)}`); // a changed password takes effect
      await system.query(`GRANT USAGE ON SCHEMA public TO ${q(appRole)}`);
      await system.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${q(appRole)}`);
      await system.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${q(appRole)}`);
      await system.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${q(appRole)}`);
      // The Builder Station's own tables (its people, its log) belong to no company: the app's login
      // can't touch them at all — only the Station's pages, through the system login.
      for (const t of STATION_TABLES) {
        const has = await system.query("SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1", [t]);
        if (has.rowCount) await system.query(`REVOKE ALL ON ${q(t)} FROM ${q(appRole)}`);
      }
      for (const t of [...tables, "Company"]) {
        const col = t === "Company" ? `"id"` : `"companyId"`;
        await system.query(`ALTER TABLE ${q(t)} ENABLE ROW LEVEL SECURITY`);
        await system.query(`DROP POLICY IF EXISTS company_only ON ${q(t)}`);
        await system.query(
          `CREATE POLICY company_only ON ${q(t)} TO ${q(appRole)} USING (${col} = current_setting('app.company_id', true)) WITH CHECK (${col} = current_setting('app.company_id', true))`,
        );
      }
    }
    await system.query("COMMIT");
    return { appRole: note ? null : appRole, tables: tables.length + 1, links, note };
  } catch (err) {
    await system.query("ROLLBACK").catch(() => {});
    throw err;
  }
}
