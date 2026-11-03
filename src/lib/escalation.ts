/**
 * Material price escalation: how much the materials on a bid cost today against what they
 * cost when the proposal was sent (or the contract signed). Bid quantities, today's prices —
 * so only prices move it, never takeoff changes. Materials only; subs and labor aren't in it.
 */

/** One Material list line as it was priced in a bid snapshot. */
export type SnapshotLine = {
  key: string;
  materialItemId: string | null;
  name: string;
  category: string;
  unit: string;
  qty: number;
  price: number;
  pinned: boolean;
  vendor: string | null;
};

export type EscalationLine = SnapshotLine & { today: number; change: number };

export type Escalation = {
  then: number;
  now: number;
  change: number;
  /** % change, rounded to a tenth. */
  pct: number;
  triggerPct: number;
  /** Past the trigger: the whole increase can be charged. */
  past: boolean;
  lines: EscalationLine[];
};

export function parseSnapshotLines(json: string | null | undefined): SnapshotLine[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as SnapshotLine[]) : [];
  } catch {
    return [];
  }
}

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * `today(line)`: the line's price now, or null when there's nothing to compare with (it keeps
 * its bid price). A line bid at $0 (not priced yet) has nothing to rise from: it stays out.
 * A price rise has to be MORE than the trigger to be charged.
 */
export function escalationOf(lines: SnapshotLine[], today: (l: SnapshotLine) => number | null, triggerPct: number): Escalation {
  let then = 0;
  let now = 0;
  const out = lines.map((l) => {
    const t = today(l);
    const price = l.price > 0 && t !== null && t > 0 ? t : l.price;
    const change = cents(l.qty * (price - l.price));
    then += l.qty * l.price;
    now += l.qty * price;
    return { ...l, today: price, change };
  });
  then = cents(then);
  now = cents(now);
  const change = cents(now - then);
  const pct = then > 0 ? Math.round((change / then) * 1000) / 10 : 0;
  return { then, now, change, pct, triggerPct, past: pct > triggerPct, lines: out };
}
