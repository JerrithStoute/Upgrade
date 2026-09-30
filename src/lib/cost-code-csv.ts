/**
 * Cost code CSV import — shared by the browser preview and the server action.
 *
 * Column A = group (used as-is), Column B = cost code. When Column B starts with a
 * number it becomes the code and the rest is the name ("09-410 Tile Material" →
 * code "09-410", name "Tile Material"); otherwise the whole entry is the name and the
 * code is left blank. Groups and codes keep the order they appear in the file.
 */

export type ParsedCostCode = { line: number; group: string; code: string | null; name: string };

export type CostCodeCsvResult = {
  groups: string[];
  codes: ParsedCostCode[];
  errors: string[];
  skippedHeader: boolean;
};

/** Minimal RFC 4180 CSV reader: quoted fields, escaped quotes (""), commas/newlines inside quotes, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Leading number → code. The number may use . - / separators ("09-410", "1000.10",
 * "3/100") and must be followed by a space, a dash/colon separator, or the end.
 * "2x4 Lumber" has no code.
 */
const CODE_RE = /^([0-9]+(?:[.\-/][0-9]+)*[A-Za-z]?)(?:\s*[-–—:]\s+|\s+|$)(.*)$/;

export function splitCodeAndName(entry: string): { code: string | null; name: string } {
  const text = entry.trim().replace(/\s+/g, " ");
  const m = CODE_RE.exec(text);
  if (!m) return { code: null, name: text };
  const code = m[1];
  const name = m[2].trim().replace(/^[-–—:]\s*/, "");
  return { code, name: name || code };
}

const HEADER_A = /^(group|groups|category|categories|division|divisions|phase)s?\b/i;
const HEADER_B = /^(cost ?codes?|codes?|items?|names?|descriptions?)\b/i;

export function parseCostCodeCsv(text: string): CostCodeCsvResult {
  const rows = parseCsv(text);
  const errors: string[] = [];
  const codes: ParsedCostCode[] = [];
  const groups: string[] = [];
  const seenGroups = new Set<string>();
  const seenCodes = new Map<string, number>();
  const seenNames = new Map<string, number>();
  let skippedHeader = false;

  rows.forEach((cells, idx) => {
    const line = idx + 1;
    const group = (cells[0] ?? "").trim();
    const entry = (cells[1] ?? "").trim();
    if (!group && !entry) return; // blank row
    if (idx === 0 && HEADER_A.test(group) && HEADER_B.test(entry)) {
      skippedHeader = true;
      return;
    }
    if (!group) {
      errors.push(`Row ${line}: "${entry}" has no group in column A.`);
      return;
    }
    if (!entry) {
      errors.push(`Row ${line}: group "${group}" has no cost code in column B.`);
      return;
    }
    const { code, name } = splitCodeAndName(entry);
    if (code) {
      const prev = seenCodes.get(code.toLowerCase());
      if (prev) errors.push(`Row ${line}: code ${code} is already used on row ${prev}.`);
      else seenCodes.set(code.toLowerCase(), line);
    }
    const nameKey = `${group.toLowerCase()}\u0000${name.toLowerCase()}`;
    const prevName = seenNames.get(nameKey);
    if (prevName) errors.push(`Row ${line}: "${name}" appears twice in group "${group}" (also row ${prevName}).`);
    else seenNames.set(nameKey, line);
    if (!seenGroups.has(group)) {
      seenGroups.add(group);
      groups.push(group);
    }
    codes.push({ line, group, code, name });
  });

  if (!codes.length && !errors.length) errors.push("The file has no cost codes. Put groups in column A and cost codes in column B.");
  return { groups, codes, errors, skippedHeader };
}

export type ExistingCostCode = { id: string; code: string | null; name: string; division: string; refs: number };

/**
 * Pairs file rows with existing cost codes by name (case-insensitive), preferring an
 * existing code in the same group. Each existing code is used at most once.
 * Unmatched existing codes are deleted by the import.
 */
export function planCostCodeImport(parsed: ParsedCostCode[], existing: ExistingCostCode[]) {
  const byName = new Map<string, ExistingCostCode[]>();
  for (const e of existing) {
    const k = e.name.trim().toLowerCase();
    byName.set(k, [...(byName.get(k) ?? []), e]);
  }
  const used = new Set<string>();
  const rows = parsed.map((row) => {
    const candidates = (byName.get(row.name.toLowerCase()) ?? []).filter((e) => !used.has(e.id));
    const match = candidates.find((e) => e.division.toLowerCase() === row.group.toLowerCase()) ?? candidates[0] ?? null;
    if (match) used.add(match.id);
    return { ...row, match };
  });
  const removed = existing.filter((e) => !used.has(e.id));
  return { rows, removed };
}
