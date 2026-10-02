import path from "path";
import { promises as fs } from "fs";
import type { PrismaClient } from "@prisma/client";

/**
 * Backups of the whole system of record: the SQLite database and the uploads
 * folder (plans, photos, documents). Used by `npm run backup` and by the nightly
 * backup the server runs on its own (see src/instrumentation.ts).
 *
 * BACKUP_DIR   where backups go (default ./backups). Point it at another drive or a
 *              synced cloud folder (OneDrive, Dropbox…) so a dead disk doesn't take both.
 * BACKUP_KEEP  how many database backups to keep (default 30).
 */
export function backupDir() {
  const configured = process.env.BACKUP_DIR || "./backups";
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

function uploadDir() {
  const configured = process.env.UPLOAD_DIR || "./uploads";
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

const DB_PREFIX = "database-";
const STATUS_FILE = "last-backup.json";

export type BackupStatus = { at: string; file: string; bytes: number; uploadsCopied: number; dir: string };

/** Copies upload files that aren't in the backup yet (uploads are never edited in place). */
async function mirror(from: string, to: string): Promise<number> {
  let copied = 0;
  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(from, { withFileTypes: true });
  } catch {
    return 0; // no uploads yet
  }
  await fs.mkdir(to, { recursive: true });
  for (const e of entries) {
    const src = path.join(from, e.name);
    const dst = path.join(to, e.name);
    if (e.isDirectory()) copied += await mirror(src, dst);
    else if (e.isFile()) {
      const [a, b] = await Promise.all([fs.stat(src), fs.stat(dst).catch(() => null)]);
      if (!b || b.size !== a.size) {
        await fs.copyFile(src, dst);
        copied++;
      }
    }
  }
  return copied;
}

/**
 * Takes a backup. The database copy uses SQLite's VACUUM INTO, which writes a
 * complete, consistent copy even while the app is in use.
 */
export async function runBackup(db: PrismaClient): Promise<BackupStatus> {
  const dir = backupDir();
  await fs.mkdir(dir, { recursive: true });
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`; // local time
  const file = path.join(dir, `${DB_PREFIX}${stamp}.db`);
  await fs.rm(file, { force: true });
  await db.$executeRawUnsafe(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const { size } = await fs.stat(file);
  const uploadsCopied = await mirror(uploadDir(), path.join(dir, "uploads"));

  // Keep the newest BACKUP_KEEP database copies.
  const keep = Math.max(1, Number(process.env.BACKUP_KEEP) || 30);
  const copies = (await fs.readdir(dir)).filter((f) => f.startsWith(DB_PREFIX) && f.endsWith(".db")).sort();
  for (const old of copies.slice(0, Math.max(0, copies.length - keep))) await fs.rm(path.join(dir, old), { force: true });

  const status: BackupStatus = { at: now.toISOString(), file: path.basename(file), bytes: size, uploadsCopied, dir };
  await fs.writeFile(path.join(dir, STATUS_FILE), JSON.stringify(status, null, 2));
  return status;
}

export async function lastBackup(): Promise<BackupStatus | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(backupDir(), STATUS_FILE), "utf8")) as BackupStatus;
  } catch {
    return null;
  }
}

const DAY = 24 * 60 * 60 * 1000;

/** The last backup, and whether it's overdue (none yet, or older than two days). */
export async function backupHealth() {
  const last = await lastBackup();
  return { last, overdue: !last || Date.now() - new Date(last.at).getTime() > 2 * DAY };
}

/** Runs from the server: back up at start-up if the last one is over a day old, then check hourly. */
export function startNightlyBackups(db: PrismaClient) {
  const g = globalThis as unknown as { __backupTimer?: ReturnType<typeof setInterval> };
  if (g.__backupTimer) return; // dev reloads re-run register()
  const check = async () => {
    try {
      const last = await lastBackup();
      if (last && Date.now() - new Date(last.at).getTime() < DAY) return;
      const s = await runBackup(db);
      console.log(`[backup] ${s.file} (${(s.bytes / 1024 / 1024).toFixed(1)} MB, ${s.uploadsCopied} new upload files) → ${s.dir}`);
    } catch (err) {
      console.error("[backup] failed:", err);
    }
  };
  setTimeout(check, 60_000); // let the server finish starting
  g.__backupTimer = setInterval(check, 60 * 60 * 1000);
}
