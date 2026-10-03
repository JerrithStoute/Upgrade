/**
 * Plan revisions: lining a new sheet up with the previous revision's, and pairing
 * the sheets of two revisions. Pure (client and server).
 */

export type Pt = [number, number];

/** How the previous sheet maps onto the new one: new = [a −b; b a]·old + [tx, ty] (a shift, a turn and a size change). */
export type Align = { a: number; b: number; tx: number; ty: number };

export const NO_ALIGN: Align = { a: 1, b: 0, tx: 0, ty: 0 };

export function parseAlign(json: string | null | undefined): Align {
  if (!json) return NO_ALIGN;
  try {
    const v = JSON.parse(json) as Partial<Align>;
    return [v.a, v.b, v.tx, v.ty].every((n) => typeof n === "number" && Number.isFinite(n)) ? (v as Align) : NO_ALIGN;
  } catch {
    return NO_ALIGN;
  }
}

/** A point on the previous sheet, where it lands on the new one. */
export function applyAlign(al: Align, [x, y]: Pt): Pt {
  return [al.a * x - al.b * y + al.tx, al.b * x + al.a * y + al.ty];
}

/** How much bigger the new sheet draws things (a reprint at a different size). */
export const alignScale = (al: Align) => Math.hypot(al.a, al.b);
/** How far the new sheet is turned (radians). */
export const alignAngle = (al: Align) => Math.atan2(al.b, al.a);

/**
 * From matching points clicked on both sheets: one pair = just a shift; two pairs
 * also catch a turn or a size change.
 */
export function alignFromPairs(old: Pt[], now: Pt[]): Align {
  if (old.length < 1 || now.length < 1) return NO_ALIGN;
  if (old.length < 2 || now.length < 2) return { a: 1, b: 0, tx: now[0][0] - old[0][0], ty: now[0][1] - old[0][1] };
  // As complex numbers: now = s·old + t, with s = (n2 − n1) / (o2 − o1).
  const [ox, oy] = [old[1][0] - old[0][0], old[1][1] - old[0][1]];
  const [nx, ny] = [now[1][0] - now[0][0], now[1][1] - now[0][1]];
  const d = ox * ox + oy * oy;
  if (d < 1e-9) return alignFromPairs(old.slice(0, 1), now.slice(0, 1));
  const a = (nx * ox + ny * oy) / d;
  const b = (ny * ox - nx * oy) / d;
  return { a, b, tx: now[0][0] - (a * old[0][0] - b * old[0][1]), ty: now[0][1] - (b * old[0][0] + a * old[0][1]) };
}

export const isNoAlign = (al: Align) => Math.abs(al.a - 1) < 1e-9 && Math.abs(al.b) < 1e-9 && Math.abs(al.tx) < 1e-9 && Math.abs(al.ty) < 1e-9;

type SheetRef = { id: string; pageNumber: number; name: string };

/** "A-101 Floor Plan" → "a101floorplan"; default names ("Sheet 3", "Page 3") don't count as names. */
function nameKey(name: string) {
  const k = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return /^(sheet|page)\d+$/.test(k) ? "" : k;
}

/**
 * The new sheet each old sheet carries over to: the same sheet name if both have
 * real names, else the same page number. Old id → new id (missing = no match).
 */
export function pairSheets(old: SheetRef[], now: SheetRef[]) {
  const byName = new Map(now.filter((s) => nameKey(s.name)).map((s) => [nameKey(s.name), s.id]));
  const byPage = new Map(now.map((s) => [s.pageNumber, s.id]));
  const out = new Map<string, string>();
  for (const s of old) {
    const k = nameKey(s.name);
    const id = (k && byName.get(k)) || byPage.get(s.pageNumber);
    if (id) out.set(s.id, id);
  }
  return out;
}

/** `then` after `first`: a fine-tune clicked on top of an existing lining-up. */
export function composeAlign(first: Align, then: Align): Align {
  const [tx, ty] = applyAlign(then, [first.tx, first.ty]);
  return { a: then.a * first.a - then.b * first.b, b: then.a * first.b + then.b * first.a, tx, ty };
}
