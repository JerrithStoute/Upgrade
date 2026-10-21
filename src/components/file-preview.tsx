"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, FileSpreadsheet } from "lucide-react";
import { buttonClasses } from "@/components/ui";

/**
 * A file shown right on the page: a picture as it is, a PDF drawn page by page (with the same PDF reader
 * as the plans — the program's pages never frame a file), anything else (an Excel file) as a card to open.
 */
export function FilePreview({ fileId, mimeType, name }: { fileId: string; mimeType: string; name: string }) {
  const url = `/api/files/${fileId}`;
  const bar = (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{name}</span>
      <a href={url} target="_blank" rel="noopener" className={buttonClasses("ghost", "sm")}>
        <ExternalLink className="h-3.5 w-3.5" /> Open
      </a>
      <a href={`${url}?download=1`} className={buttonClasses("ghost", "sm")}>
        <Download className="h-3.5 w-3.5" /> Download
      </a>
    </div>
  );
  if (mimeType.startsWith("image/") && mimeType !== "image/heic")
    return (
      <div>
        {bar}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={name} className="w-full rounded-lg border border-slate-200 bg-white" />
      </div>
    );
  if (mimeType === "application/pdf")
    return (
      <div>
        {bar}
        <PdfPages url={url} />
      </div>
    );
  return (
    <div>
      {bar}
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
        <FileSpreadsheet className="h-8 w-8 shrink-0 text-emerald-700" />
        <span>
          {mimeType.includes("spreadsheet") ? "Their Excel file — its prices are already on this bid. Download it to open it in Excel." : "This kind of file can't be shown here — download it to open it."}
        </span>
      </div>
    </div>
  );
}

const ASSETS = "/api/pdfjs";
const MAX_PAGES = 10;

/** Every page of a PDF (up to 10), drawn to the width of its box. */
function PdfPages({ url }: { url: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let destroy = () => {};
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `${ASSETS}/build/pdf.worker.min.mjs`;
        const task = pdfjs.getDocument({ url, wasmUrl: `${ASSETS}/wasm/`, cMapUrl: `${ASSETS}/cmaps/`, standardFontDataUrl: `${ASSETS}/standard_fonts/`, iccUrl: `${ASSETS}/iccs/` });
        destroy = () => void task.destroy();
        const doc = await task.promise;
        if (cancelled || !box.current) return;
        const n = Math.min(doc.numPages, MAX_PAGES);
        setPages(doc.numPages);
        box.current.replaceChildren();
        const width = box.current.clientWidth || 600;
        for (let i = 1; i <= n; i++) {
          const page = await doc.getPage(i);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const dpr = window.devicePixelRatio || 1;
          const vp = page.getViewport({ scale: (width / base.width) * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          canvas.className = "mb-2 w-full rounded-lg border border-slate-200 bg-white";
          box.current?.appendChild(canvas);
          await page.render({ canvas, viewport: vp }).promise;
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't show the PDF");
      }
    })();
    return () => {
      cancelled = true;
      destroy();
    };
  }, [url]);
  return (
    <div>
      {error ? <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">Couldn&apos;t show it here — use Open. ({error})</p> : null}
      <div ref={box} className="min-h-40" />
      {pages > MAX_PAGES ? <p className="text-xs text-slate-500">First {MAX_PAGES} of {pages} pages — use Open for the rest.</p> : null}
    </div>
  );
}
