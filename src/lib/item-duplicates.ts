/**
 * Catalog → Item List → Possible duplicates, for everything that isn't a door or window (those are
 * compared part by part in unit-parts.ts). Two names are paired when they're likely one thing typed
 * twice — and never when their numbers differ: 2x4x16 and 2x4x14, 1x4 and 1x6 are different items.
 */

export type DuplicateReason = "size" | "order" | "letters";

export const REASON_LABELS: Record<DuplicateReason, string> = {
  size: "Same size, written differently",
  order: "Same words, other order",
  letters: "A letter or two off",
};

/** Lower-case, sizes in one form: `2x4 × 16'` and `2x4x16` → "2x4x16", quotes and inch/foot marks dropped. */
function normal(name: string) {
  return name
    .toLowerCase()
    .replace(/["'‘’“”′″]/g, "")
    .replace(/\s*[x×]\s*(?=\d)/g, "x")
    .replace(/(\d)\s*[x×]\s*/g, "$1x")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every number in a name, in order ("3-1/4" is one): the part that must match exactly. */
export function numbersOf(name: string) {
  return (normal(name).match(/\d+(?:[-/.]\d+)*/g) ?? []).join(" ");
}

const words = (name: string) =>
  normal(name)
    .replace(/\d+(?:[-/.]\d+)*/g, " ")
    .split(/[^a-z]+/)
    .filter(Boolean);

/** Letters-only edit distance, with which characters of each name differ (for highlighting). */
function editDiff(a: string, b: string) {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  const offA = new Set<number>();
  const offB = new Set<number>();
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      if (a[i - 1] !== b[j - 1]) {
        offA.add(i - 1);
        offB.add(j - 1);
      }
      i--;
      j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) offA.add(--i);
    else offB.add(--j);
  }
  return { distance: d[a.length][b.length], offA, offB };
}

/** Why two names look like one item, or null. */
export function namesMatch(a: string, b: string): DuplicateReason | null {
  if (numbersOf(a) !== numbersOf(b)) return null;
  const na = normal(a);
  const nb = normal(b);
  if (na === nb) return "size";
  const wa = words(a);
  const wb = words(b);
  const compact = (s: string) => s.replace(/[^a-z0-9/]/g, "");
  if (compact(na) === compact(nb)) return /\d/.test(na) ? "size" : "order";
  if (wa.length && [...wa].sort().join(" ") === [...wb].sort().join(" ")) return "order";
  // Misspellings: names with at least 6 letters, one or two letters off (one, under 10 letters).
  const la = wa.join("");
  const lb = wb.join("");
  if (Math.min(la.length, lb.length) < 6 || Math.abs(la.length - lb.length) > 2) return null;
  const { distance } = editDiff(la, lb);
  return distance > 0 && distance <= (Math.min(la.length, lb.length) < 10 ? 1 : 2) ? "letters" : null;
}

/** For "A letter or two off": each name as pieces, the differing letters marked. */
export function markDifferences(a: string, b: string): [{ text: string; off: boolean }[], { text: string; off: boolean }[]] {
  const { offA, offB } = editDiff(a.toLowerCase(), b.toLowerCase());
  const pieces = (s: string, off: Set<number>) => {
    const out: { text: string; off: boolean }[] = [];
    for (let i = 0; i < s.length; i++) {
      const o = off.has(i) && /[a-z]/i.test(s[i]);
      if (out.length && out[out.length - 1].off === o) out[out.length - 1].text += s[i];
      else out.push({ text: s[i], off: o });
    }
    return out;
  };
  return [pieces(a, offA), pieces(b, offB)];
}

export type DuplicateGroup = "trim" | "lumber" | "units" | "other";

export const GROUP_LABELS: Record<DuplicateGroup, string> = { trim: "Trim", lumber: "Lumber", units: "Doors & windows", other: "Other" };

/** Which pill a pair shows under. */
export function groupOfItem(i: { kind: string | null; trimUses?: string[] }): DuplicateGroup {
  if (i.kind === "doors" || i.kind === "windows") return "units";
  if (i.kind === "trim" || i.trimUses?.length) return "trim";
  if (i.kind === "framing lumber") return "lumber";
  return "other";
}

/**
 * Every likely pair among the items that aren't doors or windows, each once ("id|id", smaller id
 * first), but those marked "Not the same". Only names with the same numbers are compared at all.
 */
export function namePairs(items: { id: string; name: string; kind: string | null }[], notSame: string[] = []) {
  const skip = new Set(notSame);
  const buckets = new Map<string, typeof items>();
  for (const i of items) {
    if (i.kind === "doors" || i.kind === "windows") continue;
    const k = numbersOf(i.name);
    buckets.set(k, [...(buckets.get(k) ?? []), i]);
  }
  const out: { key: string; a: string; b: string; reason: DuplicateReason }[] = [];
  for (const list of buckets.values())
    for (let x = 0; x < list.length; x++)
      for (let y = x + 1; y < list.length; y++) {
        const reason = namesMatch(list[x].name, list[y].name);
        if (!reason) continue;
        const [a, b] = [list[x].id, list[y].id].sort();
        const key = `${a}|${b}`;
        if (!skip.has(key)) out.push({ key, a, b, reason });
      }
  return out;
}
