/** `npm run db:up`: just the local database (for scripts and `npm run db:studio`). Ctrl+C stops it. */
import { startLocalDb, LOCAL_URL } from "./local-db";

startLocalDb()
  .then((stop) => {
    console.log(`Database running at ${LOCAL_URL.replace(/:[^:@/]+@/, ":•••@")} — Ctrl+C to stop.`);
    const quit = () => void stop().then(() => process.exit(0));
    process.on("SIGINT", quit);
    process.on("SIGTERM", quit);
    setInterval(() => {}, 1 << 30);
  })
  .catch((err) => {
    console.error("Couldn't start the database:", err);
    process.exit(1);
  });
