// Throwaway (deleted after): the Bryant joist area drawn over the plan, each joist piece colored by bay, rows numbered.
import { readFileSync, writeFileSync } from "fs";
import sharp from "sharp";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { runAsCompany } from "../src/lib/tenant";
import { db } from "../src/lib/db";
import { loadConditions } from "../src/lib/takeoff-data";
import { extractSegments } from "../src/app/(app)/projects/[id]/takeoff/[planId]/_components/pdf-vectors";
import { framingMembers, memberThickness, parsePoints, parseArcs, shapePath } from "../src/lib/takeoff";
const out = process.argv[2];
await runAsCompany("cmuojxc0f0000ith83uj8xuds", async () => {
  const conds = await loadConditions("cmv8bcwl10001itv4n3a3ip1h");
  const byId = new Map(conds.map((c) => [c.id, c]));
  const c = conds.find((x) => x.measurements.some((m) => m.id === "cmvavwjot003pit68i3yq58as"))!;
  const m = c.measurements.find((x) => x.id === "cmvavwjot003pit68i3yq58as")!;
  const upf = m.sheet.unitsPerFoot!;
  const pts = parsePoints(m.points);
  const members = framingMembers(shapePath(c.type, { points: pts, arcs: parseArcs(m.points) }), m.angle, (c.spacing / 12) * upf, memberThickness(c.memberSize, upf, c.memberSizeRef?.widthIn));
  const rows = c.bandSplit.pieces.get(m.id) ?? [];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const [x0, y0, x1, y1] = [Math.min(...xs) - 20, Math.min(...ys) - 20, Math.max(...xs) + 20, Math.max(...ys) + 20];
  const k = 1100 / (x1 - x0);
  const T = (x: number, y: number) => `${((x - x0) * k).toFixed(1)},${((y - y0) * k).toFixed(1)}`;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync("uploads/cmuojxc0f0000ith83uj8xuds/cmv8bcwl10001itv4n3a3ip1h/d5e27c22-4899-426e-9048-55ca1ea1a944.pdf")) }).promise;
  const segs = await extractSegments(pdfjs as never, (await doc.getPage(1)) as never);
  let plan = "";
  for (let i = 0; i < segs.length; i += 4) {
    const [a, b, cc, d] = [segs[i], segs[i + 1], segs[i + 2], segs[i + 3]];
    if (Math.max(a, cc) < x0 || Math.min(a, cc) > x1 || Math.max(b, d) < y0 || Math.min(b, d) > y1) continue;
    plan += `<line x1="${((a - x0) * k).toFixed(1)}" y1="${((b - y0) * k).toFixed(1)}" x2="${((cc - x0) * k).toFixed(1)}" y2="${((d - y0) * k).toFixed(1)}"/>`;
  }
  const colors = ["#e11d48", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#ea580c", "#4f46e5"];
  const bayColor = new Map<string, string>();
  let j = "";
  rows.forEach((row, i) => {
    const [a, b] = members[i];
    row.forEach((p) => {
      if (!bayColor.has(p.section!)) bayColor.set(p.section!, colors[bayColor.size % colors.length]);
      const s = [a[0] + (b[0] - a[0]) * p.a, a[1] + (b[1] - a[1]) * p.a], e = [a[0] + (b[0] - a[0]) * p.b, a[1] + (b[1] - a[1]) * p.b];
      j += `<line x1="${T(s[0], s[1]).split(",")[0]}" y1="${T(s[0], s[1]).split(",")[1]}" x2="${T(e[0], e[1]).split(",")[0]}" y2="${T(e[0], e[1]).split(",")[1]}" stroke="${bayColor.get(p.section!)}" stroke-width="4" opacity="0.75"/>`;
      const mx = (s[0] + e[0]) / 2, my = (s[1] + e[1]) / 2;
      j += `<text x="${T(mx, my).split(",")[0]}" y="${+T(mx, my).split(",")[1] - 3}" font-size="11" fill="${bayColor.get(p.section!)}" font-family="Arial">${i}:${byId.get(p.owner)?.memberSize}${p.picked ? "✎" : ""}</text>`;
    });
  });
  const W = Math.round((x1 - x0) * k), H = Math.round((y1 - y0) * k);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="white"/><g stroke="#999" stroke-width="0.8">${plan}</g><polygon points="${pts.map((p) => T(p[0], p[1])).join(" ")}" fill="none" stroke="black" stroke-width="2"/>${j}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log(out, W, H);
});
await db.$disconnect();
