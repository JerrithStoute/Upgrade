/**
 * Plan lab, step 2: Find area and Find walls on the test sheets, as the app runs them.
 *
 *   npx tsx scripts/plan-lab/run.mts <run name> [shard] [shards]
 *
 * Reads test-plans/_lab/sheets.json (from pick.mts: file, page, unitsPerFoot), and for each sheet:
 *   - Find area clicked every 3' across the drawing: every distinct room it returns (area, outline,
 *     how many clicks gave it), and what each click gave — so two runs compare click by click;
 *   - Find walls clicked on ~30 wall lines: what each found (walls, length, thickness, ext/int);
 *   - a picture with the rooms and walls drawn over the sheet.
 * Writes test-plans/_lab/runs/<run name>/<sheet>.json and .png. A sheet already done is skipped.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { extractSegments, type DoorSwing, type FillShape } from "../../src/app/(app)/projects/[id]/takeoff/[planId]/_components/pdf-vectors";
// LAB_CANDIDATE=1 runs the candidate copy (scripts/plan-lab/candidate) instead of the app's Find area.
const { findRoom } = (process.env.LAB_CANDIDATE ? await import("./candidate/room-detect") : await import("../../src/lib/room-detect")) as typeof import("../../src/lib/room-detect");
import { findWalls } from "../../src/lib/wall-detect";

const LAB = join(process.cwd(), "test-plans", "_lab");
const [runName = "base", shardS = "0", shardsS = "1"] = process.argv.slice(2);
const shard = Number(shardS);
const shards = Number(shardsS);
const outDir = join(LAB, "runs", runName);
mkdirSync(outDir, { recursive: true });

type Sheet = { id: string; file: string; page: number; upf: number };
const sheets = (JSON.parse(readFileSync(join(LAB, "sheets.json"), "utf8")) as Sheet[]).filter((_, i) => i % shards === shard);

// Each sheet in a process of its own, given 15 minutes: a click that never comes back can't be
// stopped from inside (that sheet is noted "too slow" — a bug to look into).
if (!process.env.RUN_ONE) {
  const { spawnSync } = await import("child_process");
  for (const [k, sh] of sheets.entries()) {
    if (existsSync(join(outDir, `${sh.id}.json`))) continue;
    const res = spawnSync(process.execPath, [...process.execArgv, process.argv[1], runName, shardS, shardsS], {
      env: { ...process.env, RUN_ONE: sh.id },
      timeout: 900_000,
      encoding: "utf8",
    });
    if (res.error || res.status !== 0) {
      writeFileSync(join(outDir, `${sh.id}.json`), JSON.stringify({ sheet: sh, tooSlow: true, error: res.error ? "over 15 minutes" : `exit ${res.status}: ${(res.stderr ?? "").slice(-300)}` }));
      console.log(`${k + 1}/${sheets.length} ${sh.id}: TOO SLOW or failed`);
    } else process.stdout.write(`${k + 1}/${sheets.length} ${res.stdout}`);
  }
    process.exit(0);
}
for (const sh of sheets) {
  if (sh.id !== process.env.RUN_ONE) continue;
  const out = join(outDir, `${sh.id}.json`);
  const t0 = Date.now();
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(join(process.cwd(), "test-plans", sh.file))), verbosity: 0 });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(sh.page);
    const fills: FillShape[] = [];
    const swings: DoorSwing[] = [];
    const segs = await extractSegments(pdfjs as never, page as never, undefined, fills, swings);
    const upf = sh.upf;

    // Where the drawing is: the middle of the line work (skip the title block's edge strip).
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < segs.length; i += 4) {
      xs.push(segs[i], segs[i + 2]);
      ys.push(segs[i + 1], segs[i + 3]);
    }
    xs.sort((a, b) => a - b);
    ys.sort((a, b) => a - b);
    const q = (a: number[], f: number) => a[Math.floor(a.length * f)] ?? 0;
    const box = { x0: q(xs, 0.02), y0: q(ys, 0.02), x1: q(xs, 0.98), y1: q(ys, 0.98) };

    // Find area, every 3'.
    const step = 3 * upf;
    const clicks: Record<string, string> = {};
    const rooms: { sf: number; outline: number[][]; clicks: number }[] = [];
    const roomKey = new Map<string, number>();
    let areaMs = 0;
    for (let y = box.y0 + step / 2; y < box.y1; y += step)
      for (let x = box.x0 + step / 2; x < box.x1; x += step) {
        const ta = performance.now();
        const r = findRoom(segs, [x, y], { unitsPerFoot: upf, fills, doors: process.env.LAB_CANDIDATE ? swings : undefined } as never);
        areaMs += performance.now() - ta;
        const at = `${Math.round(x)},${Math.round(y)}`;
        if (!r.ok) {
          clicks[at] = r.reason;
          continue;
        }
        const key = `${r.areaSf.toFixed(1)}:${Math.round(r.outline[0][0])}:${Math.round(r.outline[0][1])}`;
        let k = roomKey.get(key);
        if (k === undefined) {
          k = rooms.length;
          roomKey.set(key, k);
          rooms.push({ sf: +r.areaSf.toFixed(1), outline: r.outline.map(([a, b]) => [+a.toFixed(1), +b.toFixed(1)]), clicks: 0 });
        }
        rooms[k].clicks++;
        clicks[at] = r.areaSf.toFixed(1);
      }

    // Find walls on ~30 lines: the longest straight lines across or down the drawing, spread out.
    const longs: [number, number, number][] = [];
    for (let i = 0; i < segs.length; i += 4) {
      const [x1, y1, x2, y2] = [segs[i], segs[i + 1], segs[i + 2], segs[i + 3]];
      const len = Math.hypot(x2 - x1, y2 - y1);
      const [mx, my] = [(x1 + x2) / 2, (y1 + y2) / 2];
      if (len >= 3 * upf && mx > box.x0 && mx < box.x1 && my > box.y0 && my < box.y1) longs.push([mx, my, len]);
    }
    longs.sort((a, b) => b[2] - a[2]);
    const picks: [number, number][] = [];
    for (const [mx, my] of longs) {
      if (picks.length >= 30) break;
      if (picks.every(([px, py]) => Math.hypot(px - mx, py - my) > 4 * upf)) picks.push([mx, my]);
    }
    const walls: { click: number[]; ok: boolean; reason?: string; kind?: string; thicknessIn?: number; lengthFt?: number; runs?: number[][][] }[] = [];
    for (const c of picks) {
      const r = findWalls(segs, c, { unitsPerFoot: upf, clickRadius: 0.5 * upf });
      walls.push(
        r.ok
          ? { click: c.map((n) => +n.toFixed(1)), ok: true, kind: r.kind, thicknessIn: +r.thicknessIn.toFixed(2), lengthFt: +r.lengthFt.toFixed(1), runs: r.runs.map((run) => run.map(([a, b]) => [+a.toFixed(1), +b.toFixed(1)])) }
          : { click: c.map((n) => +n.toFixed(1)), ok: false, reason: r.reason },
      );
    }

    // The picture: rooms (each its color, area at its middle click) and found walls (exterior red,
    // interior blue).
    const S = 1800 / Math.max(box.x1 - box.x0, box.y1 - box.y0);
    const cv = createCanvas(Math.ceil((box.x1 - box.x0) * S), Math.ceil((box.y1 - box.y0) * S));
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx as never, viewport: page.getViewport({ scale: S, offsetX: -box.x0 * S, offsetY: -box.y0 * S }) } as never).promise;
    const tx = (x: number) => (x - box.x0) * S;
    const ty = (y: number) => (y - box.y0) * S;
    const colors = ["230,25,75", "60,180,75", "255,136,0", "145,30,180", "70,192,192", "240,50,230", "154,99,36", "0,128,128", "128,0,0", "0,90,255"];
    rooms
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.clicks >= 2)
      .sort((a, b) => b.r.sf - a.r.sf)
      .forEach(({ r }, n) => {
        const col = colors[n % colors.length];
        ctx.fillStyle = `rgba(${col},0.18)`;
        ctx.strokeStyle = `rgb(${col})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        r.outline.forEach(([x, y], k) => (k ? ctx.lineTo(tx(x), ty(y)) : ctx.moveTo(tx(x), ty(y))));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        const cx = r.outline.reduce((a, p) => a + p[0], 0) / r.outline.length;
        const cy = r.outline.reduce((a, p) => a + p[1], 0) / r.outline.length;
        ctx.fillStyle = `rgb(${col})`;
        ctx.font = "bold 18px Arial";
        ctx.fillText(`${Math.round(r.sf)}`, tx(cx) - 14, ty(cy));
      });
    for (const w of walls) {
      if (!w.ok || !w.runs) continue;
      ctx.strokeStyle = w.kind === "exterior" ? "rgba(220,0,0,0.75)" : "rgba(0,80,255,0.75)";
      ctx.lineWidth = 4;
      for (const run of w.runs) {
        ctx.beginPath();
        run.forEach(([x, y], k) => (k ? ctx.lineTo(tx(x), ty(y)) : ctx.moveTo(tx(x), ty(y))));
        ctx.stroke();
      }
    }
    writeFileSync(join(outDir, `${sh.id}.png`), await cv.encode("png"));
    writeFileSync(out, JSON.stringify({ sheet: sh, box, step, rooms, clicks, walls, areaMsPerClick: +(areaMs / Math.max(1, Object.keys(clicks).length)).toFixed(1), ms: Date.now() - t0 }));
    console.log(`${sh.id}: ${rooms.length} rooms, ${walls.filter((w) => w.ok).length}/${walls.length} wall clicks, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  } catch (e) {
    writeFileSync(out, JSON.stringify({ sheet: sh, error: e instanceof Error ? e.message : String(e) }));
    console.log(`${sh.id}: error ${e instanceof Error ? e.message : e}`);
  } finally {
    await task.destroy();
  }
}
console.log(`shard ${shard}: done`);
