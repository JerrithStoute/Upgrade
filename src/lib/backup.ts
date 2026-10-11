import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { gzipSync, gunzipSync } from "zlib";
import { db, systemDb } from "./db";
import { appTables, connectPg, jsonSource, replaceCompany, sqliteSource } from "./db-copy";
import { currentCompanyId, runAsCompany } from "./tenant";
import { normalizeKey } from "./storage-key";
import { cloud, NotFound } from "./cloud-storage";

/**
 * Backups of one company's records — every one of its rows in every table — and the
 * company's uploaded files (plans, photos, documents). Each company backs up and restores only
 * its own data; other companies are never touched. Used by `npm run backup`, the "Back up now"
 * button, and the nightly backup the server runs on its own (see src/instrumentation.ts).
 *
 * A database backup is one file, database-<when>.json.gz: the company's rows. Backups
 * from before the move to Postgres (database-<when>.db, SQLite) can still be restored.
 *
 * Where they go: online (STORAGE=cloud), the company's own place in cloud storage, with a
 * copy of each of its files. On a PC: the folder picked in Settings → Company → Backups; else
 * a folder of the company's own under BACKUP_DIR (or ./backups). Point it at another drive or
 * a synced cloud folder (OneDrive, Dropbox…) so a dead disk doesn't take both.
 * BACKUP_KEEP  how many database backups to keep (default 30).
 */
export function defaultBackupDir() {
  const configured = process.env.BACKUP_DIR || "./backups";
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

/** This company's own folder under the default backup folder. */
export async function companyDefaultDir() {
  return path.join(defaultBackupDir(), await currentCompanyId());
}

/** The backup folder in use (Settings first). */
export async function backupDir() {
  const chosen = (await db.company.findFirst({ select: { backupDir: true } }))?.backupDir?.trim();
  return chosen || companyDefaultDir();
}

/** The uploads folder, when files are kept on this computer (cloud storage keeps its own copies). */
function localUploadDir() {
  if ((process.env.STORAGE || "local").toLowerCase() !== "local") return null;
  const configured = process.env.UPLOAD_DIR || "./uploads";
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

const DB_PREFIX = "database-";
const STATUS_FILE = "last-backup.json";
const isBackupFile = (f: string) => f.startsWith(DB_PREFIX) && (f.endsWith(".json.gz") || f.endsWith(".db"));

export type BackupStatus = { at: string; file: string; bytes: number; uploadsCopied: number; dir: string };

/** Every uploaded file a company's records point to: its logo, job cover pictures, files, insurance certificates. */
export function storedFileKeys(tables: Record<string, Record<string, unknown>[]>): string[] {
  const keys = [
    tables.Company?.[0]?.logoPath,
    ...(tables.Project ?? []).map((p) => p.coverPath),
    ...(tables.FileAsset ?? []).map((f) => f.storagePath),
    ...(tables.VendorInsurance ?? []).map((c) => c.storagePath),
  ];
  return [...new Set(keys.filter((k): k is string => typeof k === "string" && k !== ""))];
}

/** Copies just the company's own files (that aren't in `to` yet) — never another company's. */
async function copyCompanyFiles(keys: string[], from: string, to: string): Promise<number> {
  let copied = 0;
  for (const raw of keys) {
    let key: string;
    try {
      key = normalizeKey(raw);
    } catch {
      continue;
    }
    const src = path.join(from, key);
    const dst = path.join(to, key);
    const [a, b] = await Promise.all([fs.stat(src).catch(() => null), fs.stat(dst).catch(() => null)]);
    if (!a?.isFile() || (b && b.size === a.size)) continue;
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.copyFile(src, dst);
    copied++;
  }
  return copied;
}

/** Can the program write backups to this folder? (Makes it if needed.) Throws a plain-English reason. */
export async function checkFolder(dir: string) {
  if (!path.isAbsolute(dir)) throw new Error("Put in the whole folder path, e.g. D:\\Backups or C:\\Users\\you\\OneDrive\\The Builder Station backups");
  try {
    await fs.mkdir(dir, { recursive: true });
    const probe = path.join(dir, ".upgrade-write-test");
    await fs.writeFile(probe, "ok");
    await fs.rm(probe, { force: true });
  } catch {
    throw new Error(`The program can't save to ${dir} — check the drive is plugged in and the folder can be written to`);
  }
}

/** Online, backups are kept in cloud storage (the same bucket as the files) instead of a folder. */
export const backupsInCloud = () => (process.env.STORAGE || "local").toLowerCase() === "cloud";

type ShelfEntry = { name: string; bytes: number; at: Date };

/** Where one company's backups are kept: a folder on this computer, or its own place in cloud storage. */
type Shelf = {
  where: string;
  entries(): Promise<ShelfEntry[]>;
  read(name: string): Promise<Buffer>;
  write(name: string, data: Buffer): Promise<void>;
  remove(name: string): Promise<void>;
  /** Copies the company's files that aren't kept yet. Returns how many. */
  keepFiles(keys: string[]): Promise<number>;
  /** Puts back any of these files that have gone missing. Returns how many. */
  returnFiles(keys: string[]): Promise<number>;
};

function folderShelf(dir: string): Shelf {
  return {
    where: dir,
    async entries() {
      let names: string[] = [];
      try {
        names = await fs.readdir(dir);
      } catch {
        return [];
      }
      const all = await Promise.all(names.map(async (name) => ({ name, st: await fs.stat(path.join(dir, name)).catch(() => null) })));
      return all.filter((e) => e.st?.isFile()).map((e) => ({ name: e.name, bytes: e.st!.size, at: e.st!.mtime }));
    },
    read: (name) => fs.readFile(path.join(dir, name)),
    async write(name, data) {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, name), data);
    },
    remove: (name) => fs.rm(path.join(dir, name), { force: true }),
    async keepFiles(keys) {
      const uploads = localUploadDir();
      return uploads ? copyCompanyFiles(keys, uploads, path.join(dir, "uploads")) : 0;
    },
    async returnFiles(keys) {
      const uploads = localUploadDir();
      return uploads ? copyCompanyFiles(keys, path.join(dir, "uploads"), uploads) : 0;
    },
  };
}

const safeKeys = (keys: string[]) =>
  keys.flatMap((k) => {
    try {
      return [normalizeKey(k)];
    } catch {
      return [];
    }
  });

function cloudShelf(companyId: string): Shelf {
  const prefix = `backups/${companyId}/`;
  const filesAt = `${prefix}files/`;
  return {
    where: "cloud storage",
    async entries() {
      return (await cloud.list(prefix))
        .filter((o) => !o.key.slice(prefix.length).includes("/"))
        .map((o) => ({ name: o.key.slice(prefix.length), bytes: o.size, at: o.modified }));
    },
    read: (name) => cloud.get(prefix + name),
    write: (name, data) => cloud.put(prefix + name, data, name.endsWith(".json") ? "application/json" : "application/gzip"),
    remove: (name) => cloud.remove(prefix + name),
    // A copy of each file, so one deleted in the program can still come back with a restore.
    async keepFiles(keys) {
      const kept = new Set((await cloud.list(filesAt)).map((o) => o.key.slice(filesAt.length)));
      let copied = 0;
      for (const key of safeKeys(keys)) {
        if (kept.has(key)) continue;
        try {
          await cloud.copy(key, filesAt + key);
          copied++;
        } catch (err) {
          if (!(err instanceof NotFound)) throw err;
        }
      }
      return copied;
    },
    async returnFiles(keys) {
      let back = 0;
      for (const key of safeKeys(keys)) {
        if ((await cloud.size(key)) !== null) continue;
        try {
          await cloud.copy(filesAt + key, key);
          back++;
        } catch (err) {
          if (!(err instanceof NotFound)) throw err;
        }
      }
      return back;
    },
  };
}

async function shelf(): Promise<Shelf> {
  return backupsInCloud() ? cloudShelf(await currentCompanyId()) : folderShelf(await backupDir());
}

async function connect() {
  return connectPg(process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL);
}

/** The company's rows in every table, read in one consistent snapshot. */
export async function dumpTables(companyId: string) {
  const client = await connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const tables: Record<string, Record<string, unknown>[]> = {};
    for (const t of await appTables(client)) {
      const col = t === "Company" ? "id" : "companyId";
      tables[t] = (await client.query(`SELECT * FROM "${t.replace(/"/g, '""')}" WHERE "${col}" = $1`, [companyId])).rows;
    }
    await client.query("COMMIT");
    return tables;
  } finally {
    await client.end();
  }
}

/** Takes a backup (database + new upload files). `note` goes in the file name ("before-restore"). */
export async function runBackup(note?: string): Promise<BackupStatus> {
  const companyId = await currentCompanyId();
  const s = await shelf();
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`; // local time
  const base = `${DB_PREFIX}${stamp}${note ? `-${note}` : ""}`;
  // Never write over another backup (two in the same second get -2, -3…).
  const taken = new Set((await s.entries()).map((e) => e.name));
  let file = `${base}.json.gz`;
  for (let n = 2; taken.has(file); n++) file = `${base}-${n}.json.gz`;
  const tables = await dumpTables(companyId);
  const data = gzipSync(JSON.stringify({ app: "The Builder Station", version: 2, companyId, at: now.toISOString(), tables }));
  await s.write(file, data);
  const uploadsCopied = await s.keepFiles(storedFileKeys(tables));

  // Keep the newest BACKUP_KEEP database copies.
  const keep = Math.max(1, Number(process.env.BACKUP_KEEP) || 30);
  const copies = [...taken, file].filter(isBackupFile).sort();
  for (const old of copies.slice(0, Math.max(0, copies.length - keep))) await s.remove(old);

  const status: BackupStatus = { at: now.toISOString(), file, bytes: data.length, uploadsCopied, dir: s.where };
  await s.write(STATUS_FILE, Buffer.from(JSON.stringify(status, null, 2)));
  return status;
}

export async function lastBackup(): Promise<BackupStatus | null> {
  try {
    return JSON.parse((await (await shelf()).read(STATUS_FILE)).toString("utf8")) as BackupStatus;
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

export type BackupFile = { file: string; bytes: number; at: Date; beforeRestore: boolean };

/** The database backups, newest first. */
export async function listBackups(): Promise<BackupFile[]> {
  return (await (await shelf()).entries())
    .filter((e) => isBackupFile(e.name))
    .map((e) => ({ file: e.name, bytes: e.bytes, at: e.at, beforeRestore: e.name.includes("before-restore") }))
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

/**
 * Puts everything back the way it was in a backup — while the program keeps running.
 * First a backup of how things are right now is taken (so a restore can be undone).
 * Then, in one go, every table is emptied and refilled from the backup (columns added
 * since then keep their defaults); uploaded files the backup has that are missing come back.
 */
export async function restoreBackup(file: string) {
  const companyId = await currentCompanyId();
  const s = await shelf();
  if (path.basename(file) !== file || !isBackupFile(file)) throw new Error("That isn't one of the backups");
  const data = await s.read(file).catch(() => {
    throw new Error("That backup isn't there any more");
  });
  const safety = await runBackup("before-restore");

  const client = await connect();
  try {
    if (file.endsWith(".db")) {
      // From before companies were separated: all of it was this program's one company.
      const tmp = path.join(os.tmpdir(), `restore-${randomUUID()}.db`);
      await fs.writeFile(tmp, data);
      const lite = await sqliteSource(tmp);
      try {
        await replaceCompany(client, companyId, lite);
      } finally {
        lite.close();
        await fs.rm(tmp, { force: true });
      }
    } else {
      const parsed = JSON.parse(gunzipSync(data).toString("utf8"));
      // A backup carries its company; one from before companies were separated is this company's.
      if (parsed.companyId && parsed.companyId !== companyId) throw new Error("That backup belongs to a different company");
      await replaceCompany(client, companyId, jsonSource(file, parsed));
    }
  } finally {
    await client.end();
  }
  // Only the files the restored records point to — a backup folder may hold others.
  const filesBack = await s.returnFiles(storedFileKeys(await dumpTables(companyId)));
  return { safety: safety.file, filesBack };
}

/** Runs from the server: each company is backed up if its last backup is over a day old — checked at start-up, then hourly. */
export function startNightlyBackups() {
  const g = globalThis as unknown as { __backupTimer?: ReturnType<typeof setInterval> };
  if (g.__backupTimer) return; // dev reloads re-run register()
  const checkOne = async () => {
    const last = await lastBackup();
    if (last && Date.now() - new Date(last.at).getTime() < DAY) return;
    const s = await runBackup();
    console.log(`[backup] ${s.file} (${(s.bytes / 1024 / 1024).toFixed(1)} MB, ${s.uploadsCopied} new upload files) → ${s.dir}`);
  };
  const check = async () => {
    for (const { id } of await systemDb.company.findMany({ select: { id: true } }).catch(() => []))
      await runAsCompany(id, checkOne).catch((err) => console.error(`[backup] company ${id} failed:`, err));
  };
  setTimeout(check, 60_000); // let the server finish starting
  g.__backupTimer = setInterval(check, 60 * 60 * 1000);
}
