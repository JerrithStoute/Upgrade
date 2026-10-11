/**
 * Runs a command (npm start, npm run db:deploy…) with the online database settings filled in.
 *
 * Render gives one database address, for the tables' owner: SYSTEM_DATABASE_URL. The app
 * itself signs in as its own, limited login ("app_user", with APP_DB_PASSWORD) — so the
 * database only ever shows it one company at a time. This builds that second address
 * (DATABASE_URL) from the first, unless it's already set.
 *
 *   node scripts/online.mjs npm start
 */
import { spawn } from "node:child_process";

const env = { ...process.env };
if (!env.DATABASE_URL && env.SYSTEM_DATABASE_URL && env.APP_DB_PASSWORD) {
  const url = new URL(env.SYSTEM_DATABASE_URL);
  url.username = env.APP_DB_USER || "app_user";
  url.password = env.APP_DB_PASSWORD;
  env.DATABASE_URL = url.toString();
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("Usage: node scripts/online.mjs <command> [args…]");
  process.exit(2);
}
const child = spawn(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code, signal) => (signal ? process.kill(process.pid, signal) : process.exit(code ?? 1)));
