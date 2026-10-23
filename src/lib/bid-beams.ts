/**
 * Beams on a bid (glulams, LVLs — made to order, one Material list line per exact length, in lf): the
 * vendor sees them by the piece — "2 ea — Glulam 3-1/2x11-7/8 × 18'-0"" — and prices them per beam or
 * per lf, as they quote. The bid keeps every price per lf (like the Item List), so comparing and taking
 * work as for any line; a price per beam is turned into per lf (÷ its length) when it comes in.
 */

const BEAM_KEY = /\|pieces:(\d+(?:\.\d+)?)$/;

/** A beam line's length in feet (from its Material list key "<item>|pieces:<len>"), or null for any other line. */
export function beamLength(l: { key: string; unit: string }): number | null {
  if (l.unit !== "lf") return null;
  const m = BEAM_KEY.exec(l.key);
  const len = m ? Number(m[1]) : NaN;
  return len > 0 ? len : null;
}

/** How many beams a line is (its lf ÷ its length). */
export const beamCount = (l: { quantity: number }, len: number) => Math.max(1, Math.round(l.quantity / len));

/** A price as typed — per beam or per lf — kept per lf. */
export function toPerLf(price: number | null, basis: string | null | undefined, len: number | null) {
  if (price == null || !len || basis === "lf") return price;
  return Math.round((price / len) * 10000) / 10000;
}

/** A per-lf price shown per beam. */
export const perBeam = (perLf: number, len: number) => Math.round(perLf * len * 100) / 100;

/** A bid line as the vendor sees it: by the piece for a beam, else as it is. */
export function asSent<T extends { key: string; unit: string; quantity: number; unitPrice: number | null }>(l: T) {
  const len = beamLength(l);
  if (!len) return { quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice, len: null as number | null };
  return { quantity: beamCount(l, len), unit: "ea", unitPrice: l.unitPrice != null ? perBeam(l.unitPrice, len) : null, len };
}
