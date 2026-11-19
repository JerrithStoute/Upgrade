import { inflateRawSync } from "zlib";

/**
 * Reads the first sheet of a CoConstruct Excel export into rows of { column letter: text }.
 * CoConstruct writes its files with an "x:" prefix on every tag, which the usual Excel readers
 * (exceljs) can't open — so this reads the file itself: an .xlsx is a zip of XML files.
 */

/** The files inside a zip, by name (stored or deflated — all an .xlsx uses). */
export function unzip(buf: Buffer): Map<string, Buffer> {
  // The end-of-directory record sits in the last 64 KB (after an optional comment).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error("That isn't an Excel file (.xlsx)");
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error("The Excel file is damaged");
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString("utf8", at + 46, at + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, inflateRawSync(raw));
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const unescape = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");

const noPrefix = (x: string) => x.replace(/<(\/?)[a-zA-Z]+:/g, "<$1");
const texts = (x: string) => unescape([...x.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));

export type Row = Record<string, string>;

/** The first sheet's rows (blank cells left out; an empty row is {}). */
export function readSheet(buf: Buffer): Row[] {
  const files = unzip(buf);
  const shared: string[] = [];
  const ss = files.get("xl/sharedStrings.xml");
  if (ss) for (const m of noPrefix(ss.toString("utf8")).matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(texts(m[1]));
  const sheetName = [...files.keys()].filter((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n)).sort()[0];
  if (!sheetName) throw new Error("That Excel file has no sheet in it");
  const xml = noPrefix(files.get(sheetName)!.toString("utf8"));
  const rows: Row[] = [];
  for (const r of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: Row = {};
    for (const c of (r[1] ?? "").matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, col, attrs, body = ""] = c;
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let val: string | undefined;
      if (type === "s" && v !== undefined) val = shared[Number(v)];
      else if (type === "inlineStr") val = texts(body);
      else if (v !== undefined) val = unescape(v);
      if (val !== undefined && val !== "") row[col] = val;
    }
    rows.push(row);
  }
  return rows;
}
