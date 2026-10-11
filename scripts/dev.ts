/**
 * `npm run dev`: starts the local database, then the app. Stopping the app (Ctrl+C or
 * closing the window) stops the database too.
 */
import { spawn } from "child_process";
import { startLocalDb } from "./local-db";

async function main() {
  process.stdout.write("Starting the database… ");
  const stopDb = await startLocalDb();
  console.log("ready.");
  // Next.js's own launcher, run with this same Node — no shell in between.
  const next = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", ...process.argv.slice(2)], { stdio: "inherit" });
  let stopping = false;
  const stop = async (code = 0) => {
    if (stopping) return;
    stopping = true;
    if (!next.killed) next.kill();
    await stopDb().catch(() => {});
    process.exit(code);
  };
  next.on("exit", (code) => void stop(code ?? 0));
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"] as const) process.on(sig, () => void stop(0));
}

main().catch((err) => {
  console.error("\nCouldn't start the database:", err);
  process.exit(1);
});
