"use client";

import { useEffect, useRef, useState } from "react";
import type { Align } from "@/lib/revisions";
import { renderSheetGray } from "./plan-canvas";

/** Where the two revisions differ, for flagging takeoff shapes that sit on a change. */
export type DiffMap = { scale: number; changedIn: (x: number, y: number, w: number, h: number) => number };

const INK = 170;
/** Highest resolution the overlay draws at (pixels per page unit). */
const MAX_SCALE = 3;

/**
 * The previous revision laid over this sheet: red = only on the old sheet (removed),
 * blue = only on the new one (added), gray = on both. `align` lines the old sheet
 * up first. Redrawn (debounced) when zooming; `onDiff` gets the changed spots.
 */
export function RevisionOverlay({
  oldSrc,
  newSrc,
  align,
  zoom,
  size,
  fade,
  onDiff,
}: {
  oldSrc: { url: string; kind: string; page: number };
  newSrc: { url: string; kind: string; page: number };
  align: Align;
  zoom: number;
  size: { w: number; h: number };
  fade: number;
  onDiff?: (d: DiffMap | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const cb = useRef(onDiff);
  useEffect(() => {
    cb.current = onDiff;
  });

  const key = `${oldSrc.url}#${oldSrc.page}|${newSrc.url}#${newSrc.page}|${align.a},${align.b},${align.tx},${align.ty}`;
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const want = Math.min(MAX_SCALE, Math.max(0.5, zoom * (window.devicePixelRatio || 1)));
        const now = await renderSheetGray(newSrc.url, newSrc.kind, newSrc.page, want);
        const old = await renderSheetGray(oldSrc.url, oldSrc.kind, oldSrc.page, now.scale);
        if (cancelled) return;
        const { w, h } = now.gray;
        const s = now.scale;
        // The old sheet, lined up and drawn at the new sheet's resolution.
        const lined = document.createElement("canvas");
        lined.width = w;
        lined.height = h;
        const lc = lined.getContext("2d", { willReadFrequently: true })!;
        lc.fillStyle = "white";
        lc.fillRect(0, 0, w, h);
        const k = s / old.scale;
        lc.setTransform(align.a * k, align.b * k, -align.b * k, align.a * k, align.tx * s, align.ty * s);
        lc.drawImage(old.canvas, 0, 0);
        const od = lc.getImageData(0, 0, w, h).data;
        const n = now.gray.data;
        const o = new Uint8Array(w * h);
        for (let i = 0; i < o.length; i++) o[i] = Math.round(od[i * 4] * 0.3 + od[i * 4 + 1] * 0.59 + od[i * 4 + 2] * 0.11);

        // A line moved by a pixel isn't a change: compare against the other sheet's ink grown by one pixel.
        const grow = (g: Uint8Array) => {
          const out = new Uint8Array(w * h);
          for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
              if (g[y * w + x] >= INK) continue;
              for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                  const yy = y + dy;
                  const xx = x + dx;
                  if (yy >= 0 && yy < h && xx >= 0 && xx < w) out[yy * w + xx] = 1;
                }
            }
          return out;
        };
        const nearOld = grow(o);
        const nearNew = grow(n);

        const out = new ImageData(w, h);
        const px = out.data;
        const sum = new Uint32Array((w + 1) * (h + 1));
        for (let y = 0; y < h; y++) {
          let run = 0;
          for (let x = 0; x < w; x++) {
            const i = y * w + x;
            const isNew = n[i] < INK;
            const isOld = o[i] < INK;
            const added = isNew && !nearOld[i];
            const removed = isOld && !nearNew[i];
            let r = 255,
              g = 255,
              b = 255,
              a = 0;
            if (added) [r, g, b, a] = [29, 78, 216, 255];
            else if (removed) [r, g, b, a] = [220, 38, 38, 255];
            else if (isNew || isOld) [r, g, b, a] = [148, 163, 184, 255];
            px[i * 4] = r;
            px[i * 4 + 1] = g;
            px[i * 4 + 2] = b;
            px[i * 4 + 3] = a;
            run += added || removed ? 1 : 0;
            sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + run;
          }
        }
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.putImageData(out, 0, 0);
        setState("ready");
        cb.current?.({
          scale: s,
          changedIn: (x, y, ww, hh) => {
            // Page units → overlay pixels, clipped to the sheet.
            const x0 = Math.max(0, Math.min(w, Math.floor(x * s)));
            const y0 = Math.max(0, Math.min(h, Math.floor(y * s)));
            const x1 = Math.max(0, Math.min(w, Math.ceil((x + ww) * s)));
            const y1 = Math.max(0, Math.min(h, Math.ceil((y + hh) * s)));
            const W = w + 1;
            return sum[y1 * W + x1] - sum[y0 * W + x1] - sum[y1 * W + x0] + sum[y0 * W + x0];
          },
        });
      } catch {
        if (!cancelled) {
          setState("error");
          cb.current?.(null);
        }
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // `key` covers the sources and the lining-up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, zoom]);

  return (
    <>
      {/* White wash so the overlay's colors read clearly over the plan */}
      <div className="pointer-events-none absolute left-0 top-0 bg-white" style={{ width: size.w * zoom, height: size.h * zoom, opacity: fade * 0.9 }} />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute left-0 top-0"
        style={{ width: size.w * zoom, height: size.h * zoom, opacity: state === "ready" ? fade : 0 }}
      />
      {state !== "ready" ? (
        <div className="pointer-events-none absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-md bg-white/90 px-3 py-1.5 text-xs text-slate-600 shadow">
          {state === "error" ? "Couldn't draw the comparison" : "Comparing with the previous revision…"}
        </div>
      ) : null}
    </>
  );
}
