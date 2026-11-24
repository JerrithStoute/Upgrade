/**
 * Made-up houses for training the plan-reading AI (Plan Lab only — never part of The Builder Station).
 * Step 1: one-story ranch houses — a bedroom wing off a hall, an open kitchen/living core, and either a
 * utility strip + attached garage or a master wing on the other side (a split plan). Everything here is
 * in inches on the walls' center lines, y down, the front of the house toward +y. The house is decided
 * first (rooms, then the walls between them, then doors and windows); the drawing and the answer key
 * both come from it, so they can't disagree.
 */
import type { Rng } from "./rng";

export type Pt = [number, number];
export type Rect = { x0: number; y0: number; x1: number; y1: number };
export type RoomType = "great" | "bed" | "master" | "bath" | "mbath" | "half" | "closet" | "wic" | "linen" | "pantry" | "laundry" | "garage" | "flex";
export type Zone = { text: string; rect: Rect; dims: boolean; role?: "kitchen" | "dining" | "living" | "hall" };
export type Room = { id: number; name: string; type: RoomType; rects: Rect[]; zones: Zone[]; /** a bump-out room: the room it opens off */ attach?: number };
export type Size = "2x4" | "2x6";
/** A straight wall between two rooms (or a room and the outside, OUT), corner to corner. s runs from a to b. */
export type Run = { id: number; a: Pt; b: Pt; horiz: boolean; sides: [number, number]; kind: "ext" | "int"; size: Size; t: number };
export type Opening = { run: number; s0: number; s1: number; type: "door" | "window" | "garage"; into?: number; hingeAtS0?: boolean; bifold?: boolean; cased?: boolean; /** other doors that still close the room off: slides into the wall, slides on the wall face, a pair of swings */ style?: "pocket" | "barn" | "double"; /** which way a pocket/barn door slides along the wall (+: toward s1) */ slide?: 1 | -1 };
export type Porch = { name: string; x0: number; x1: number; wallY: number; depth: number; dir: 1 | -1; /** set into the house this far (the wall steps back for it): its sides start past that */ inset?: number };
/**
 * A 45° wall across a small room's corner (a corner pantry or closet), usually with the room's door in it. Its two
 * neighbors are shortened to meet it. `tri` (C, P1, P2) is the corner the small room gives up to the other room.
 */
export type Diag = { a: Pt; b: Pt; t: number; size: Size; kind: "int" | "ext"; sides: [number, number]; tri: Pt[]; door?: { s0: number; s1: number; into: number; hingeAtS0: boolean }; win?: { s0: number; s1: number } };
export type Layout = { rooms: Room[]; runs: Run[]; openings: Opening[]; porches: Porch[]; extSize: Size; variant: "garage" | "split"; diags: Diag[] };

export const OUT = -1;
const F = 12;

/** Room names, a few ways each (drafters differ). */
const NAMES: Record<string, string[]> = {
  master: ["MASTER BEDROOM", "MASTER SUITE", "PRIMARY BEDROOM", "OWNER'S SUITE", "MASTER BED"],
  mbath: ["MASTER BATH", "PRIMARY BATH", "M. BATH", "OWNER'S BATH"],
  wic: ["W.I.C.", "WALK-IN CLOSET", "WIC", "M. CLOSET"],
  bed: ["BEDROOM", "BED", "BEDRM."],
  bath: ["BATH", "BATH 2", "HALL BATH", "BATHROOM"],
  closet: ["CLO.", "CLOSET", "CL."],
  linen: ["LINEN", "LIN.", "LINEN CL."],
  pantry: ["PANTRY", "PAN.", "WALK-IN PANTRY"],
  laundry: ["LAUNDRY", "UTILITY", "LAUNDRY RM.", "UTIL."],
  half: ["1/2 BATH", "POWDER", "POWDER RM.", "HALF BATH"],
  garage: ["GARAGE", "2 CAR GARAGE", "TWO CAR GARAGE", "GARAGE"],
  living: ["LIVING", "LIVING ROOM", "GREAT ROOM", "FAMILY ROOM", "FAMILY"],
  kitchen: ["KITCHEN", "KITCHEN"],
  dining: ["DINING", "DINING ROOM", "BREAKFAST", "DINING AREA"],
  porch: ["PORCH", "COVERED PORCH", "FRONT PORCH"],
  patio: ["PATIO", "COVERED PATIO", "BACK PORCH"],
  flex: ["OFFICE", "STUDY", "STORAGE", "FLEX", "DEN"],
  bump: ["OFFICE", "SITTING", "SITTING RM.", "NOOK", "READING NOOK", "STUDY"],
};

const rect = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x0, y0, x1, y1 });
/** a minus b, as up to 4 rectangles. */
function subRect(a: Rect, b: Rect): Rect[] {
  const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1), y0 = Math.max(a.y0, b.y0), y1 = Math.min(a.y1, b.y1);
  if (x0 >= x1 || y0 >= y1) return [a];
  const out: Rect[] = [];
  if (a.y0 < y0) out.push(rect(a.x0, a.y0, a.x1, y0));
  if (y1 < a.y1) out.push(rect(a.x0, y1, a.x1, a.y1));
  if (a.x0 < x0) out.push(rect(a.x0, y0, x0, y1));
  if (x1 < a.x1) out.push(rect(x1, y0, a.x1, y1));
  return out;
}

type Spec = { key: string; type: RoomType; min: number; max: number; grow?: boolean };

/** Rooms side by side along a strip: widths sampled in their ranges. */
function widths(r: Rng, specs: Spec[]): number[] {
  return specs.map((s) => r.step(s.min * F, s.max * F));
}

export function makeLayout(r: Rng): Layout | null {
  const rooms: Room[] = [];
  const add = (key: string, type: RoomType, rects: Rect[], name?: string): Room => {
    const room: Room = { id: rooms.length, name: name ?? r.pick(NAMES[key]), type, rects, zones: [] };
    rooms.push(room);
    return room;
  };
  const variant: Layout["variant"] = r.chance(0.7) ? "garage" : "split";
  const hallW = r.pick([42, 44, 46, 48]);
  const linenW = r.pick([24, 26, 30]);
  const Db = r.step(11 * F, 15 * F), Df = r.step(11 * F, 14 * F);
  const D = Db + hallW + Df;

  // The bedroom wing: a back strip and a front strip of rooms, outer end first, with the hall between.
  const back: Spec[] =
    variant === "garage"
      ? [{ key: "wic", type: "wic", min: 5, max: 7 }, { key: "mbath", type: "mbath", min: 8, max: 11 }, { key: "master", type: "master", min: 13, max: 16, grow: true }]
      : [{ key: "bed", type: "bed", min: 11, max: 13, grow: true }, { key: "bath", type: "bath", min: 5.5, max: 8 }, ...(r.chance(0.4) ? [{ key: "bed", type: "bed" as RoomType, min: 11, max: 13, grow: true }] : [])];
  const front: Spec[] =
    variant === "garage"
      ? [{ key: "bed", type: "bed", min: 11, max: 13, grow: true }, { key: "bath", type: "bath", min: 5.5, max: 8 }, { key: "bed", type: "bed", min: 11, max: 13, grow: true }]
      : [{ key: "bed", type: "bed", min: 11, max: 13, grow: true }, r.chance(0.5) ? { key: "laundry", type: "laundry", min: 6, max: 8 } : { key: "bed", type: "bed", min: 11, max: 12, grow: true }];
  const wb = widths(r, back), wf = widths(r, front);
  const sum = (w: number[]) => w.reduce((a, b) => a + b, 0);
  const Wb = Math.max(sum(wb), sum(wf));
  // The shorter strip: a few feet short — its bedrooms a bit bigger; more — an office/study/storage room at the end.
  for (const [specs, ws] of [[back, wb], [front, wf]] as [Spec[], number[]][]) {
    const gap = Wb - sum(ws);
    if (gap >= 5 * F) {
      if (gap > 13 * F) return null;
      specs.unshift({ key: "flex", type: "flex", min: 0, max: 0 });
      ws.unshift(gap);
    } else if (gap > 0) {
      const g = specs.map((sp, i) => (sp.grow ? i : -1)).filter((i) => i >= 0);
      const each = Math.floor(gap / g.length / 2) * 2;
      g.forEach((i) => (ws[i] += each));
      ws[g[g.length - 1]] += gap - each * g.length;
    }
  }
  if ([...wb, ...wf].some((w) => w < 4 * F)) return null;

  let bedNo = 2;
  const bedName = () => {
    const n = r.pick(NAMES.bed);
    return n === "BEDROOM" || n === "BED" ? `${n} ${bedNo++}` : `${n} ${bedNo++}`;
  };
  const strip = (specs: Spec[], ws: number[], y0: number, y1: number, hallSide: number) => {
    let x = 0;
    specs.forEach((s, i) => {
      const box = rect(x, y0, x + ws[i], y1);
      x += ws[i];
      if (s.type === "bed") {
        // A reach-in closet along the hall wall, at one end of the room.
        const cd = r.pick([24, 26, 28, 30]), cw = Math.min(r.step(5 * F, 7 * F), ws[i] - 4 * F);
        const atStart = r.chance(0.5);
        const cx0 = atStart ? box.x0 : box.x1 - cw;
        const c = hallSide > y0 ? rect(cx0, y1 - cd, cx0 + cw, y1) : rect(cx0, y0, cx0 + cw, y0 + cd);
        const bed = add("bed", "bed", subRect(box, c), bedName());
        bed.zones.push({ text: bed.name, rect: hallSide > y0 ? rect(box.x0, y0, box.x1, y1 - cd) : rect(box.x0, y0 + cd, box.x1, y1), dims: true });
        const clo = add("closet", "closet", [c]);
        clo.zones.push({ text: clo.name, rect: c, dims: false });
      } else {
        const room = add(s.key, s.type, [box]);
        room.zones.push({ text: room.name, rect: box, dims: s.type !== "wic" || r.chance(0.5) });
      }
    });
  };
  strip(back, wb, 0, Db, Db);
  strip(front, wf, Db + hallW, D, Db + hallW);
  const linen = add("linen", "linen", [rect(0, Db, linenW, Db + hallW)]);
  linen.zones.push({ text: linen.name, rect: linen.rects[0], dims: false });

  // The core: kitchen (back) and living (front), open to each other and to the hall.
  const Wc = r.step(18 * F, 27 * F);
  const cx0 = Wb, cx1 = Wb + Wc;
  const hall = rect(linenW, Db, Wb, Db + hallW);
  let core = [rect(cx0, 0, cx1, D)];
  const great = add("living", "great", [], "GREAT");
  const Dk = r.step(Math.round(D * 0.38), Math.round(D * 0.5), 2);
  const pantryAt = variant === "split" || r.chance(0.4);
  if (pantryAt) {
    const pw = r.step(4 * F, 5 * F), pd = r.step(4 * F, 5 * F);
    const p = rect(cx1 - pw, 0, cx1, pd);
    core = core.flatMap((c) => subRect(c, p));
    const pan = add("pantry", "pantry", [p]);
    pan.zones.push({ text: pan.name, rect: p, dims: false });
  }
  great.rects = [hall, ...core];
  if (Wc >= 22 * F && r.chance(0.6)) {
    const kx = cx0 + Math.round(Wc * 0.55);
    great.zones.push({ text: r.pick(NAMES.kitchen), rect: rect(cx0, 0, kx, Dk), dims: r.chance(0.5), role: "kitchen" }, { text: r.pick(NAMES.dining), rect: rect(kx, 0, cx1, Dk), dims: r.chance(0.5), role: "dining" });
  } else great.zones.push({ text: r.pick(NAMES.kitchen), rect: rect(cx0, 0, cx1, Dk), dims: r.chance(0.5), role: "kitchen" });
  great.zones.push({ text: r.pick(NAMES.living), rect: rect(cx0, Dk, cx1, D), dims: true, role: "living" });
  great.zones.push({ text: r.chance(0.3) ? "HALL" : "", rect: hall, dims: false, role: "hall" });

  let garage: Room | null = null, laundry: Room | null = null;
  let gFront = D;
  if (variant === "garage") {
    // A utility strip (back: pantry or half bath; front: laundry; between: a drop zone open to the core), then the garage.
    const Wu = r.step(7 * F, 9 * F);
    const ux0 = cx1, ux1 = cx1 + Wu;
    const bd = r.step(5 * F, 7 * F), ld = r.step(7 * F, 10 * F);
    const backKey = pantryAt ? "half" : r.pick(["half", "pantry"]);
    const bk = add(backKey, backKey === "half" ? "half" : "pantry", [rect(ux0, 0, ux1, bd)]);
    bk.zones.push({ text: bk.name, rect: bk.rects[0], dims: false });
    const mid = D - bd - ld;
    const lTop = mid >= 3 * F ? D - ld : bd;
    laundry = add("laundry", "laundry", [rect(ux0, lTop, ux1, D)]);
    laundry.zones.push({ text: laundry.name, rect: laundry.rects[0], dims: r.chance(0.5) });
    if (mid >= 3 * F) great.rects.push(rect(ux0, bd, ux1, lTop));
    const Wg = r.step(20 * F, 24 * F), Dg = r.step(20 * F, 24 * F);
    const proj = r.chance(0.5) ? 0 : r.step(2 * F, 8 * F);
    gFront = D + proj;
    garage = add("garage", "garage", [rect(ux1, gFront - Dg, ux1 + Wg, gFront)]);
    garage.zones.push({ text: garage.name, rect: garage.rects[0], dims: true });
  } else {
    // The master wing: the bedroom at the back; its bath and closet at the front.
    const Wm = r.step(14 * F, 18 * F);
    const fd = r.step(8 * F, 12 * F);
    const Dm = D - fd;
    if (Dm < 12 * F || Dm > 21 * F) return null;
    const mx0 = cx1, mx1 = cx1 + Wm;
    const mb = add("master", "master", [rect(mx0, 0, mx1, Dm)]);
    mb.zones.push({ text: mb.name, rect: mb.rects[0], dims: true });
    const bw = r.step(8 * F, Math.min(10 * F, Wm - 5 * F));
    const bathFirst = r.chance(0.5);
    const bathR = bathFirst ? rect(mx0, Dm, mx0 + bw, D) : rect(mx1 - bw, Dm, mx1, D);
    const wicR = bathFirst ? rect(mx0 + bw, Dm, mx1, D) : rect(mx0, Dm, mx1 - bw, D);
    const mbath = add("mbath", "mbath", [bathR]);
    mbath.zones.push({ text: mbath.name, rect: bathR, dims: r.chance(0.5) });
    const wic = add("wic", "wic", [wicR]);
    wic.zones.push({ text: wic.name, rect: wicR, dims: false });
  }

  // Porches: the front one along the core, sometimes a back patio. Often set into the house (the front or back wall
  // steps back across the whole core for it): the little walls either side of it line up with the inside walls
  // between the core and the rooms beside it — outside walls in line with inside ones, as on the user's Stafford plan.
  const porches: Porch[] = [];
  const insetFront = r.chance(0.45) ? r.step(2 * F, 6 * F) : 0;
  const backPatio = r.chance(0.55);
  const insetBack = backPatio && r.chance(0.35) ? r.step(3 * F, 8 * F) : 0;
  const living = great.zones.find((z) => z.role === "living")!;
  if (insetFront && living.rect.y1 - living.rect.y0 - insetFront >= 9 * F) {
    great.rects = great.rects.flatMap((q) => subRect(q, rect(cx0, D - insetFront, cx1, D)));
    living.rect = rect(living.rect.x0, living.rect.y0, living.rect.x1, D - insetFront);
    porches.push({ name: r.pick(NAMES.porch), x0: cx0, x1: cx1, wallY: D - insetFront, depth: insetFront + r.step(0, 3 * F), dir: 1, inset: insetFront });
  } else {
    const pw = Math.min(Wc - 2 * F, r.step(8 * F, 20 * F));
    const px0 = cx0 + r.step(F, Math.max(F, Wc - pw - F));
    porches.push({ name: r.pick(NAMES.porch), x0: px0, x1: px0 + pw, wallY: D, depth: r.step(5 * F, 8 * F), dir: 1 });
  }
  if (backPatio) {
    const kz = great.zones.filter((z) => z.rect.y0 === 0);
    if (insetBack && kz.every((z) => z.rect.y1 - insetBack >= 8 * F)) {
      // (Not with a pantry in the core's back corner: the patio would cut into it.)
      if (!rooms.some((rm) => rm.type === "pantry" && rm.rects.some((q) => q.y0 === 0 && q.x0 >= cx0 && q.x1 <= cx1))) {
        great.rects = great.rects.flatMap((q) => subRect(q, rect(cx0, 0, cx1, insetBack)));
        for (const z of kz) z.rect = rect(z.rect.x0, insetBack, z.rect.x1, z.rect.y1);
        porches.push({ name: r.pick(NAMES.patio), x0: cx0, x1: cx1, wallY: insetBack, depth: insetBack + r.step(0, 4 * F), dir: -1, inset: insetBack });
      }
    }
    if (porches.length < 2) {
      const bw2 = Math.min(Wc - 2 * F, r.step(10 * F, 18 * F));
      const bx0 = cx0 + r.step(F, Math.max(F, Wc - bw2 - F));
      porches.push({ name: r.pick(NAMES.patio), x0: bx0, x1: bx0 + bw2, wallY: 0, depth: r.step(8 * F, 12 * F), dir: -1 });
    }
  }

  // Bump-outs off the back (and the bedroom wing's front): a bay of the room itself, or a little room of its own
  // (an office, a sitting room) — then the wall between it and the room it opens off is an inside wall running on
  // in line with the outside wall either side of it.
  for (let k = 0; k < (r.chance(0.6) ? r.int(1, 2) : 0); k++) {
    const back = r.chance(0.7);
    const edge = back ? 0 : D;
    const hosts = rooms.filter(
      (rm) =>
        ["bed", "master", "great", "flex"].includes(rm.type) &&
        rm.attach === undefined &&
        (back || rm.rects.every((q) => q.x1 <= cx0)) &&
        rm.rects.some((q) => (back ? q.y0 === 0 : q.y1 === D) && q.x1 - q.x0 >= 12 * F),
    );
    if (!hosts.length) break;
    const host = r.pick(hosts);
    const hq = host.rects.filter((q) => (back ? q.y0 === 0 : q.y1 === D) && q.x1 - q.x0 >= 12 * F).sort((a, b) => b.x1 - b.x0 - (a.x1 - a.x0))[0];
    const bw = r.step(8 * F, Math.min(14 * F, hq.x1 - hq.x0 - 4 * F)), bd = r.step(4 * F, 10 * F);
    const bx0 = hq.x0 + r.step(2 * F, Math.max(2 * F, hq.x1 - hq.x0 - bw - 2 * F));
    const b = back ? rect(bx0, -bd, bx0 + bw, 0) : rect(bx0, D, bx0 + bw, D + bd);
    // Clear of the porches and any bump already out there.
    const hitsPorch = porches.some((p) => p.wallY === edge || (p.inset && (back ? p.dir < 0 : p.dir > 0)) ? p.x0 < b.x1 + 2 * F && p.x1 > b.x0 - 2 * F : false);
    if (hitsPorch || rooms.some((rm) => rm.rects.some((q) => q.x0 < b.x1 + 2 * F && q.x1 > b.x0 - 2 * F && (back ? q.y1 <= 0 : q.y0 >= D)))) continue;
    if (r.chance(0.55) && host.type !== "great") {
      const nook = add("bump", "flex", [b]);
      nook.attach = host.id;
      nook.zones.push({ text: nook.name, rect: b, dims: r.chance(0.5) });
    } else host.rects.push(b);
  }

  // ---- the walls: wherever the room changes across a rectangle's edge ----
  const extSize: Size = r.chance(0.35) ? "2x6" : "2x4";
  const drawn = {
    // Drawn the stud's depth, like nearly every real plan (2x4 = 3½", 2x6 = 5½"); now and then a bit fatter.
    // (Sheathing/siding is its own line outside — the skin.)
    ext: extSize === "2x6" ? r.pick([5.5, 5.5, 5.5, 5.5, 5.5, 5.5, 6]) : r.pick([3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 4]),
    int4: r.pick([3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 4, 4.5]),
    int6: r.pick([5.5, 5.5, 5.5, 5.5, 5.5, 5.5, 6]),
  };
  const garageExt: Size = extSize === "2x6" && r.chance(0.5) ? "2x4" : extSize;
  const garageWall: Size = r.chance(0.3) ? "2x6" : "2x4";
  const wet = new Set<string>();
  const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const roomAt = (x: number, y: number) => {
    for (const rm of rooms) for (const q of rm.rects) if (x > q.x0 && x < q.x1 && y > q.y0 && y < q.y1) return rm.id;
    return OUT;
  };
  const xs = [...new Set(rooms.flatMap((rm) => rm.rects.flatMap((q) => [q.x0, q.x1])))].sort((a, b) => a - b);
  const ys = [...new Set(rooms.flatMap((rm) => rm.rects.flatMap((q) => [q.y0, q.y1])))].sort((a, b) => a - b);
  type Piece = { horiz: boolean; c: number; s0: number; s1: number; a: number; b: number };
  const pieces: Piece[] = [];
  const e = 0.5;
  for (const y of ys)
    for (let i = 0; i + 1 < xs.length; i++) {
      const m = (xs[i] + xs[i + 1]) / 2, a = roomAt(m, y - e), b = roomAt(m, y + e);
      if (a !== b) pieces.push({ horiz: true, c: y, s0: xs[i], s1: xs[i + 1], a, b });
    }
  for (const x of xs)
    for (let i = 0; i + 1 < ys.length; i++) {
      const m = (ys[i] + ys[i + 1]) / 2, a = roomAt(x - e, m), b = roomAt(x + e, m);
      if (a !== b) pieces.push({ horiz: false, c: x, s0: ys[i], s1: ys[i + 1], a, b });
    }
  // Merge pieces in a line with the same rooms on both sides: one wall, corner to corner.
  pieces.sort((p, q) => +p.horiz - +q.horiz || p.c - q.c || p.s0 - q.s0);
  const merged: Piece[] = [];
  for (const p of pieces) {
    const l = merged[merged.length - 1];
    if (l && l.horiz === p.horiz && l.c === p.c && l.s1 === p.s0 && l.a === p.a && l.b === p.b) l.s1 = p.s1;
    else merged.push({ ...p });
  }
  // Wet walls: some baths and laundries get one 2x6 wall (the plumbing).
  for (const rm of rooms) {
    if (!["bath", "mbath", "half", "laundry"].includes(rm.type) || !r.chance(0.5)) continue;
    const nb = merged.filter((p) => (p.a === rm.id || p.b === rm.id) && p.a !== OUT && p.b !== OUT);
    if (nb.length) {
      const p = r.pick(nb);
      wet.add(pairKey(p.a, p.b));
    }
  }
  const gid = garage?.id ?? -99;
  const runs: Run[] = merged.map((p, id) => {
    const ext = p.a === OUT || p.b === OUT;
    const withGarage = p.a === gid || p.b === gid;
    // The house-to-garage wall is an interior wall (the user's rule); the garage's outside walls are exterior.
    const size: Size = ext ? (withGarage ? garageExt : extSize) : withGarage ? garageWall : wet.has(pairKey(p.a, p.b)) ? "2x6" : "2x4";
    const t = ext ? (size === extSize ? drawn.ext : size === "2x6" ? drawn.int6 : drawn.int4) : size === "2x6" ? drawn.int6 : drawn.int4;
    return {
      id,
      a: p.horiz ? [p.s0, p.c] : [p.c, p.s0],
      b: p.horiz ? [p.s1, p.c] : [p.c, p.s1],
      horiz: p.horiz,
      sides: [p.a, p.b],
      kind: ext ? "ext" : "int",
      size,
      t,
    };
  });

  // A porch's little walls drawn fatter now and then (the user's Stafford stub: drawn 5½", taken off as Ext 2x6).
  for (const p of porches) {
    if (!p.inset || !r.chance(0.35)) continue;
    for (const q of runs)
      if (!q.horiz && q.kind === "ext" && (q.a[0] === p.x0 || q.a[0] === p.x1) && Math.min(q.a[1], q.b[1]) >= Math.min(p.wallY, p.wallY + p.dir * p.inset) - 0.5 && Math.max(q.a[1], q.b[1]) <= Math.max(p.wallY, p.wallY + p.dir * p.inset) + 0.5) {
        q.size = "2x6";
        q.t = drawn.int6;
      }
  }

  // ---- doors and windows ----
  const openings: Opening[] = [];
  const at = (p: Pt) => runs.filter((q) => (q.a[0] === p[0] && q.a[1] === p[1]) || (q.b[0] === p[0] && q.b[1] === p[1]));
  /** How far from a wall's end an opening must stay: past the wall it meets there, plus a little. */
  const clear = (run: Run, end: Pt, extra: number) => Math.max(0, ...at(end).filter((q) => q.id !== run.id && q.horiz !== run.horiz).map((q) => q.t / 2)) + extra;
  const len = (q: Run) => (q.horiz ? q.b[0] - q.a[0] : q.b[1] - q.a[1]);
  const free = (q: Run, s0: number, s1: number, gap: number) => openings.every((o) => o.run !== q.id || s1 + gap <= o.s0 || o.s1 + gap <= s0);
  const between = (a: number, b: number) => runs.filter((q) => (q.sides[0] === a && q.sides[1] === b) || (q.sides[0] === b && q.sides[1] === a));
  const minDim = (rm: Room) => Math.min(...rm.rects.map((q) => Math.min(q.x1 - q.x0, q.y1 - q.y0)));
  const placeOn = (cands: Run[], w: number, type: Opening["type"], extra: number, prefer: "end" | "center" | "any", into?: number): Opening | null => {
    for (const q of r.shuffle([...cands])) {
      const L = len(q), c0 = clear(q, q.a, extra), c1 = clear(q, q.b, extra);
      const lo = c0, hi = L - c1 - w;
      if (hi < lo) continue;
      const tries: [number, boolean][] = [];
      if (prefer === "end") {
        const k = r.pick([0, 2, 4, 6]);
        tries.push([lo + k, true], [hi - k, false]);
        if (r.chance(0.5)) tries.reverse();
      } else if (prefer === "center") tries.push([Math.round((lo + hi) / 2 / 2) * 2, r.chance(0.5)]);
      for (let k = 0; k < 6; k++) tries.push([lo + Math.round((r.f() * (hi - lo)) / 2) * 2, r.chance(0.5)]);
      for (const [s0, nearA] of tries) {
        if (s0 < lo || s0 > hi || !free(q, s0, s0 + w, 8)) continue;
        const o: Opening = { run: q.id, s0, s1: s0 + w, type, into, hingeAtS0: nearA };
        openings.push(o);
        return o;
      }
    }
    return null;
  };
  const door = (from: number, to: number, w: number, prefer: "end" | "center" | "any" = "end") => {
    const toRoom = rooms[to];
    // A door swings into the room it opens to — unless that room is too small for it (a closet): then out.
    const into = to === OUT ? from : minDim(toRoom) >= w + 6 ? to : from;
    return placeOn(between(from, to), w, "door", 3, prefer, into);
  };
  const byType = (t: RoomType) => rooms.filter((rm) => rm.type === t);
  const need: (Opening | null)[] = [];
  for (const rm of rooms) {
    if (rm.id === great.id || rm.type === "garage") continue;
    if (rm.attach !== undefined) {
      need.push(door(rm.attach, rm.id, r.pick([28, 30, 32]), "any") ?? door(rm.attach, rm.id, 24, "any"));
      continue;
    }
    if (rm.type === "closet") {
      const bed = rooms.find((b) => b.type === "bed" && between(b.id, rm.id).length);
      // Reach-in closets: often bifold doors across most of the closet.
      const longest = bed ? Math.max(...between(bed.id, rm.id).map(len)) : 0;
      const bi = [48, 60, 72].filter((w) => w <= longest - 14);
      if (bed && bi.length && r.chance(0.55)) {
        const o = placeOn(between(bed.id, rm.id), r.pick(bi), "door", 3, "center", bed.id);
        if (o) o.bifold = true;
        need.push(o);
      } else need.push(bed ? door(bed.id, rm.id, r.pick([24, 30, 30, 36])) : null);
    } else if (rm.type === "wic" && variant === "garage") need.push(door(byType("mbath")[0].id, rm.id, r.pick([24, 28, 30])));
    else if (rm.type === "wic") need.push(door(byType("master")[0].id, rm.id, r.pick([28, 30])));
    else if (rm.type === "mbath") need.push(door(byType("master")[0].id, rm.id, r.pick([28, 30, 32])));
    else if (rm.type === "laundry" && variant === "garage") need.push(door(great.id, rm.id, r.pick([30, 32])) ?? door(great.id, rm.id, 28, "any"));
    else need.push(door(great.id, rm.id, rm.type === "bed" || rm.type === "master" ? r.pick([30, 32, 32]) : rm.type === "linen" || rm.type === "pantry" ? r.pick([18, 24]) : r.pick([28, 30])));
  }
  // Outside doors: the front door under the porch, a back door, the garage.
  const frontY = porches[0].wallY;
  const frontWall = runs.filter((q) => q.horiz && q.a[1] === frontY && q.sides.includes(great.id) && q.sides.includes(OUT));
  const p0 = porches[0];
  const underPorch = frontWall.filter((q) => q.a[0] < p0.x1 - 40 && q.b[0] > p0.x0 + 40);
  need.push(placeOn(underPorch.length ? underPorch : frontWall, r.pick([36, 36, 36, 42]), "door", 6, "center", great.id));
  const backY = porches.find((p) => p.dir < 0 && p.inset)?.wallY ?? 0;
  const backWall = runs.filter((q) => q.horiz && q.a[1] === backY && q.sides.includes(great.id) && q.sides.includes(OUT));
  if (r.chance(0.7)) placeOn(backWall, r.pick([32, 36]), "door", 6, "any", great.id);
  if (garage && laundry) {
    need.push(door(garage.id, laundry.id, r.pick([32, 36])));
    const gf = runs.filter((q) => q.horiz && q.a[1] === gFront && q.sides.includes(garage!.id) && q.sides.includes(OUT));
    const inner = garage.rects[0].x1 - garage.rects[0].x0 - drawn.ext;
    if (inner >= 2 * 108 + 30 && r.chance(0.5)) {
      need.push(placeOn(gf, 108, "garage", 10, "end"));
      need.push(placeOn(gf, 108, "garage", 10, "end"));
    } else need.push(placeOn(gf, r.pick([192, 192, 180]), "garage", 10, "center"));
  }
  if (need.some((o) => !o)) return null;

  // Windows on outside walls.
  const winFor: Partial<Record<RoomType, () => number[]>> = {
    great: () => Array.from({ length: r.int(3, 5) }, () => r.pick([36, 36, 48, 60, 72])),
    bed: () => Array.from({ length: r.int(1, 2) }, () => r.pick([30, 36, 36])),
    master: () => Array.from({ length: r.int(2, 3) }, () => r.pick([36, 48])),
    bath: () => (r.chance(0.7) ? [r.pick([24, 30, 36])] : []),
    mbath: () => [r.pick([30, 36, 48])],
    half: () => (r.chance(0.5) ? [24] : []),
    laundry: () => (r.chance(0.5) ? [30] : []),
    garage: () => (r.chance(0.6) ? [r.pick([30, 36])] : []),
    flex: () => (r.chance(0.7) ? [r.pick([30, 36])] : []),
  };
  for (const rm of rooms) {
    const list = winFor[rm.type]?.() ?? [];
    const walls = runs.filter((q) => q.sides.includes(rm.id) && q.sides.includes(OUT) && !(rm.type === "garage" && q.a[1] === gFront && q.horiz));
    for (const w of list) placeOn(walls, w, "window", 12, r.chance(0.5) ? "center" : "any");
  }

  // Cased openings (no door, a header over it — "CASED OPNG", "6070 ARCH"): into a den or office, a master bath, a
  // walk-in closet, a laundry. The wall still runs through it in the answer key, as through any door.
  const typeOf = new Map(rooms.map((q) => [q.id, q.type]));
  for (const o of openings) {
    if (o.type !== "door" || o.bifold) continue;
    const [s1, s2] = runs[o.run].sides.map((x) => typeOf.get(x));
    const pair = (a: RoomType, b: RoomType) => (s1 === a && s2 === b) || (s1 === b && s2 === a);
    // (Round 2026-11-21, rooms: more openings with no door — the user's rule: no door = the same room.)
    const p = pair("great", "flex") ? 0.8 : pair("bed", "flex") || pair("master", "flex") ? 0.5 : pair("master", "mbath") || pair("mbath", "wic") ? 0.45 : pair("great", "laundry") ? 0.3 : pair("great", "pantry") ? 0.3 : 0;
    if (!p || !r.chance(p)) continue;
    o.cased = true;
    // Wider when the wall has room, clear of its other openings.
    const q = runs[o.run], len = q.horiz ? q.b[0] - q.a[0] : q.b[1] - q.a[1], want = r.pick([36, 48, 60, 72, 96]);
    const c = (o.s0 + o.s1) / 2, n0 = c - want / 2, n1 = c + want / 2;
    if (n0 > 8 && n1 < len - 8 && !openings.some((x) => x !== o && x.run === o.run && x.s0 < n1 + 6 && x.s1 > n0 - 6)) (o.s0 = n0), (o.s1 = n1);
  }
  // Other doors — they still close the room off (a door = a separate room, whatever kind): pocket doors sliding into
  // the wall, barn doors sliding along its face, pairs of doors. Each needs clear wall beside it (or a wider opening).
  for (const o of openings) {
    if (o.type !== "door" || o.bifold || o.cased) continue;
    const q = runs[o.run];
    if (q.kind !== "int") continue;
    const L0 = len(q), w = o.s1 - o.s0;
    const room = (a: number, b: number) => a > 6 && b < L0 - 6 && !openings.some((x) => x !== o && x.run === o.run && x.s0 < b + 4 && x.s1 > a - 4);
    const k = r.f();
    if (k < 0.14 && w >= 24) {
      // Slides away from the hinge side into the wall: needs a door's width of plain wall there.
      const toward = o.hingeAtS0 ? 1 : -1; // (away from the hinge corner, into the plain wall on the latch side)
      if (toward > 0 ? room(o.s1, o.s1 + w + 2) : room(o.s0 - w - 2, o.s0)) (o.style = "pocket"), (o.slide = toward);
    } else if (k < 0.22 && w >= 28) {
      if (room(o.s1, o.s1 + w + 4)) (o.style = "barn"), (o.slide = 1);
      else if (room(o.s0 - w - 4, o.s0)) (o.style = "barn"), (o.slide = -1);
    } else if (k < 0.34 && [q.sides[0], q.sides[1]].every((x) => ["great", "flex", "master", "bed", "mbath", "wic", "laundry"].includes(typeOf.get(x) ?? ""))) {
      // (Wider than the single door it replaces: moved along the wall to where there's room, nearest first.)
      const want = r.pick([48, 60, 60, 72]);
      const at = Array.from({ length: Math.max(0, Math.floor((L0 - want - 16) / 2)) }, (_, i) => 8 + i * 2).sort((x, y) => Math.abs(x - o.s0) - Math.abs(y - o.s0)).find((a) => room(a, a + want) && a >= clear(q, q.a, 3) && a + want <= L0 - clear(q, q.b, 3));
      if (at !== undefined) (o.s0 = at), (o.s1 = at + want), (o.style = "double");
    }
  }
  const L: Layout = { rooms, runs, openings, porches, extSize, variant, diags: [] };
  if (r.chance(0.7)) chamfer(L, r);
  if (r.chance(0.35)) chamferOutside(L, r);
  return L;
}

/**
 * Cuts one or two small rooms' corners at 45° (the corner pantry the wall finder always misses): the two inside
 * walls meeting at a corner of the small room, both shared with the same bigger room, are shortened and joined by
 * a 45° wall; the small room's door moves into it.
 */
function chamfer(L: Layout, r: Rng) {
  const { rooms, runs, openings } = L;
  const same = (p: Pt, q: Pt) => Math.abs(p[0] - q[0]) < 0.01 && Math.abs(p[1] - q[1]) < 0.01;
  let made = 0;
  for (const rm of r.shuffle(rooms.filter((q) => ["pantry", "closet", "wic", "linen", "laundry", "half"].includes(q.type) && q.rects.length === 1))) {
    if (made >= (r.chance(0.3) ? 2 : 1)) break;
    const R = rm.rects[0], w = R.x1 - R.x0, h = R.y1 - R.y0;
    for (const C of r.shuffle([[R.x0, R.y0], [R.x1, R.y0], [R.x0, R.y1], [R.x1, R.y1]] as Pt[])) {
      const here = runs.filter((q) => same(q.a, C) || same(q.b, C));
      if (here.length !== 2) continue;
      const hz = here.find((q) => q.horiz), vt = here.find((q) => !q.horiz);
      if (!hz || !vt || hz.kind !== "int" || vt.kind !== "int") continue;
      const other = hz.sides.find((x) => x !== rm.id);
      if (!hz.sides.includes(rm.id) || !vt.sides.includes(rm.id) || other === undefined || other === OUT || !vt.sides.includes(other)) continue;
      // Each wall must run from C along the small room's side.
      const hDir = same(hz.a, C) ? 1 : -1, vDir = same(vt.a, C) ? 1 : -1;
      const intoRx = C[0] === R.x0 ? 1 : -1, intoRy = C[1] === R.y0 ? 1 : -1;
      if (hDir !== intoRx || vDir !== intoRy) continue;
      const hLen = hz.b[0] - hz.a[0], vLen = vt.b[1] - vt.a[1];
      // Often tight: the 45° wall barely longer than a 2' door and its trim (a few inches each side), like real ones.
      const tight = r.chance(0.45), tightDoor = r.pick([24, 24, 28]);
      const c = tight
        ? (tightDoor + r.pick([4, 5, 6, 7, 8])) / Math.SQRT2
        : r.pick([30, 36, 42, 48].filter((x) => x <= Math.min(w, h) - 14 && x <= hLen - 8 && x <= vLen - 8));
      if (!c || c > Math.min(w, h) - 14 || c > hLen - 8 || c > vLen - 8) continue;
      // Nothing but this room's own door may sit within the cut.
      const near = (q: Run, o: Opening) => (same(q.a, C) ? o.s0 < c + 4 : o.s1 > (q.horiz ? hLen : vLen) - c - 4);
      const inCut = openings.filter((o) => (runs[o.run] === hz && near(hz, o)) || (runs[o.run] === vt && near(vt, o)));
      if (inCut.some((o) => o.type !== "door")) continue;
      // The room keeps a way in: its door moves to the 45° wall.
      for (const o of inCut) openings.splice(openings.indexOf(o), 1);
      for (const [q, dir] of [[hz, hDir], [vt, vDir]] as [Run, number][]) {
        if (same(q.a, C)) {
          q.a = q.horiz ? [q.a[0] + c, q.a[1]] : [q.a[0], q.a[1] + c];
          for (const o of openings) if (runs[o.run] === q) (o.s0 -= c), (o.s1 -= c);
        } else q.b = q.horiz ? [q.b[0] - c, q.b[1]] : [q.b[0], q.b[1] - c];
        void dir;
      }
      const P1: Pt = [C[0] + intoRx * c, C[1]], P2: Pt = [C[0], C[1] + intoRy * c];
      const t = Math.max(hz.t, vt.t), len = c * Math.SQRT2;
      const dw = tight ? tightDoor : r.pick([24, 28, 30, 32].filter((x) => x <= len - 8));
      const d: Diag = { a: P1, b: P2, t, size: hz.size, kind: "int", sides: [rm.id, other], tri: [C, P1, P2] };
      if (dw) {
        const s0 = (len - dw) / 2;
        d.door = { s0, s1: s0 + dw, into: r.chance(0.7) ? rm.id : other, hingeAtS0: r.chance(0.5) };
      }
      L.diags.push(d);
      made++;
      break;
    }
  }
}

/**
 * An outside corner of the house cut at 45°, usually with a window in it (a kitchen sink corner, a breakfast nook):
 * the two outside walls are shortened and joined by a 45° outside wall; the corner goes to the yard.
 */
function chamferOutside(L: Layout, r: Rng) {
  const { rooms, runs, openings, porches } = L;
  const same = (p: Pt, q: Pt) => Math.abs(p[0] - q[0]) < 0.01 && Math.abs(p[1] - q[1]) < 0.01;
  for (const rm of r.shuffle(rooms.filter((q) => ["great", "bed", "master", "flex"].includes(q.type)))) {
    for (const R of rm.rects)
      for (const C of r.shuffle([[R.x0, R.y0], [R.x1, R.y0], [R.x0, R.y1], [R.x1, R.y1]] as Pt[])) {
        const here = runs.filter((q) => same(q.a, C) || same(q.b, C));
        if (here.length !== 2) continue;
        const hz = here.find((q) => q.horiz), vt = here.find((q) => !q.horiz);
        if (!hz || !vt || hz.kind !== "ext" || vt.kind !== "ext" || !hz.sides.includes(rm.id) || !vt.sides.includes(rm.id)) continue;
        const intoRx = C[0] === R.x0 ? 1 : -1, intoRy = C[1] === R.y0 ? 1 : -1;
        if ((same(hz.a, C) ? 1 : -1) !== intoRx || (same(vt.a, C) ? 1 : -1) !== intoRy) continue;
        const hLen = hz.b[0] - hz.a[0], vLen = vt.b[1] - vt.a[1];
        const c = r.pick([24, 30, 36, 42, 48].filter((x) => x <= Math.min(R.x1 - R.x0, R.y1 - R.y0) / 2 && x <= hLen - 24 && x <= vLen - 24));
        if (!c) continue;
        // Not where a porch meets the house.
        if (porches.some((p) => Math.abs(p.wallY - C[1]) < 1 && p.x0 < C[0] + c + 24 && p.x1 > C[0] - c - 24)) continue;
        const near = (q: Run, o: Opening) => (same(q.a, C) ? o.s0 < c + 4 : o.s1 > (q.horiz ? hLen : vLen) - c - 4);
        const inCut = openings.filter((o) => (runs[o.run] === hz && near(hz, o)) || (runs[o.run] === vt && near(vt, o)));
        if (inCut.some((o) => o.type !== "window")) continue;
        for (const o of inCut) openings.splice(openings.indexOf(o), 1);
        for (const q of [hz, vt]) {
          if (same(q.a, C)) {
            q.a = q.horiz ? [q.a[0] + c, q.a[1]] : [q.a[0], q.a[1] + c];
            for (const o of openings) if (runs[o.run] === q) (o.s0 -= c), (o.s1 -= c);
          } else q.b = q.horiz ? [q.b[0] - c, q.b[1]] : [q.b[0], q.b[1] - c];
        }
        const P1: Pt = [C[0] + intoRx * c, C[1]], P2: Pt = [C[0], C[1] + intoRy * c];
        const len = c * Math.SQRT2, ww = r.pick([24, 30, 36].filter((x) => x <= len - 10));
        const d: Diag = { a: P1, b: P2, t: Math.max(hz.t, vt.t), size: hz.size, kind: "ext", sides: [rm.id, OUT], tri: [C, P1, P2] };
        if (ww && r.chance(0.75)) d.win = { s0: (len - ww) / 2, s1: (len + ww) / 2 };
        L.diags.push(d);
        return;
      }
  }
}
