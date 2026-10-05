/** The cost codes a vendor usually bids (ids, or "none"). */
export function vendorCodes(v: { costCodeIds: string | null }): string[] {
  try {
    const a = JSON.parse(v.costCodeIds ?? "[]");
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
}

/** A vendor name tidied for storing and matching: single spaces, trimmed. */
export function cleanVendorName(name: string) {
  return name.replace(/\s+/g, " ").trim().slice(0, 120);
}

/** Matching key: case and spacing don't make a different vendor ("BMC" = "bmc "). */
export function vendorKey(name: string) {
  return cleanVendorName(name).toLowerCase();
}

export type VendorRow = { name: string; contact: string | null; email: string | null; phone: string | null; notes: string | null };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+(]?\d[\d\s().\-–]{6,}(\s*(x|ext\.?)\s*\d+)?$/i;

/** One line of pasted text or CSV into cells (tabs from Excel, else commas; "quoted, cells" kept whole). */
export function splitLine(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/**
 * Vendors from whatever list the builder has — pasted from Excel, a CSV, an export from
 * another program. With a heading row, its columns are used (Name / Vendor / Company,
 * Contact, Email, Phone, Notes). Without one, each cell is recognized: an email, a phone
 * number, then the first other text is the name and the next the contact.
 */
export function parseVendorRows(rows: string[][]): VendorRow[] {
  const cleaned = rows.map((r) => r.map((c) => (c ?? "").toString().trim())).filter((r) => r.some(Boolean));
  if (!cleaned.length) return [];
  const head = cleaned[0].map((c) => c.toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  const nameCol = col("name", "vendor", "company", "supplier", "business");
  const hasHeader = nameCol >= 0 && head.some((h) => /email|phone|contact|name|vendor|company/.test(h)) && !head.some((h) => EMAIL.test(h));
  const out: VendorRow[] = [];
  if (hasHeader) {
    const c = { contact: col("contact", "person", "rep"), email: col("email", "e-mail"), phone: col("phone", "tel", "mobile", "cell"), notes: col("note", "memo", "comment") };
    for (const r of cleaned.slice(1)) {
      const name = cleanVendorName(r[nameCol] ?? "");
      if (!name) continue;
      const email = c.email >= 0 && EMAIL.test(r[c.email] ?? "") ? r[c.email] : null;
      out.push({
        name,
        contact: c.contact >= 0 ? r[c.contact] || null : null,
        email,
        phone: c.phone >= 0 ? r[c.phone] || null : null,
        notes: c.notes >= 0 ? r[c.notes] || null : null,
      });
    }
  } else {
    for (const r of cleaned) {
      let email: string | null = null;
      let phone: string | null = null;
      const text: string[] = [];
      for (const cell of r) {
        if (!cell) continue;
        if (!email && EMAIL.test(cell)) email = cell;
        else if (!phone && PHONE.test(cell)) phone = cell;
        else text.push(cell);
      }
      const name = cleanVendorName(text[0] ?? "");
      if (!name) continue;
      out.push({ name, contact: text[1] ?? null, email, phone, notes: text.slice(2).join(" · ") || null });
    }
  }
  // Same vendor twice in the list: one row, the details filled from either.
  const seen = new Map<string, VendorRow>();
  for (const v of out) {
    const k = vendorKey(v.name);
    const had = seen.get(k);
    if (!had) seen.set(k, v);
    else seen.set(k, { name: had.name, contact: had.contact ?? v.contact, email: had.email ?? v.email, phone: had.phone ?? v.phone, notes: had.notes ?? v.notes });
  }
  return Array.from(seen.values());
}
