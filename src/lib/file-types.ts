/**
 * What an uploaded file really is — read from its first bytes, not its name — and
 * whether it's allowed where it's being uploaded. A program renamed "invoice.pdf" is
 * refused; so are web pages and SVG pictures (they can carry scripts).
 */

export type UploadKind = "document" | "photo" | "plan";

type Found = { type: string; label: string };

const ext = (name: string) => (name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "");
const starts = (b: Buffer, sig: number[], at = 0) => b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);
const ascii = (b: Buffer, at: number, n: number) => b.toString("latin1", at, at + n);

/** Plain text (CSV, TXT, DXF): no zero bytes and readable as UTF-8. */
function looksLikeText(b: Buffer) {
  const sample = b.subarray(0, 8192);
  if (sample.includes(0)) return false;
  return !sample.toString("utf8").includes("�");
}

export function sniff(b: Buffer, name: string): Found | null {
  const e = ext(name);
  if (ascii(b, 0, 5) === "%PDF-") return { type: "application/pdf", label: "PDF" };
  if (starts(b, [0xff, 0xd8, 0xff])) return { type: "image/jpeg", label: "photo" };
  if (starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { type: "image/png", label: "photo" };
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return { type: "image/webp", label: "photo" };
  if (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a") return { type: "image/gif", label: "photo" };
  if (ascii(b, 4, 4) === "ftyp" && ["heic", "heix", "hevc", "mif1", "msf1", "heif"].includes(ascii(b, 8, 4))) return { type: "image/heic", label: "photo" };
  // Word / Excel / PowerPoint (2007+) and ZIP all start like a ZIP; the name says which.
  if (starts(b, [0x50, 0x4b, 0x03, 0x04]) || starts(b, [0x50, 0x4b, 0x05, 0x06])) {
    const zipTypes: Record<string, string> = {
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      zip: "application/zip",
    };
    return zipTypes[e] ? { type: zipTypes[e], label: e === "zip" ? "ZIP" : "Office" } : null;
  }
  // Older Word / Excel (.doc / .xls).
  if (starts(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
    return e === "doc" ? { type: "application/msword", label: "Office" } : e === "xls" ? { type: "application/vnd.ms-excel", label: "Office" } : null;
  if (/^AC10\d\d$/.test(ascii(b, 0, 6)) && e === "dwg") return { type: "image/vnd.dwg", label: "CAD" };
  if (looksLikeText(b)) {
    if (e === "dxf") return { type: "image/vnd.dxf", label: "CAD" };
    if (e === "csv") return { type: "text/csv", label: "text" };
    if (e === "txt") return { type: "text/plain", label: "text" };
  }
  return null;
}

const ALLOWED: Record<UploadKind, { labels: string[]; say: string }> = {
  plan: { labels: ["PDF", "photo"], say: "a PDF or a picture (JPG, PNG)" },
  photo: { labels: ["photo"], say: "a photo (JPG, PNG, WebP or iPhone HEIC)" },
  document: { labels: ["PDF", "photo", "Office", "text", "CAD", "ZIP"], say: "PDF, photos, Word, Excel, CSV or text, CAD drawings (DWG, DXF), or ZIP" },
};

/** The file's real type when it's allowed here — otherwise a plain-English reason. */
export function checkUpload(b: Buffer, name: string, kind: UploadKind): { type: string } | { error: string } {
  const found = sniff(b, name);
  if (!found || !ALLOWED[kind].labels.includes(found.label)) return { error: `“${name}” can't be uploaded here — it needs to be ${ALLOWED[kind].say}.` };
  return { type: found.type };
}
