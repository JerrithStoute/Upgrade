/**
 * Plan lab: contact sheets of the picked sheets (test-plans/_lab/thumbs-<n>.png), 20 to a sheet, each
 * labeled with its number, job and scale — to check the picks are floor plans at the right scale.
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
const LAB = join(process.cwd(), "test-plans", "_lab");
const sheets = JSON.parse(readFileSync(join(LAB, "sheets.json"), "utf8")) as { id: string; file: string; page: number; upf: number; scaleFrom: string }[];
const W = 420, H = 300, COLS = 5, PER = 20;
for (let start = 0; start < sheets.length; start += PER) {
  const group = sheets.slice(start, start + PER);
  const cv = createCanvas(W * COLS, (H + 34) * Math.ceil(group.length / COLS));
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#ddd";
  ctx.fillRect(0, 0, cv.width, cv.height);
  for (const [i, sh] of group.entries()) {
    const [cx, cy] = [(i % COLS) * W, Math.floor(i / COLS) * (H + 34)];
    const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(join(process.cwd(), "test-plans", sh.file))), verbosity: 0 });
    try {
      const page = await (await task.promise).getPage(sh.page);
      const v = page.getViewport({ scale: 1 });
      const s = Math.min((W - 6) / v.width, (H - 6) / v.height);
      const pc = createCanvas(Math.round(v.width * s), Math.round(v.height * s));
      const pctx = pc.getContext("2d");
      pctx.fillStyle = "white";
      pctx.fillRect(0, 0, pc.width, pc.height);
      await page.render({ canvasContext: pctx as never, viewport: page.getViewport({ scale: s }) } as never).promise;
      ctx.drawImage(pc as never, cx + 3, cy + 3);
    } catch {
      /* left blank */
    } finally {
      await task.destroy();
    }
    ctx.fillStyle = "black";
    ctx.font = "bold 13px Arial";
    ctx.fillText(`#${start + i} ${sh.file.split("/")[0]} p${sh.page}`.slice(0, 48), cx + 4, cy + H + 14);
    ctx.font = "12px Arial";
    ctx.fillText(sh.scaleFrom.slice(0, 56), cx + 4, cy + H + 29);
  }
  writeFileSync(join(LAB, `thumbs-${start / PER}.png`), await cv.encode("png"));
  console.log("thumbs", start / PER);
}
