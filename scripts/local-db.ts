/**
 * The database on this PC: a real Postgres (the same kind the online version uses) that
 * runs from the project folder — nothing to install in Windows. Its data lives in
 * ./.pgdata. `npm run dev` starts it for you; `npm run db:up` starts just the database.
 */
import net from "net";
import path from "path";
import { existsSync } from "fs";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

export const LOCAL = {
  user: "builder",
  password: "local",
  port: 5433,
  database: "builderstation",
  dir: path.join(process.cwd(), ".pgdata"),
};
export const LOCAL_URL = `postgresql://${LOCAL.user}:${LOCAL.password}@localhost:${LOCAL.port}/${LOCAL.database}`;

function portOpen(port: number) {
  return new Promise<boolean>((resolve) => {
    const s = net.connect(port, "127.0.0.1");
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("error", () => resolve(false));
  });
}

/** Starts the local database (unless it's already running). Returns a stop function (a no-op if it was already up). */
export async function startLocalDb(): Promise<() => Promise<void>> {
  if (await portOpen(LOCAL.port)) return async () => {};
  const fresh = !existsSync(path.join(LOCAL.dir, "PG_VERSION"));
  const pgServer = new EmbeddedPostgres({ databaseDir: LOCAL.dir, user: LOCAL.user, password: LOCAL.password, port: LOCAL.port, persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"], onLog: () => {} });
  if (fresh) await pgServer.initialise();
  await pgServer.start();
  // The app's database, made the first time.
  const admin = new pg.Client({ connectionString: `postgresql://${LOCAL.user}:${LOCAL.password}@localhost:${LOCAL.port}/postgres` });
  await admin.connect();
  const has = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [LOCAL.database]);
  if (!has.rowCount) await admin.query(`CREATE DATABASE "${LOCAL.database}" ENCODING 'UTF8' TEMPLATE template0`);
  // Times are kept in UTC, like the online database (the app expects it).
  await admin.query(`ALTER DATABASE "${LOCAL.database}" SET timezone TO 'UTC'`);
  await admin.end();
  return () => pgServer.stop();
}
