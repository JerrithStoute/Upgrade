import "server-only";
import path from "path";
import archiver from "archiver";
import { dumpTables } from "./backup";
import { readUpload } from "./uploads";

/**
 * Everything a company has in The Builder Station, as one ZIP an admin can download:
 * a spreadsheet (CSV) of every list, the complete data (JSON — the same format as a
 * backup), and every uploaded file, sorted into folders by project and vendor.
 */

type Row = Record<string, unknown>;

/** Windows- and Mac-safe file or folder name. */
const safe = (s: string) => s.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "").trim().slice(0, 120) || "_";

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  // A spreadsheet would treat these as a formula when the file is opened.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Row[]): string {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  // The byte-order mark makes Excel read accented letters correctly.
  return "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";
}

/** Gives each file its own name inside a folder ("Plan.pdf", "Plan (2).pdf"…). */
function namer() {
  const used = new Set<string>();
  return (folder: string, name: string) => {
    const ext = path.extname(name);
    const base = safe(name.slice(0, name.length - ext.length) || "file");
    let full = `${folder}/${base}${ext}`;
    for (let n = 2; used.has(full.toLowerCase()); n++) full = `${folder}/${base} (${n})${ext}`;
    used.add(full.toLowerCase());
    return full;
  };
}

const extFor = (mime: string | null | undefined) =>
  ({ "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "application/pdf": ".pdf" })[mime ?? ""] ?? "";

export async function companyExport(companyId: string) {
  const at = new Date();
  const tables = (await dumpTables(companyId)) as Record<string, Row[]>;
  const company = tables.Company?.[0] ?? {};
  const zip = archiver("zip", { zlib: { level: 6 } });
  const name = namer();
  const missing: string[] = [];

  zip.append(
    [
      `${String(company.name ?? "Company")} — all data from The Builder Station`,
      `Downloaded ${at.toUTCString()}`,
      "",
      "spreadsheets/   One CSV file per list (projects, estimates, invoices…). Opens in Excel.",
      "files/          Every uploaded file, sorted by project and vendor.",
      "all-data.json   Everything in one file — the same format as a backup, for moving to another system.",
      "",
    ].join("\r\n"),
    { name: "README.txt" },
  );
  for (const [table, rows] of Object.entries(tables)) {
    if (rows.length) zip.append(toCsv(rows), { name: `spreadsheets/${table}.csv` });
  }
  zip.append(JSON.stringify({ app: "The Builder Station", version: 2, companyId, at: at.toISOString(), tables }), { name: "all-data.json" });

  // The files, read one at a time while the download streams.
  const projects = new Map((tables.Project ?? []).map((p) => [p.id, `files/Projects/${safe(`#${p.number} ${p.name}`)}`]));
  const vendors = new Map((tables.Vendor ?? []).map((v) => [v.id, `files/Vendors/${safe(String(v.name))}`]));
  const files: { key: string; as: string }[] = [];
  if (company.logoPath) files.push({ key: String(company.logoPath), as: name("files", `Company logo${extFor(company.logoType as string)}`) });
  for (const p of tables.Project ?? []) if (p.coverPath) files.push({ key: String(p.coverPath), as: name(projects.get(p.id)!, `Cover picture${path.extname(String(p.coverPath))}`) });
  for (const f of tables.FileAsset ?? []) files.push({ key: String(f.storagePath), as: name(projects.get(f.projectId) ?? "files/Other", String(f.name)) });
  for (const c of tables.VendorInsurance ?? [])
    if (c.storagePath) files.push({ key: String(c.storagePath), as: name(`${vendors.get(c.vendorId) ?? "files/Vendors"}/Insurance`, String(c.fileName ?? `Certificate${path.extname(String(c.storagePath))}`)) });

  (async () => {
    for (const f of files) {
      try {
        zip.append(await readUpload(f.key), { name: f.as });
      } catch {
        missing.push(f.as);
      }
    }
    if (missing.length) zip.append(`These files were listed but couldn't be found:\r\n${missing.join("\r\n")}\r\n`, { name: "files/MISSING.txt" });
    await zip.finalize();
  })().catch((err) => zip.destroy(err));

  return { zip, filename: `${safe(String(company.name ?? "Company"))} - all data - ${at.toISOString().slice(0, 10)}.zip` };
}
