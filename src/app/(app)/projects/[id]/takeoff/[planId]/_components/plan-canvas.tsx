"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

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

/** Largest canvas we'll render: keeps memory sane on huge sheets at high zoom. */
const MAX_SIDE = 8192;
const MAX_PIXELS = 40_000_000;

/**
 * Renders one page of a PDF (or an image) at the current zoom. Page units are
 * PDF points at 100% (or image pixels); `onSize` reports the page size in them.
 */
export function PlanCanvas({
  url,
  kind,
  pageNumber,
  zoom,
  onSize,
  onPageCount,
}: {
  url: string;
  kind: string;
  pageNumber: number;
  zoom: number;
  onSize: (w: number, h: number) => void;
  onPageCount?: (n: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const onSizeRef = useRef(onSize);
  const onPageCountRef = useRef(onPageCount);
  useEffect(() => {
    onSizeRef.current = onSize;
    onPageCountRef.current = onPageCount;
  });

  // Load the document once per URL.
  useEffect(() => {
    if (kind !== "PDF") return;
    let cancelled = false;
    let task: ReturnType<PdfJs["getDocument"]> | null = null;
    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        if (cancelled) return;
        task = pdfjs.getDocument({
          url,
          wasmUrl: `${ASSETS}/wasm/`,
          cMapUrl: `${ASSETS}/cmaps/`,
          standardFontDataUrl: `${ASSETS}/standard_fonts/`,
          iccUrl: `${ASSETS}/iccs/`,
        });
        const loaded = await task.promise;
        if (cancelled) return;
        setDoc(loaded);
        onPageCountRef.current?.(loaded.numPages);
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setError(e instanceof Error ? e.message : "Could not open the PDF");
        }
      }
    })();
    return () => {
      cancelled = true;
      // Aborts the download and shuts the worker down.
      task?.destroy();
    };
  }, [url, kind]);

  // Page size (zoom-independent).
  const [page, setPage] = useState<Awaited<ReturnType<PDFDocumentProxy["getPage"]>> | null>(null);
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
        onSizeRef.current(vp.width, vp.height);
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
      task = page.render({ canvas: off, viewport: vp });
      task.promise.then(
        () => {
          canvas.width = off.width;
          canvas.height = off.height;
          canvas.getContext("2d")?.drawImage(off, 0, 0);
          setStatus("ready");
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
  }, [page, size, zoom]);

  const style = size ? { width: size.w * zoom, height: size.h * zoom } : undefined;

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
