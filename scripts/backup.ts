/**
 * Back up the database and uploads now:  npm run backup
 * (The server also does this on its own once a day.)
 */
import { PrismaClient } from "@prisma/client";
import { runBackup } from "../src/lib/backup";

const db = new PrismaClient();

runBackup(db)
  .then((s) => {
    console.log(`Backed up to ${s.dir}`);
    console.log(`  database: ${s.file} (${(s.bytes / 1024 / 1024).toFixed(1)} MB)`);
    console.log(`  uploads:  ${s.uploadsCopied} new file(s) copied`);
  })
  .catch((err) => {
    console.error("Backup failed:", err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
