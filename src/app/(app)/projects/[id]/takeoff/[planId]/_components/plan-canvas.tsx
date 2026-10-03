"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { extractSegments } from "./pdf-vectors";

const ASSETS = "/api/pdfjs";

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;

function loadPdfJs() {
  pdfjsPromise ??= import("pdfjs-dist").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = `${ASSETS}/build/pdf.worker.min.mjs`;
    return pdfjs;
  });
  return pdfjsPromise;
}

/**
 * One loaded document per URL, shared by every canvas showing it (the viewer, or
 * several sheets on the print page), so a big plan set downloads once.
 */
const docs = new Map<string, { promise: Promise<PDFDocumentProxy>; users: number; destroy: () => void }>();

function acquireDoc(url: string) {
  let entry = docs.get(url);
  if (!entry) {
    let destroy = () => {};
    const promise = loadPdfJs().then((pdfjs) => {
      const task = pdfjs.getDocument({
        url,
        wasmUrl: `${ASSETS}/wasm/`,
        cMapUrl: `${ASSETS}/cmaps/`,
        standardFontDataUrl: `${ASSETS}/standard_fonts/`,
        iccUrl: `${ASSETS}/iccs/`,
      });
      destroy = () => void task.destroy();
      return task.promise;
    });
    entry = { promise, users: 0, destroy: () => destroy() };
    docs.set(url, entry);
  }
  entry.users++;
  const held = entry;
  return {
    promise: held.promise,
    release() {
      held.users--;
      // Keep it briefly in case the same plan opens again (e.g. sheet → print page).
      window.setTimeout(() => {
        if (held.users <= 0 && docs.get(url) === held) {
          docs.delete(url);
          held.destroy();
        }
      }, 30_000);
    },
  };
}

/** Largest canvas we'll render: keeps memory sane on huge sheets at high zoom. */
const MAX_SIDE = 8192;
const MAX_PIXELS = 40_000_000;

/**
 * Renders one page of a PDF (or an image) at the current zoom. Page units are
 * PDF points at 100% (or image pixels); `onSize` reports the page size in them.
 * `onVectors` receives the page's line segments (for snapping). With `fill`, the
 * page stretches to its container's width (print), rendered at `zoom` resolution.
 */
export function PlanCanvas({
  url,
  kind,
  pageNumber,
  zoom,
  onSize,
  onPageCount,
  onVectors,
  onRendered,
  fill = false,
}: {
  url: string;
  kind: string;
  pageNumber: number;
  zoom: number;
  onSize: (w: number, h: number) => void;
  onPageCount?: (n: number) => void;
  onVectors?: (segments: Float32Array) => void;
  onRendered?: () => void;
  fill?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const callbacks = useRef({ onSize, onPageCount, onVectors, onRendered });
  useEffect(() => {
    callbacks.current = { onSize, onPageCount, onVectors, onRendered };
  });

  // Load (or share) the document.
  useEffect(() => {
    if (kind !== "PDF") return;
    let cancelled = false;
    const held = acquireDoc(url);
    held.promise.then(
      (loaded) => {
        if (cancelled) return;
        setDoc(loaded);
        callbacks.current.onPageCount?.(loaded.numPages);
      },
      (e) => {
        if (!cancelled) {
          setStatus("error");
          setError(e instanceof Error ? e.message : "Could not open the PDF");
        }
      },
    );
    return () => {
      cancelled = true;
      held.release();
    };
  }, [url, kind]);

  // Page size (zoom-independent), then its line work for snapping.
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    const n = Math.min(Math.max(1, pageNumber), doc.numPages);
    doc.getPage(n).then(
      (p) => {
        if (cancelled) return;
        const vp = p.getViewport({ scale: 1 });
        setPage(p);
        setSize({ w: vp.width, h: vp.height });
        callbacks.current.onSize(vp.width, vp.height);
        if (callbacks.current.onVectors) {
          loadPdfJs()
            .then((pdfjs) => extractSegments(pdfjs, p))
            .then((segments) => !cancelled && callbacks.current.onVectors?.(segments))
            .catch(() => !cancelled && callbacks.current.onVectors?.(new Float32Array()));
        }
      },
      (e) => {
        if (!cancelled) {
          setStatus("error");
          setError(e instanceof Error ? e.message : "Could not open the page");
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [doc, pageNumber]);

  // Render (debounced while zooming). The canvas is CSS-scaled in between.
  useEffect(() => {
    if (!page || !size || !canvasRef.current) return;
    const canvas = canvasRef.current;
    let task: RenderTask | null = null;
    const timer = window.setTimeout(() => {
      const dpr = window.devicePixelRatio || 1;
      let scale = Math.max(0.5, zoom * dpr);
      scale = Math.min(scale, MAX_SIDE / size.w, MAX_SIDE / size.h, Math.sqrt(MAX_PIXELS / (size.w * size.h)));
      const vp = page.getViewport({ scale });
      const off = document.createElement("canvas");
      off.width = Math.floor(vp.width);
      off.height = Math.floor(vp.height);
      // Print mode draws without animation frames (works in a background tab) and uses print annotations.
      task = page.render({ canvas: off, viewport: vp, intent: fill ? "print" : "display" });
      task.promise.then(
        () => {
          canvas.width = off.width;
          canvas.height = off.height;
          canvas.getContext("2d")?.drawImage(off, 0, 0);
          setStatus("ready");
          callbacks.current.onRendered?.();
        },
        () => {
          /* cancelled or failed; a later render replaces it */
        },
      );
    }, 120);
    return () => {
      window.clearTimeout(timer);
      task?.cancel();
    };
  }, [page, size, zoom, fill]);

  // `fill`: pinned to the parent's box (which has the page's exact proportions), so an
  // overlay pinned to the same box lines up whether or not the image has finished drawing.
  const style: React.CSSProperties | undefined = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%" }
    : size
      ? { width: size.w * zoom, height: size.h * zoom }
      : undefined;

  if (kind !== "PDF") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt="Plan sheet"
        draggable={false}
        className="block max-w-none select-none bg-white"
        style={style}
        onLoad={(e) => {
          const img = e.currentTarget;
          setSize({ w: img.naturalWidth, h: img.naturalHeight });
          onSize(img.naturalWidth, img.naturalHeight);
          onVectors?.(new Float32Array());
          onRendered?.();
        }}
      />
    );
  }

  return (
    <>
      <canvas ref={canvasRef} className="block bg-white" style={style ?? { width: 0, height: 0 }} />
      {status !== "ready" ? (
        <div className="absolute inset-0 grid min-h-64 min-w-64 place-items-center text-sm text-slate-500">
          {status === "error" ? <span className="text-rose-700">{error}</span> : "Loading plan…"}
        </div>
      ) : null}
    </>
  );
}

/** Biggest picture auto-count reads (pixels): enough detail for small symbols, kind to memory. */
const SEARCH_PIXELS = 20_000_000;

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the plan image"));
    img.src = url;
  });
}

/**
 * A grayscale picture of one sheet for auto-count, at `scale` pixels per page unit
 * (lowered if the sheet would be too big). Returns the scale actually used.
 */
export async function renderSheetGray(url: string, kind: string, pageNumber: number, scale: number) {
  const canvas = document.createElement("canvas");
  let used = scale;
  if (kind === "PDF") {
    const held = acquireDoc(url);
    try {
      const doc = await held.promise;
      const page = await doc.getPage(Math.min(Math.max(1, pageNumber), doc.numPages));
      const base = page.getViewport({ scale: 1 });
      used = Math.min(scale, MAX_SIDE / base.width, MAX_SIDE / base.height, Math.sqrt(SEARCH_PIXELS / (base.width * base.height)));
      const vp = page.getViewport({ scale: used });
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      await page.render({ canvas, viewport: vp, intent: "print" }).promise;
    } finally {
      held.release();
    }
  } else {
    const img = await loadImage(url);
    used = Math.min(scale, MAX_SIDE / img.naturalWidth, MAX_SIDE / img.naturalHeight, Math.sqrt(SEARCH_PIXELS / (img.naturalWidth * img.naturalHeight)));
    canvas.width = Math.floor(img.naturalWidth * used);
    canvas.height = Math.floor(img.naturalHeight * used);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const gray = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < gray.length; i++) {
    const a = data[i * 4 + 3];
    // Transparent = paper.
    gray[i] = a < 128 ? 255 : Math.round(data[i * 4] * 0.3 + data[i * 4 + 1] * 0.59 + data[i * 4 + 2] * 0.11);
  }
  return { gray: { w: canvas.width, h: canvas.height, data: gray }, scale: used, canvas };
}
