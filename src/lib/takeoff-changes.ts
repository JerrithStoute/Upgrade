import { money, num } from "./utils";

/**
 * "What changed": when a draft estimate updates itself from the takeoff, each takeoff
 * line remembers the items behind it (a snapshot), so the next update can say why its
 * total moved — "5/8" Rebar $0.00 → $11.05", "Concrete 28 → 31 cy". The changes pile up
 * on the estimate until you save it. No database code here.
 */

export type SnapRow = { d: string; q: number; u: string; c: number };
export type ChangeLine = { key: string; name: string; from: number; to: number; details: string[] };
export type AutoNote = { since: string; lines: ChangeLine[] };

const round = (n: number, p = 4) => Math.round(n * 10 ** p) / 10 ** p;

/** The takeoff items behind a line, rounded the same way every time (so unchanged really means unchanged). */
export function toSnapshot(rows: { description: string; quantity: number; unit: string; unitCost: number }[]): SnapRow[] {
  return rows.map((r) => ({ d: r.description, q: round(r.quantity), u: r.unit, c: round(r.unitCost) }));
}

export function parseSnapshot(json: string | null | undefined): SnapRow[] | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as SnapRow[]) : null;
  } catch {
    return null;
  }
}

const MAX_DETAILS = 6;

/** Why a line's total moved: prices, quantities, items added or gone. */
export function detailChanges(before: SnapRow[] | null, after: SnapRow[]): string[] {
  if (!before) return [];
  const out: string[] = [];
  const old = new Map<string, SnapRow>();
  for (const r of before) if (!old.has(r.d)) old.set(r.d, r);
  const seen = new Set<string>();
  for (const r of after) {
    if (seen.has(r.d)) continue;
    seen.add(r.d);
    const o = old.get(r.d);
    if (!o) out.push(`Added ${r.d} (${num(r.q, 2)} ${r.u})`);
    else {
      if (Math.abs(o.c - r.c) > 0.0001) out.push(`${r.d}: ${money(o.c)} → ${money(r.c)} / ${r.u}`);
      if (Math.abs(o.q - r.q) > 0.0001) out.push(`${r.d}: ${num(o.q, 2)} → ${num(r.q, 2)} ${r.u}`);
    }
  }
  for (const o of old.values()) if (!seen.has(o.d)) out.push(`Removed ${o.d}`);
  return out.slice(0, MAX_DETAILS);
}

export function parseAutoNote(json: string | null | undefined): AutoNote | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as AutoNote;
    return v && Array.isArray(v.lines) ? v : null;
  } catch {
    return null;
  }
}

/** Adds this update's changes to the ones since the last save: a line keeps where it started. */
export function mergeNote(prev: AutoNote | null, changes: ChangeLine[], now: Date): AutoNote | null {
  const lines = new Map((prev?.lines ?? []).map((l) => [l.key, { ...l }]));
  for (const c of changes) {
    const was = lines.get(c.key);
    if (was) {
      was.to = c.to;
      was.name = c.name;
      was.details = Array.from(new Set([...was.details, ...c.details])).slice(0, MAX_DETAILS);
    } else lines.set(c.key, { ...c });
  }
  const kept = Array.from(lines.values()).filter((l) => Math.abs(l.to - l.from) >= 0.005 || l.details.length);
  return kept.length ? { since: prev?.since ?? now.toISOString(), lines: kept } : null;
}
