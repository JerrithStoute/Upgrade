/** Renders a made-up plan's PDF (no answer key) to a PNG: npx tsx scripts/plan-lab/synth/look.mts <pdf> <out.png> [zoom x0 y0 x1 y1 in page units] */
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
const [file, out, ...box] = process.argv.slice(2);
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0, standardFontDataUrl: path.resolve("node_modules/pdfjs-dist/standard_fonts") + "/" }).promise;
const page = await doc.getPage(1);
const v1 = page.getViewport({ scale: 1 });
const [x0, y0, x1, y1] = box.length ? box.map(Number) : [0, 0, v1.width, v1.height];
const S = 1800 / Math.max(x1 - x0, y1 - y0);
const cv = createCanvas(Math.ceil((x1 - x0) * S), Math.ceil((y1 - y0) * S)), ctx = cv.getContext("2d");
ctx.fillStyle = "white"; ctx.fillRect(0, 0, cv.width, cv.height);
await page.render({ canvasContext: ctx as never, viewport: page.getViewport({ scale: S, offsetX: -x0 * S, offsetY: -y0 * S }) } as never).promise;
writeFileSync(out, cv.toBuffer("image/png"));
