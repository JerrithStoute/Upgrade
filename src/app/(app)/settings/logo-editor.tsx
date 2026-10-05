"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Crop, RotateCcw, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";

type Rect = { x: number; y: number; w: number; h: number };
type Handle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** Biggest the saved logo gets (pixels) — plenty for the menu and printouts. */
const MAX_OUT_W = 1200;
const MAX_OUT_H = 600;

/**
 * Crop and stretch a logo before saving it. Drag the box (or its edges and corners)
 * to crop, "Trim empty edges" cuts blank margins, and the round handles on the right
 * and bottom of the preview stretch it wider or taller (only ever as a rectangle).
 * The menu preview shows it in place. "Use this" hands back a PNG.
 */
export function LogoEditor({
  src,
  onDone,
  onCancel,
  photo,
}: {
  src: string;
  onDone: (file: File, url: string) => void;
  onCancel: () => void;
  /** A picture (the proposal cover), not a logo: crop only, saved as a JPG no wider than 2400 px. */
  photo?: boolean;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [sx, setSx] = useState(100);
  const [sy, setSy] = useState(100);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState<{ h: Handle; start: [number, number]; from: Rect } | null>(null);
  const frame = useRef<HTMLDivElement>(null);

  // Load the picture.
  useEffect(() => {
    const i = new Image();
    i.onload = () => {
      setImg(i);
      setCrop({ x: 0, y: 0, w: i.naturalWidth, h: i.naturalHeight });
    };
    i.src = src;
  }, [src]);

  // How the picture fits the editing area.
  const box = { w: 480, h: 240 };
  const fit = img ? Math.min(box.w / img.naturalWidth, box.h / img.naturalHeight, 4) : 1;
  const view = img ? { w: img.naturalWidth * fit, h: img.naturalHeight * fit } : box;

  // The cropped logo; stretching is shown by sizing it (and baked in by "Use this").
  const base = useMemo(() => (img && crop ? render(img, crop, 1, 1).toDataURL("image/png") : null), [img, crop]);

  const onDown = (h: Handle) => (e: React.PointerEvent) => {
    if (!crop) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    setDrag({ h, start: [e.clientX, e.clientY], from: crop });
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag;
    if (!d || !img) return;
    const dx = (e.clientX - d.start[0]) / fit;
    const dy = (e.clientY - d.start[1]) / fit;
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    let { x, y, w, h } = d.from;
    const min = 8;
    if (d.h === "move") {
      x = Math.max(0, Math.min(W - w, x + dx));
      y = Math.max(0, Math.min(H - h, y + dy));
    } else {
      if (d.h.includes("w")) {
        const nx = Math.max(0, Math.min(x + w - min, x + dx));
        w += x - nx;
        x = nx;
      }
      if (d.h.includes("e")) w = Math.max(min, Math.min(W - x, w + dx));
      if (d.h.includes("n")) {
        const ny = Math.max(0, Math.min(y + h - min, y + dy));
        h += y - ny;
        y = ny;
      }
      if (d.h.includes("s")) h = Math.max(min, Math.min(H - y, h + dy));
    }
    setCrop({ x, y, w, h });
  };
  const onUp = () => setDrag(null);

  const handleCls = "absolute h-3 w-3 rounded-sm border border-blue-700 bg-white";
  const handles: [Handle, string][] = [
    ["nw", "-left-1.5 -top-1.5 cursor-nwse-resize"],
    ["ne", "-right-1.5 -top-1.5 cursor-nesw-resize"],
    ["sw", "-bottom-1.5 -left-1.5 cursor-nesw-resize"],
    ["se", "-bottom-1.5 -right-1.5 cursor-nwse-resize"],
    ["n", "-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize"],
    ["s", "-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize"],
    ["w", "-left-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize"],
    ["e", "-right-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize"],
  ];

  return (
    <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        <Crop className="h-4 w-4" /> {photo ? "Crop your picture" : "Crop & stretch your logo"}
      </p>
      <p className="text-xs text-slate-600">
        {photo ? "Drag the box or its edges to keep the part you want." : "Drag the box or its edges to crop. Trim empty edges cuts blank margins so the logo fills its space."}
      </p>

      <div className="flex flex-wrap items-start gap-4">
        {/* Editing area: a checkerboard shows transparent parts */}
        <div
          className="grid place-items-center rounded-md border border-slate-300 p-2"
          style={{ width: box.w + 18, height: box.h + 18, background: "repeating-conic-gradient(#e2e8f0 0% 25%, #fff 0% 50%) 50% / 16px 16px" }}
        >
          {img && crop ? (
            <div ref={frame} className="relative touch-none select-none" style={{ width: view.w, height: view.h }} onPointerMove={onMove} onPointerUp={onUp}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" draggable={false} className="absolute inset-0 h-full w-full" />
              {/* Dim what's cropped away */}
              <div className="pointer-events-none absolute inset-0 bg-slate-900/40" style={{ clipPath: cutout(crop, fit, view) }} />
              <div
                className="absolute cursor-move border-2 border-blue-700"
                style={{ left: crop.x * fit, top: crop.y * fit, width: crop.w * fit, height: crop.h * fit }}
                onPointerDown={onDown("move")}
              >
                {handles.map(([h, cls]) => (
                  <span key={h} className={cn(handleCls, cls)} onPointerDown={onDown(h)} />
                ))}
              </div>
            </div>
          ) : (
            <span className="text-xs text-slate-500">Loading…</span>
          )}
        </div>

        <div className="w-56 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={!img}
              hidden={photo}
              onClick={() => img && setCrop(trimBounds(img))}
              className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
            >
              <Scissors className="h-3.5 w-3.5" /> Trim empty edges
            </button>
            <button
              type="button"
              disabled={!img}
              onClick={() => {
                if (!img) return;
                setCrop({ x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight });
                setSx(100);
                setSy(100);
              }}
              className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          </div>
        </div>
      </div>

      {/* Stretch: a round handle on the right (wider / narrower) and the bottom (taller / shorter) — never slanted */}
      {img && crop && base && !photo ? (
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Stretch — drag the dots{" "}
              <span className="font-normal normal-case text-slate-400">
                ({sx}% wide · {sy}% tall)
              </span>
            </p>
            <StretchBox src={base} crop={crop} sx={sx} sy={sy} onChange={(x, y) => (setSx(x), setSy(y))} />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">In the menu</p>
            <div className="flex h-16 w-52 items-center rounded-md border border-slate-200 bg-white px-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={base} alt="Logo as it will look" style={fitBox(crop.w * sx, crop.h * sy, 196, 52)} />
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!img || !crop || busy}
          onClick={async () => {
            if (!img || !crop) return;
            setBusy(true);
            const blob = await new Promise<Blob | null>((r) =>
              photo ? render(img, crop, 1, 1, [2400, 2400], "#fff").toBlob(r, "image/jpeg", 0.88) : render(img, crop, sx / 100, sy / 100).toBlob(r, "image/png"),
            );
            setBusy(false);
            if (!blob) return;
            const file = photo ? new File([blob], "cover.jpg", { type: "image/jpeg" }) : new File([blob], "logo.png", { type: "image/png" });
            onDone(file, URL.createObjectURL(blob));
          }}
          className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-40"
        >
          {busy ? "Preparing…" : "Use this"}
        </button>
        <button type="button" onClick={onCancel} className="text-xs text-slate-600 hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}

/** The cropped, stretched logo as a canvas (at most MAX_OUT_W × MAX_OUT_H, transparency kept). */
function render(img: HTMLImageElement, crop: Rect, sx: number, sy: number, max: [number, number] = [MAX_OUT_W, MAX_OUT_H], fill?: string) {
  let w = crop.w * sx;
  let h = crop.h * sy;
  const k = Math.min(1, max[0] / w, max[1] / h);
  w = Math.max(1, Math.round(w * k));
  h = Math.max(1, Math.round(h * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  // A JPG has no see-through parts: paint white behind them.
  if (fill) {
    g.fillStyle = fill;
    g.fillRect(0, 0, w, h);
  }
  g.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
  return c;
}

/** The smallest box around everything that isn't transparent or near-white. */
function trimBounds(img: HTMLImageElement): Rect {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;
  let x0 = W,
    y0 = H,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const blank = d[i + 3] < 16 || (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245);
      if (blank) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  if (x1 < 0) return { x: 0, y: 0, w: W, h: H };
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.02);
  const x = Math.max(0, x0 - pad);
  const y = Math.max(0, y0 - pad);
  return { x, y, w: Math.min(W, x1 + pad + 1) - x, h: Math.min(H, y1 + pad + 1) - y };
}

/** A clip path covering everything outside the crop box (to dim it). */
function cutout(c: Rect, fit: number, view: { w: number; h: number }) {
  const l = (c.x * fit).toFixed(1);
  const t = (c.y * fit).toFixed(1);
  const r = ((c.x + c.w) * fit).toFixed(1);
  const b = ((c.y + c.h) * fit).toFixed(1);
  return `polygon(evenodd, 0 0, ${view.w}px 0, ${view.w}px ${view.h}px, 0 ${view.h}px, 0 0, ${l}px ${t}px, ${l}px ${b}px, ${r}px ${b}px, ${r}px ${t}px, ${l}px ${t}px)`;
}

/** Width / height that fit a w × h picture inside maxW × maxH (keeping its shape). */
function fitBox(w: number, h: number, maxW: number, maxH: number): React.CSSProperties {
  const k = Math.min(maxW / w, maxH / h);
  return { width: Math.round(w * k), height: Math.round(h * k) };
}

/**
 * The cropped logo with two round handles: right (width) and bottom (height). It
 * only ever stretches straight across or straight down — no corners, so no slant.
 * 100% is drawn inside 220 × 90; it can go from 50% to 200% each way.
 */
function StretchBox({ src, crop, sx, sy, onChange }: { src: string; crop: Rect; sx: number; sy: number; onChange: (sx: number, sy: number) => void }) {
  const k = Math.min(220 / crop.w, 90 / crop.h);
  const w = crop.w * k * (sx / 100);
  const h = crop.h * k * (sy / 100);
  const [drag, setDrag] = useState<{ axis: "x" | "y"; start: number; from: number } | null>(null);
  const clamp = (v: number) => Math.round(Math.max(50, Math.min(200, v)));

  const down = (axis: "x" | "y") => (e: React.PointerEvent) => {
    e.preventDefault();
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    setDrag({ axis, start: axis === "x" ? e.clientX : e.clientY, from: axis === "x" ? sx : sy });
  };
  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    if (drag.axis === "x") onChange(clamp(drag.from + ((e.clientX - drag.start) / (crop.w * k)) * 100), sy);
    else onChange(sx, clamp(drag.from + ((e.clientY - drag.start) / (crop.h * k)) * 100));
  };
  const dot = "absolute h-4 w-4 rounded-full border-2 border-blue-700 bg-white shadow hover:scale-125 transition-transform";

  return (
    // Room for it to grow to 200% either way.
    <div
      className="relative touch-none select-none rounded-md border border-slate-200 p-3"
      style={{ width: 220 * 2 + 30, height: 90 * 2 + 30, background: "repeating-conic-gradient(#f1f5f9 0% 25%, #fff 0% 50%) 50% / 14px 14px" }}
      onPointerMove={move}
      onPointerUp={() => setDrag(null)}
    >
      <div className="relative" style={{ width: w, height: h }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" draggable={false} className="block h-full w-full" />
        <div className="pointer-events-none absolute inset-0 outline outline-1 outline-dashed outline-blue-400" />
        <span
          role="slider"
          aria-label="Stretch wider or narrower"
          aria-valuenow={sx}
          title="Drag to make it wider or narrower"
          className={cn(dot, "-right-2 top-1/2 -translate-y-1/2 cursor-ew-resize")}
          onPointerDown={down("x")}
        />
        <span
          role="slider"
          aria-label="Stretch taller or shorter"
          aria-valuenow={sy}
          title="Drag to make it taller or shorter"
          className={cn(dot, "-bottom-2 left-1/2 -translate-x-1/2 cursor-ns-resize")}
          onPointerDown={down("y")}
        />
      </div>
    </div>
  );
}
