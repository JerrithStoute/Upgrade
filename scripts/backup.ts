/**
 * Back up every company's database records and the uploads now:  npm run backup
 * (The server also does this on its own once a day.) The database must be running
 * (npm run dev, or npm run db:up).
 */
import { systemDb } from "../src/lib/db";
import { runBackup } from "../src/lib/backup";
import { runAsCompany } from "../src/lib/tenant";

async function main() {
  const companies = await systemDb.company.findMany({ select: { id: true, name: true } });
  for (const c of companies) {
    const s = await runAsCompany(c.id, () => runBackup());
    console.log(`${c.name}: backed up to ${s.dir}`);
    console.log(`  database: ${s.file} (${(s.bytes / 1024 / 1024).toFixed(1)} MB)`);
    console.log(`  uploads:  ${s.uploadsCopied} new file(s) copied`);
  }
}

main()
  .catch((err) => {
    console.error("Backup failed:", err);
    process.exitCode = 1;
  })
  .finally(() => systemDb.$disconnect());
