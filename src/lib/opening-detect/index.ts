/**
 * One click inside an opening in a wall (a doorway, a window, a cased opening): where it starts and ends, jamb to jamb.
 * Openings / Headers takes it off with one click instead of two (the user, 2026-11-25).
 *
 * Looking along the wall through the click: the wall is two faces (lines running the same way, 2"–14" apart, the click
 * between them). Each face stops at the opening — both on the same side, within a couple of inches — and goes on past
 * it. Where they stop on each side is a jamb. Or on a side, a wall crossing the opening's end (a doorway running into
 * the wall beside it): its face is the jamb. Something drawn in the opening (a window's lines, a door) is in it, not
 * the wall: a line running jamb to jamb doesn't close it. Nothing found: null — the two clicks still work.
 */

export type Pt = [number, number];

export type OpeningFind = { a: Pt; b: Pt; widthIn: number };
type Found = OpeningFind & { t: number; crossed: number };

type L = { x1: number; y1: number; x2: number; y2: number; len: number; ang: number };

const DEG = Math.PI / 180;

type Opts = {
  unitsPerFoot: number;
  minIn?: number;
  maxFt?: number;
  maxPostIn?: number;
  /** The sheet's door swings (pdf-vectors): where the walls can't tell, a door's swing can — hinge to its shut end. */
  swings?: { x: number; y: number; r: number; a?: Pt; b?: Pt }[];
};

/**
 * The opening clicked — with its pair, when another opening runs on in the same wall past only a mullion or a post
 * (2½" or less between: two windows mulled together, double doors meeting at a post): one opening, one header (the
 * user, 2026-11-25: "one click should take the whole pair"). Past a stub of wall, they stay two.
 */
export function findOpening(segments: Float32Array | number[], click: Pt, opts: Opts): OpeningFind | null {
  const first = findOne(segments, click, opts) ?? bySwing(segments, click, opts);
  if (!first) return null;
  const inch = opts.unitsPerFoot / 12;
  const maxPost = (opts.maxPostIn ?? 3.5) * inch;
  let { a, b } = first;
  const L0 = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / L0, uy = (b[1] - a[1]) / L0;
  const along = (p: Pt) => (p[0] - first.a[0]) * ux + (p[1] - first.a[1]) * uy;
  const across = (p: Pt) => Math.abs((p[0] - first.a[0]) * -uy + (p[1] - first.a[1]) * ux);
  let [lo, hi] = [0, L0];
  for (let k = 0; k < 4; k++) {
    let grew = false;
    for (const dir of [1, -1]) {
      // (Into the next one, 6" past the end: past the post, if there's a post and an opening beyond it.)
      const s = dir > 0 ? hi + maxPost + 6 * inch : lo - maxPost - 6 * inch;
      const q: Pt = [first.a[0] + ux * s, first.a[1] + uy * s];
      const n = findOne(segments, q, opts);
      // (The same wall: its faces as far apart, the same center line, both stopping on both sides of it.)
      if (!n || n.crossed || Math.abs(n.t - first.t) > 0.5 * inch || across(n.a) > 0.5 * inch || across(n.b) > 0.5 * inch) continue;
      const [n0, n1] = [along(n.a), along(n.b)].sort((x, y) => x - y);
      const post = dir > 0 ? n0 - hi : lo - n1;
      // (A mullion drawn as one line: they share it, a hair either way.)
      if (post < -1 * inch || post > maxPost + 0.25 * inch) continue;
      if (dir > 0) hi = n1;
      else lo = n0;
      grew = true;
    }
    if (!grew) break;
  }
  a = [first.a[0] + ux * lo, first.a[1] + uy * lo];
  b = [first.a[0] + ux * hi, first.a[1] + uy * hi];
  return { a, b, widthIn: (hi - lo) / inch };
}

/**
 * A door the walls can't tell (a wall drawn as one line, a tub's edge as its jamb, a tag and a dimension's tick in the
 * doorway — 2026-11-25, Gaspard's master bath): its swing. Shut, the door runs from the hinge along the doorway to the
 * swing's other end — the click on that line (within 6"), inside it. Door-sized swings only (18" to 4').
 */
function bySwing(segments: Float32Array | number[], click: Pt, opts: Opts): Found | null {
  const upf = opts.unitsPerFoot, inch = upf / 12;
  let best: Found | null = null;
  let bestD = Infinity;
  for (const w of opts.swings ?? []) {
    if (!w.a || !w.b || w.r < 1.5 * upf || w.r > 4 * upf) continue;
    for (const e of [w.a, w.b]) {
      const L = Math.hypot(e[0] - w.x, e[1] - w.y);
      if (!(L > 0)) continue;
      const ux = (e[0] - w.x) / L, uy = (e[1] - w.y) / L;
      const t = (click[0] - w.x) * ux + (click[1] - w.y) * uy;
      const d = Math.abs((click[0] - w.x) * -uy + (click[1] - w.y) * ux);
      if (t < 0.05 * L || t > 0.95 * L || d > 6 * inch || d >= bestD) continue;
      // (Not the open end: the door's slab is drawn along it, from the hinge — shut, it's the other.)
      let slab = false;
      for (let i = 0; i + 3 < segments.length && !slab; i += 4) {
        const x1 = segments[i], y1 = segments[i + 1], x2 = segments[i + 2], y2 = segments[i + 3];
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len < 0.5 * L || Math.abs(((x2 - x1) * uy - (y2 - y1) * ux) / len) > 0.05) continue;
        const off = (x: number, y: number) => Math.abs((x - w.x) * -uy + (y - w.y) * ux);
        const al = (x: number, y: number) => (x - w.x) * ux + (y - w.y) * uy;
        if (off(x1, y1) <= 2 * inch && off(x2, y2) <= 2 * inch && Math.min(al(x1, y1), al(x2, y2)) <= 3 * inch && Math.max(al(x1, y1), al(x2, y2)) >= 0.6 * L) slab = true;
      }
      if (slab) continue;
      bestD = d;
      best = { a: [w.x, w.y], b: [e[0], e[1]], widthIn: L / inch, t: 0, crossed: 0 };
    }
  }
  return best;
}

function findOne(segments: Float32Array | number[], click: Pt, opts: Opts): Found | null {
  const upf = opts.unitsPerFoot;
  if (!(upf > 0)) return null;
  const inch = upf / 12;
  const minW = (opts.minIn ?? 12) * inch;
  // (16' at most: wider takes a beam, and isn't what this is for.)
  const maxW = (opts.maxFt ?? 16) * upf;
  const R = maxW + 2 * upf;
  const [cx, cy] = click;

  // The lines around the click.
  const near: L[] = [];
  for (let i = 0; i + 3 < segments.length; i += 4) {
    const x1 = segments[i], y1 = segments[i + 1], x2 = segments[i + 2], y2 = segments[i + 3];
    if (Math.max(x1, x2) < cx - R || Math.min(x1, x2) > cx + R || Math.max(y1, y2) < cy - R || Math.min(y1, y2) > cy + R) continue;
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (!(len >= 0.5 * inch)) continue;
    let ang = Math.atan2(y2 - y1, x2 - x1);
    if (ang < 0) ang += Math.PI;
    if (ang >= Math.PI) ang -= Math.PI;
    near.push({ x1, y1, x2, y2, len, ang });
  }
  const distTo = (l: L) => {
    const dx = l.x2 - l.x1, dy = l.y2 - l.y1;
    const t = Math.max(0, Math.min(1, ((cx - l.x1) * dx + (cy - l.y1) * dy) / (l.len * l.len)));
    return Math.hypot(cx - (l.x1 + t * dx), cy - (l.y1 + t * dy));
  };

  // The walls' directions here: long lines within 4', the most line first.
  const dirs: { ang: number; w: number }[] = [];
  for (const l of near) {
    if (l.len < 2 * upf || distTo(l) > 4 * upf) continue;
    const d = dirs.find((q) => Math.abs(Math.sin(q.ang - l.ang)) < Math.sin(2 * DEG));
    if (d) d.w += l.len;
    else dirs.push({ ang: l.ang, w: l.len });
  }
  dirs.sort((p, q) => q.w - p.w);

  // (The click on a line running another way, a foot on past it both ways — or between two such lines a wall's thickness
  // apart: it's on a wall crossing there, not in an opening, and what was found runs across that wall or a room. A door's
  // leaf starts at its jamb: it runs one way only. Checked for each one found, so the right one isn't crowded out.)
  const onWallAcross = (fa: number) => {
    const offs: number[] = [];
    for (const l of near) {
      if (Math.abs(Math.sin(l.ang - fa)) < Math.sin(10 * DEG) || distTo(l) > 14 * inch) continue;
      const lx = (l.x2 - l.x1) / l.len, ly = (l.y2 - l.y1) / l.len;
      const t = (cx - l.x1) * lx + (cy - l.y1) * ly;
      if (t < upf || l.len - t < upf) continue;
      const d = (cx - l.x1) * -ly + (cy - l.y1) * lx;
      if (Math.abs(d) <= 1.5 * inch) return true;
      offs.push(d);
    }
    return offs.some((p) => p < 0 && offs.some((q) => q > 0 && q - p >= 2 * inch && q - p <= 14 * inch));
  };
  // (A wall running through it — two lines another way, a wall's thickness apart, each going on past it both sides: it
  // runs across that wall, not along it. 2026-11-25, Gaspard: clicked beside a window's tags, 21" across the wall.)
  const wallThrough = (p: Pt, q: Pt) => {
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (!(L > 0)) return false;
    const ux = (q[0] - p[0]) / L, uy = (q[1] - p[1]) / L;
    const hits: { ang: number; at: number; r: number }[] = [];
    for (const l of near) {
      if (Math.abs(Math.sin(l.ang - Math.atan2(uy, ux))) < Math.sin(30 * DEG) || l.len < upf) continue;
      const dx = l.x2 - l.x1, dy = l.y2 - l.y1;
      const den = ux * dy - uy * dx;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((l.x1 - p[0]) * dy - (l.y1 - p[1]) * dx) / den;
      const v = ((l.x1 - p[0]) * uy - (l.y1 - p[1]) * ux) / den;
      if (t < inch || t > L - inch || v * l.len < 6 * inch || (1 - v) * l.len < 6 * inch) continue;
      hits.push({ ang: l.ang, at: t, r: 0 });
    }
    return hits.some((h, i) => hits.some((k, j) => j !== i && Math.abs(Math.sin(h.ang - k.ang)) < 0.05 && Math.abs(h.at - k.at) * Math.abs(Math.sin(h.ang - Math.atan2(uy, ux))) >= 1.5 * inch && Math.abs(h.at - k.at) <= 16 * inch));
  };
  let best: (Found & { off: number }) | null = null;
  // (The hatching's opening — where it is; the faces' — exactly where its jambs are, when they agree.)
  let hatchBest: (Found & { off: number; lo: number; hi: number; spacing: number; ang: number; inBand: boolean }) | null = null;
  for (const { ang } of dirs.slice(0, 3)) {
    const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
    const rc = cx * nx + cy * ny, sc = cx * ux + cy * uy;
    // Lines this way within 14" of the click, as [offset across, start, end along].
    type P = { r: number; s0: number; s1: number };
    const par: P[] = [];
    // Lines square to it (a jamb's cap, a wall's face crossing the end): [along, from, to across].
    const across: { s: number; r0: number; r1: number }[] = [];
    for (const l of near) {
      const sn = Math.abs(Math.sin(l.ang - ang));
      const a1 = l.x1 * ux + l.y1 * uy, a2 = l.x2 * ux + l.y2 * uy;
      const o1 = l.x1 * nx + l.y1 * ny, o2 = l.x2 * nx + l.y2 * ny;
      if (sn < Math.sin(2 * DEG)) {
        const r = (o1 + o2) / 2;
        if (Math.abs(r - rc) <= 14 * inch) par.push({ r, s0: Math.min(a1, a2), s1: Math.max(a1, a2) });
      } else if (sn > Math.sin(88 * DEG) && Math.abs(a1 - sc) <= maxW) across.push({ s: (a1 + a2) / 2, r0: Math.min(o1, o2), r1: Math.max(o1, o2) });
    }
    // Faces: lines at one offset (to 0.4"), drawn twice over or in pieces.
    par.sort((p, q) => p.r - q.r);
    const faces: P[][] = [];
    for (const p of par) {
      const f = faces[faces.length - 1];
      if (f && p.r - f[f.length - 1].r <= 0.4 * inch) f.push(p);
      else faces.push([p]);
    }
    // Each face around the click: where it stops before it and starts again after it (pieces 2"+ long — a wall, not a
    // tick). A line from there to there is drawn in the opening, not the wall; one running past either end, the wall
    // going on through — no opening in this face here.
    const gapOf = (pieces: P[]) => {
      // (A face drawn in short pieces — between hatch strokes, say — is one run where they meet, to a hair.)
      // (Only the pieces on either side of the click: one across it — a window's line, jamb to jamb — isn't joined in.)
      const f: P[] = [];
      // (Under a foot across it: a letter's stroke, a tag's outline — text in the opening, left out altogether. The
      // smallest window is 18". 2026-11-25, Gaspard's "AR" tags sit on the wall's faces.)
      const crossing = pieces.filter((p) => p.s0 < sc - 0.5 * inch && p.s1 > sc + 0.5 * inch && p.s1 - p.s0 >= 12 * inch);
      // (Dashes — three or more short pieces in a row, a few inches apart: a header or beam drawn above, dashed across an
      // opening — aren't wall. 2026-11-25, Gaspard's cased openings.)
      const shortP = pieces.filter((p) => p.s1 - p.s0 < 9 * inch).sort((x, y) => x.s0 - y.s0);
      const dashed = new Set<P>();
      for (let k = 0; k + 2 < shortP.length; k++) {
        const [d0, d1, d2] = [shortP[k], shortP[k + 1], shortP[k + 2]];
        const g1 = d1.s0 - d0.s1, g2 = d2.s0 - d1.s1;
        if (g1 >= 0.5 * inch && g1 <= 4 * inch && g2 >= 0.5 * inch && g2 <= 4 * inch) [d0, d1, d2].forEach((d) => dashed.add(d));
      }
      // (A dimension's mark on the face — a short piece under a foot, a tick through its middle, running on through a jamb
      // into the opening — is wall only up to the jamb. 2026-11-26, Jordan Williams: the AL cased opening's dimension.)
      const clip = (p: P): P => {
        if (p.s1 - p.s0 >= 12 * inch) return p;
        const tick = near.some((l) => {
          const sn = Math.abs(Math.sin(l.ang - ang));
          if (sn < Math.sin(30 * DEG) || sn > Math.sin(60 * DEG) || l.len > 8 * inch) return false;
          const ms = ((l.x1 + l.x2) / 2) * ux + ((l.y1 + l.y2) / 2) * uy, mr = ((l.x1 + l.x2) / 2) * nx + ((l.y1 + l.y2) / 2) * ny;
          if (Math.abs(mr - p.r) > inch || Math.abs(ms - (p.s0 + p.s1) / 2) > 1.5 * inch) return false;
          // (Through it, both ends well off the line — hatching runs from face to face, ending on them — and on its own.)
          const o1 = l.x1 * nx + l.y1 * ny - p.r, o2 = l.x2 * nx + l.y2 * ny - p.r;
          if (Math.sign(o1) === Math.sign(o2) || Math.min(Math.abs(o1), Math.abs(o2)) < 0.75 * inch) return false;
          return !near.some((k) => k !== l && Math.abs(Math.sin(k.ang - l.ang)) < Math.sin(3 * DEG) && Math.abs(k.len - l.len) < inch && Math.hypot((k.x1 + k.x2) / 2 - (l.x1 + l.x2) / 2, (k.y1 + k.y2) / 2 - (l.y1 + l.y2) / 2) > 0.5 * inch && Math.hypot((k.x1 + k.x2) / 2 - (l.x1 + l.x2) / 2, (k.y1 + k.y2) / 2 - (l.y1 + l.y2) / 2) <= 5 * inch);
        });
        if (!tick) return p;
        // (The jamb: a short line square across the wall partway along it — its cap, not a dimension line across the wall.)
        const cap = across.find((c) => c.s > p.s0 + 0.5 * inch && c.s < p.s1 - 0.5 * inch && c.r0 <= p.r + 0.5 * inch && c.r1 >= p.r - 0.5 * inch && c.r1 - c.r0 <= 14 * inch);
        if (!cap) return p;
        return cap.s < sc ? { ...p, s1: cap.s } : { ...p, s0: cap.s };
      };
      for (const p of pieces.filter((q) => !dashed.has(q) && !crossing.includes(q) && !(q.s0 < sc - 0.5 * inch && q.s1 > sc + 0.5 * inch)).map(clip).sort((x, y) => x.s0 - y.s0)) {
        const last = f[f.length - 1];
        if (last && p.s0 <= last.s1 + 0.3 * inch) last.s1 = Math.max(last.s1, p.s1);
        else f.push({ ...p });
      }
      let lo = -Infinity, hi = Infinity;
      for (const p of f) {
        if (p.s1 - p.s0 < 2 * inch) continue;
        if (p.s1 <= sc + 0.5 * inch && p.s1 > lo) lo = p.s1;
        if (p.s0 >= sc - 0.5 * inch && p.s0 < hi) hi = p.s0;
      }
      // (A line across the opening that ends on a line square across the wall — a post's or a jamb's cap — both ends:
      // the window between two posts, no wall line going on past them. 2026-11-25, Gaspard's windows with transoms.)
      const capAt = (v: number, r: number) => across.some((c) => Math.abs(c.s - v) <= 0.75 * inch && c.r0 <= r + 0.5 * inch && c.r1 >= r - 0.5 * inch);
      for (const p of crossing)
        if ((!Number.isFinite(lo) || !Number.isFinite(hi)) && capAt(p.s0, p.r) && capAt(p.s1, p.r) && p.s1 - p.s0 <= maxW) {
          lo = p.s0;
          hi = p.s1;
        }
      if (crossing.some((p) => p.s0 < lo - inch || p.s1 > hi + inch)) return null;
      // (A line across it is the window's when the wall picks up right where it stops, both ends: a stretch of wall run
      // to a corner, with the next piece in line far off, isn't one.)
      if (crossing.length && !crossing.some((p) => Math.abs(p.s0 - lo) <= 2 * inch && Math.abs(p.s1 - hi) <= 2 * inch)) return null;
      return { r: f.reduce((n, p) => n + p.r, 0) / f.length, lo, hi, runs: f, raw: pieces, drawnIn: crossing.length > 0 };
    };
    const gaps = faces.map(gapOf).filter((g): g is NonNullable<typeof g> => !!g && (Number.isFinite(g.lo) || Number.isFinite(g.hi)));

    // A hatched wall (most plans hatch their walls): the opening is where the hatching stops, on both sides of the click —
    // the click on the hatching itself is the wall, never an opening. (2026-11-25, Dickson: the wall's faces run straight
    // past its windows; the hatching is what stops at the jambs.)
    {
      const fr = faces.map((f) => f.reduce((n, p) => n + p.r, 0) / f.length);
      const strokes = near
        .map((l) => {
          const sn = Math.abs(Math.sin(l.ang - ang));
          // (Slanted, or square across: a wall at 45° is hatched square to it — 2026-11-25, Dickson's kitchen window.)
          // (Square across only on a wall at a slant itself: hatching is drawn at 45° to the sheet; on a square wall a line
          // square across it is a jamb, a cap, a wall meeting it.)
          if (sn < Math.sin(20 * DEG) || (sn > Math.sin(70 * DEG) && Math.abs(Math.sin(2 * ang)) < Math.sin(60 * DEG)) || l.len > 2 * upf) return null;
          const a1 = l.x1 * ux + l.y1 * uy, a2 = l.x2 * ux + l.y2 * uy, o1 = l.x1 * nx + l.y1 * ny, o2 = l.x2 * nx + l.y2 * ny;
          return { s0: Math.min(a1, a2), s1: Math.max(a1, a2), r0: Math.min(o1, o2), r1: Math.max(o1, o2), ang: l.ang };
        })
        .filter((h): h is NonNullable<typeof h> => !!h && Math.abs((h.s0 + h.s1) / 2 - sc) <= maxW);
      for (let i = 0; i < fr.length; i++)
        for (let j = i + 1; j < fr.length; j++) {
          const [r1, r2] = [fr[i], fr[j]];
          const t = r2 - r1;
          // (The band clicked, or one beside it: brick and the framing behind it, each hatched.)
          if (t < 2 * inch || t > 14 * inch || rc < r1 - 9 * inch || rc > r2 + 9 * inch) continue;
          const inBand = rc >= r1 - 0.5 * inch && rc <= r2 + 0.5 * inch;
          // (Beside it — brick beside the framing — only with another of the wall's lines past the click: not out in a room.)
          if (!inBand && !faces.some((f, k) => f.some((p) => p.s1 - p.s0 >= 2 * upf) && (rc < r1 ? fr[k] < rc && fr[k] >= rc - 9 * inch : fr[k] > rc && fr[k] <= rc + 9 * inch))) continue;
          // Its hatching: strokes from face to face (to a hair) — no face between these two that a stroke crosses.
          const band0 = strokes.filter((h) => Math.abs(h.r0 - r1) <= 0.6 * inch && Math.abs(h.r1 - r2) <= 0.6 * inch);
          // (Hatching runs all one way: a stroke another way across the band — a letter of a window's tag, "4⁰ 4⁰" — isn't
          // it. 2026-11-25, Hoa Le's kitchen window.)
          const angs = new Map<number, number>();
          for (const h of band0) angs.set(Math.round(h.ang / (3 * DEG)), (angs.get(Math.round(h.ang / (3 * DEG))) ?? 0) + 1);
          const main = [...angs.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
          const mainSet = main !== undefined ? band0.filter((h) => Math.abs(Math.round(h.ang / (3 * DEG)) - main) <= 1) : band0;
          // (Only a few strays: a band hatched two ways — a slanted wall's — keeps them all.)
          const band = band0.length >= 8 && mainSet.length >= 0.8 * band0.length ? mainSet : band0;
          if (band.length < 4) continue;
          if (band.some((h) => h.s0 <= sc && h.s1 >= sc)) {
            if (inBand) return null;
            continue;
          }
          let lo = -Infinity, hi = Infinity;
          for (const h of band) {
            if (h.s1 < sc && h.s1 > lo) lo = h.s1;
            if (h.s0 > sc && h.s0 < hi) hi = h.s0;
          }
          if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
          // (Hatching on both sides, a stroke every few inches: in a stretch of it, the gap is no wider than that.)
          const spacing = (() => {
            const c = band.map((h) => (h.s0 + h.s1) / 2).sort((x, y) => x - y);
            const d = c.slice(1).map((v, k) => v - c[k]).filter((v) => v > 0.3 * inch).sort((x, y) => x - y);
            return d.length ? d[Math.floor(d.length / 2)] : 6 * inch;
          })();
          if (hi - lo < Math.max(minW - 2 * spacing, 2 * spacing)) continue;
          // The jamb: the end of a line in the opening (the window's), or a line across the wall, within a stroke's
          // spacing in from where the hatching stops; else where it stops.
          const jamb = (edge: number, dir: number) => {
            let best = edge;
            let found = false;
            for (const p of par) {
              if (p.r <= r1 + 0.3 * inch || p.r >= r2 - 0.3 * inch) continue;
              const e = dir < 0 ? p.s0 : p.s1;
              if (Math.abs(e - edge) <= spacing + inch && (dir < 0 ? p.s1 > sc : p.s0 < sc) && (!found || Math.abs(e - edge) < Math.abs(best - edge))) {
                best = e;
                found = true;
              }
            }
            // (Nothing inside: a line square across the band — the window's frame, its jamb — where the wall stops.)
            for (const c of across) {
              if (c.r0 > r1 + 0.5 * inch || c.r1 < r2 - 0.5 * inch) continue;
              if (!found && Math.abs(c.s - edge) <= spacing + inch && (dir < 0 ? c.s < sc : c.s > sc)) {
                best = c.s;
                found = true;
              }
            }
            return best;
          };
          const a0 = jamb(lo, -1), b0 = jamb(hi, 1);
          const w = b0 - a0;
          if (w < minW || w > maxW) continue;
          const mid = (r1 + r2) / 2;
          // (Ahead of anything the faces give. Of two hatched bands side by side, the narrower opening: the framing's,
          // where the header goes — brick's runs on past it around the window's trim.)
          const off = w;
          if (hatchBest && off >= hatchBest.off) continue;
          if (onWallAcross(ang)) continue;
          if (wallThrough([ux * a0 + nx * mid, uy * a0 + ny * mid], [ux * b0 + nx * mid, uy * b0 + ny * mid])) continue;
        if (wallThrough([ux * lo + nx * mid, uy * lo + ny * mid], [ux * hi + nx * mid, uy * hi + ny * mid])) continue;
          const at = (v: number): Pt => [ux * v + nx * mid, uy * v + ny * mid];
          hatchBest = { a: at(a0), b: at(b0), widthIn: w / inch, off, t, crossed: 0, lo, hi, spacing, ang, inBand };
        }
    }
    for (let i = 0; i < gaps.length; i++)
      for (let j = i + 1; j < gaps.length; j++) {
        const [g1, g2] = [gaps[i], gaps[j]];
        const t = g2.r - g1.r;
        if (t < 2 * inch || t > 14 * inch || rc < g1.r - 1 * inch || rc > g2.r + 1 * inch) continue;
        // Each side: both faces stop there (within 2"), or a line square across the wall there (its cap, or the face of
        // a wall the opening runs into) — the nearest.
        const crossAt = (dir: number) => {
          let s = dir < 0 ? -Infinity : Infinity;
          for (const c of across)
            if (c.r0 <= g1.r + 0.5 * inch && c.r1 >= g2.r - 0.5 * inch && (dir < 0 ? c.s <= sc && c.s > s : c.s >= sc && c.s < s)) s = c.s;
          return s;
        };
        let crossed = 0;
        // (Faces stopping at different places: a scrap on one — a label's stroke, a tick — inside the opening isn't wall.
        // Its runs between there and where the other stops, up to 2' on: under 12" each, it stops where the other does.)
        const scrapsOnly = (g: (typeof gaps)[number], from: number, to: number) =>
          g.runs.every((p) => p.s1 <= Math.min(from, to) + 0.5 * inch || p.s0 >= Math.max(from, to) - 0.5 * inch || p.s1 - p.s0 < 12 * inch);
        const side = (a: number, b: number, dir: number) => {
          if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 2 * inch) return dir < 0 ? Math.max(a, b) : Math.min(a, b);
          if (Number.isFinite(a) && Number.isFinite(b)) {
            // The farther one is the jamb when the nearer face has only scraps out to it.
            const [nearG, nearV, farV] = (dir < 0 ? a > b : a < b) ? [g1, a, b] : [g2, b, a];
            const farOther = gaps.find((g) => g !== nearG && (g === g1 || g === g2))!;
            const farSide = dir < 0 ? farOther.runs.some((p) => Math.abs(p.s1 - farV) <= 2 * inch) : farOther.runs.some((p) => Math.abs(p.s0 - farV) <= 2 * inch);
            const nearMatch = (dir < 0 ? nearG.runs.filter((p) => p.s1 <= farV + 2 * inch) : nearG.runs.filter((p) => p.s0 >= farV - 2 * inch)).some((p) => (dir < 0 ? Math.abs(p.s1 - farV) : Math.abs(p.s0 - farV)) <= 2 * inch);
            if (Math.abs(farV - nearV) <= 24 * inch && farSide && nearMatch && scrapsOnly(nearG, nearV, farV)) return farV;
            // (Or a foot or less: a door's frame drawn on one face into the opening, its own piece from where the other face
            // stops — 2026-11-25, Gaspard's 2'-8" door.)
            if (Math.abs(farV - nearV) <= 12 * inch && farSide && nearG.raw.some((p) => (dir < 0 ? Math.abs(p.s0 - farV) <= 0.5 * inch && Math.abs(p.s1 - nearV) <= 0.5 * inch : Math.abs(p.s1 - farV) <= 0.5 * inch && Math.abs(p.s0 - nearV) <= 0.5 * inch))) return farV;
          }
          crossed++;
          const c = crossAt(dir);
          if (!Number.isFinite(c)) return NaN;
          // (A wall running into the opening's end is its jamb only where this wall's faces both stop at it — one
          // running on past it is a stretch of wall beside the opening, not the opening. 2026-11-25.)
          if (![a, b].every((v) => Number.isFinite(v) && Math.abs(v - c) <= t + 2 * inch)) return NaN;
          // (A face stopping short of the cross wall is still the jamb, the nearer one.)
          const own = [a, b].filter((v) => Number.isFinite(v) && (dir < 0 ? v > c : v < c));
          return own.length === 2 ? (dir < 0 ? Math.max(...own) : Math.min(...own)) : c;
        };
        let lo = side(g1.lo, g2.lo, -1), hi = side(g1.hi, g2.hi, 1);
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
        // (The click is inside the opening: a "jamb" right at it is the wall it's on, seen end-on — a window clicked,
        // read the wrong way.)
        if (sc - lo < 2 * inch || hi - sc < 2 * inch) continue;
        // A pocket door: its slab inside the wall past a jamb, about as long as the opening, between the pocket's own lines —
        // the opening runs on to where the pocket ends, wall to wall (the user, 2026-11-25: cover the whole pocket).
        {
          const w0 = hi - lo;
          const pocket = (j: number, dir: number) => {
            // (The slab: two lines an inch or so apart, alike, inside the wall — not a line of the wall's own.)
            const cand = par.filter((p) => p.r > g1.r + 0.3 * inch && p.r < g2.r - 0.3 * inch && p.s1 - p.s0 >= 0.6 * w0 && p.s1 - p.s0 <= 1.4 * w0 && (dir > 0 ? p.s0 <= j + 3 * inch && p.s1 >= j + 0.5 * w0 : p.s1 >= j - 3 * inch && p.s0 <= j - 0.5 * w0));
            const slab = cand.some((p) => cand.some((q) => q !== p && Math.abs(q.r - p.r) >= 0.4 * inch && Math.abs(q.r - p.r) <= 2 * inch && Math.abs(q.s0 - p.s0) <= inch && Math.abs(q.s1 - p.s1) <= inch));
            if (!slab) return j;
            const ends = [g1, g2].map((g) => {
              const piece = g.raw.find((p) => (dir > 0 ? Math.abs(p.s0 - j) <= inch : Math.abs(p.s1 - j) <= inch) && p.s1 - p.s0 >= 0.6 * w0 && p.s1 - p.s0 <= 1.4 * w0);
              return piece ? (dir > 0 ? piece.s1 : piece.s0) : NaN;
            });
            if (!ends.every(Number.isFinite) || Math.abs(ends[0] - ends[1]) > 2 * inch) return j;
            return dir > 0 ? Math.max(...ends) : Math.min(...ends);
          };
          const [plo, phi] = [pocket(lo, -1), pocket(hi, 1)];
          if (plo !== lo || phi !== hi) {
            lo = plo;
            hi = phi;
          }
        }
        // (A face drawn straight across — a window's lines on the faces, or the wall itself between two openings, which
        // looks the same: a window has its glass drawn down the middle, jamb to jamb, and no hatching; a wall, nothing
        // between its faces or its hatching. 2026-11-25: 1,143 of 2,554 clicks on solid wall came back an opening.)
        if (g1.drawnIn || g2.drawnIn) {
          const glass = par.some((p) => p.r > g1.r + 0.5 * inch && p.r < g2.r - 0.5 * inch && p.s0 >= lo - 2 * inch && p.s1 <= hi + 2 * inch && p.s1 - p.s0 >= 0.8 * (hi - lo));
          const hatch = near.some((l) => {
            const sn = Math.abs(Math.sin(l.ang - ang));
            if (sn < Math.sin(20 * DEG) || sn > Math.sin(70 * DEG) || l.len > 1.5 * (g2.r - g1.r) / sn + inch) return false;
            const m = [(l.x1 + l.x2) / 2, (l.y1 + l.y2) / 2], ms = m[0] * ux + m[1] * uy, mr = m[0] * nx + m[1] * ny;
            return ms > lo + inch && ms < hi - inch && mr > g1.r && mr < g2.r;
          });
          if (!glass || hatch) continue;
        }
        const w = hi - lo;
        // (Both ends walls crossing it, no jamb of its own: no wall around it there — nothing for a header.)
        if (crossed >= 2) continue;
        // (A jamb taken from a wall crossing the end: 8' at most — a doorway beside a wall, not across a room.)
        if (w < minW || w > (crossed ? Math.min(maxW, 8 * upf) : maxW)) continue;
        const mid = (g1.r + g2.r) / 2;
        // (The narrowest: a wider pair skipped a jamb — the lines a door or window is drawn with stop short of the wall.
        // A tie: the thicker pair, the wall's own faces.)
        // (Both faces stopping on both sides beats a wall crossing an end; then the thickest pair — the wall's own faces,
        // not a window's sill lines running a little past its jambs.)
        const off = crossed * 1e6 + Math.abs(rc - mid);
        if (best && off >= best.off) continue;
        if (onWallAcross(ang)) continue;
        const at = (s: number): Pt => [ux * s + nx * mid, uy * s + ny * mid];
        best = { a: at(lo), b: at(hi), widthIn: w / inch, off, t, crossed };
      }
  }
  if (hatchBest) {
    const h = hatchBest;
    const ux = Math.cos(h.ang), uy = Math.sin(h.ang);
    const sOf = (p: Pt) => p[0] * ux + p[1] * uy;
    const agree =
      best && best.crossed === 0 && Math.abs(Math.sin(Math.atan2(best.b[1] - best.a[1], best.b[0] - best.a[0]) - h.ang)) < 0.05 &&
      [sOf(best.a), sOf(best.b)].every((v) => v >= h.lo - 1.5 * inch && v <= h.hi + 1.5 * inch);
    // (A hatched band beside the click — not the one it's in — only when the click isn't in a wall of its own: brick
    // beside its framing. 2026-11-25, Giarratano: a bath door's 37" taken for a hatched wall 6" off, 103".)
    // (…or it's the same opening the faces found — most of the wider one shared: the hatching marks its jambs better.)
    const sameOpening = () => {
      if (!best || Math.abs(Math.sin(Math.atan2(best.b[1] - best.a[1], best.b[0] - best.a[0]) - h.ang)) > 0.05) return false;
      const [b0, b1] = [sOf(best.a), sOf(best.b)].sort((x, y) => x - y), [h0, h1] = [sOf(h.a), sOf(h.b)].sort((x, y) => x - y);
      return Math.min(b1, h1) - Math.max(b0, h0) >= 0.75 * Math.max(b1 - b0, h1 - h0);
    };
    if (!agree && (h.inBand || !best || sameOpening())) best = h;
  }
  if (!best) return null;
  return { a: best.a, b: best.b, widthIn: best.widthIn, t: best.t, crossed: best.crossed };
}
