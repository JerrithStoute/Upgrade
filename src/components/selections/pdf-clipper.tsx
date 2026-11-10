"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClasses } from "@/components/ui";

const ASSETS = "/api/pdfjs";
/** The clipped picture's longest side, in pixels. */
const MAX_SIDE = 1600;

type Pdf = { id: string; name: string };
// pdfjs-dist's document, typed loosely so the library loads only when the clipper opens.
type Doc = {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (o: { scale: number }) => { width: number; height: number };
    render: (o: { canvas: HTMLCanvasElement; viewport: { width: number; height: number } }) => { promise: Promise<void>; cancel: () => void };
    getTextContent: () => Promise<{ items: unknown[] }>;
  }>;
};

const lastKey = (projectId: string) => `clip:${projectId}`;
function readLast(projectId: string): { fileId: string; page: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(lastKey(projectId)) ?? "null");
    return v && typeof v.fileId === "string" && typeof v.page === "number" ? v : null;
  } catch {
    return null;
  }
}
function writeLast(projectId: string, fileId: string, page: number) {
  try {
    localStorage.setItem(lastKey(projectId), JSON.stringify({ fileId, page }));
  } catch {}
}

/**
 * Clip a picture out of one of the job's PDFs (a vendor's picture book, a spec sheet): pick the PDF,
 * find the page (type a model number or name, or click a page), and drag a box around the product.
 * Letting go is the clip — no "use this?" step; Undo on the board is the check. It opens on the PDF and
 * page you used last.
 */
export function PdfClipper({
  projectId,
  pdfs,
  forName,
  onClip,
  onClose,
}: {
  projectId: string;
  pdfs: Pdf[];
  /** The choice it's for, shown in the title. */
  forName: string;
  onClip: (file: File, from: string) => void;
  onClose: () => void;
}) {
  const [last] = useState(() => readLast(projectId));
  const ordered = [...pdfs].sort((a, b) => (a.id === last?.fileId ? -1 : b.id === last?.fileId ? 1 : 0));
  const [fileId, setFileId] = useState<string | null>(ordered[0]?.id ?? null);
  const [page, setPage] = useState(last && last.fileId === ordered[0]?.id ? last.page : 1);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const [findNote, setFindNote] = useState<string | null>(null);
  const texts = useRef(new Map<number, string>());
  const canvas = useRef<HTMLCanvasElement>(null);
  // The page that's drawn ("file:page"), so a page still drawing can't be clipped.
  const [drawnAt, setDrawnAt] = useState<string | null>(null);
  const drawn = drawnAt === `${fileId}:${page}`;
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const dragging = useRef(false);
  const pdf = pdfs.find((p) => p.id === fileId) ?? null;
  const pickFile = (id: string) => {
    if (id === fileId) return;
    setDoc(null);
    setLoadErr(null);
    setFileId(id);
    setPage(1);
    setFindNote(null);
  };

  // Open the PDF.
  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;
    let destroy = () => {};
    texts.current = new Map();
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `${ASSETS}/build/pdf.worker.min.mjs`;
        const task = pdfjs.getDocument({ url: `/api/files/${fileId}`, wasmUrl: `${ASSETS}/wasm/`, cMapUrl: `${ASSETS}/cmaps/`, standardFontDataUrl: `${ASSETS}/standard_fonts/`, iccUrl: `${ASSETS}/iccs/` });
        destroy = () => void task.destroy();
        const opened = (await task.promise) as unknown as Doc;
        if (cancelled) return;
        setDoc(opened);
        setPage((p) => Math.min(Math.max(1, p), opened.numPages));
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : "Couldn't open the PDF");
      }
    })();
    return () => {
      cancelled = true;
      destroy();
    };
  }, [fileId]);

  // Draw the page, sharp enough to clip from.
  useEffect(() => {
    if (!doc || !canvas.current) return;
    let cancelled = false;
    let job: { cancel: () => void } | null = null;
    (async () => {
      const p = await doc.getPage(page);
      if (cancelled || !canvas.current) return;
      const base = p.getViewport({ scale: 1 });
      // At least 2x the page's own size, so a small product still comes out clear.
      const scale = Math.max(2, (window.devicePixelRatio || 1) * 1.5);
      const vp = p.getViewport({ scale });
      // Drawn on a sheet of its own, then shown: a page still drawing never shares a canvas with the next.
      const off = document.createElement("canvas");
      off.width = Math.floor(vp.width);
      off.height = Math.floor(vp.height);
      const r = p.render({ canvas: off, viewport: vp });
      job = r;
      try {
        await r.promise;
      } catch {
        return;
      }
      const c = canvas.current;
      if (cancelled || !c) return;
      c.width = off.width;
      c.height = off.height;
      c.style.aspectRatio = `${base.width} / ${base.height}`;
      c.getContext("2d")!.drawImage(off, 0, 0);
      setDrawnAt(`${fileId}:${page}`);
    })();
    if (fileId) writeLast(projectId, fileId, page);
    return () => {
      cancelled = true;
      job?.cancel();
    };
  }, [doc, page, fileId, projectId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") setPage((p) => (doc ? Math.min(doc.numPages, p + 1) : p));
      if (e.key === "ArrowLeft" || e.key === "PageUp") setPage((p) => Math.max(1, p - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doc, onClose]);

  const textOf = useCallback(
    async (n: number) => {
      if (!doc) return "";
      const have = texts.current.get(n);
      if (have !== undefined) return have;
      const p = await doc.getPage(n);
      const t = (await p.getTextContent()).items
        .map((i) => (i as { str?: string }).str ?? "")
        .join(" ")
        .toLowerCase();
      texts.current.set(n, t);
      return t;
    },
    [doc],
  );

  // Find: the next page (after this one, wrapping round) with the words on it.
  const findNext = async () => {
    const q = find.trim().toLowerCase();
    if (!doc || !q) return;
    setFindNote("Looking…");
    let anyText = false;
    for (let k = 1; k <= doc.numPages; k++) {
      const n = ((page - 1 + k) % doc.numPages) + 1;
      const t = await textOf(n);
      if (t.trim()) anyText = true;
      // Model numbers are matched without their dashes and spaces too ("9159BLDST" finds "9159-BL-DST").
      if (t.includes(q) || t.replace(/[\s-]/g, "").includes(q.replace(/[\s-]/g, ""))) {
        setPage(n);
        setFindNote(n === page ? "Only on this page" : null);
        return;
      }
    }
    setFindNote(anyText ? "Not in this PDF" : "This PDF has no text to search (it's scanned) — page through it");
  };

  const pointOf = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const clip = (b: { x0: number; y0: number; x1: number; y1: number }) => {
    const c = canvas.current;
    if (!c || !pdf) return;
    const x = Math.min(b.x0, b.x1) * c.width;
    const y = Math.min(b.y0, b.y1) * c.height;
    const w = Math.abs(b.x1 - b.x0) * c.width;
    const h = Math.abs(b.y1 - b.y0) * c.height;
    // Too small to be a picture: a click, not a box.
    if (w < 20 || h < 20) return setBox(null);
    const k = Math.min(1, MAX_SIDE / Math.max(w, h));
    const out = document.createElement("canvas");
    out.width = Math.round(w * k);
    out.height = Math.round(h * k);
    const g = out.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, out.width, out.height);
    g.drawImage(c, x, y, w, h, 0, 0, out.width, out.height);
    const stem = pdf.name.replace(/\.pdf$/i, "");
    out.toBlob(
      (blob) => {
        if (!blob) return;
        onClip(new File([blob], `${stem} p${page}.jpg`, { type: "image/jpeg" }), `${stem}, page ${page}`);
      },
      "image/jpeg",
      0.9,
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2 sm:p-4" role="dialog" aria-modal="true" aria-label="Clip a picture">
      <div className="grid h-full max-h-[52rem] w-full max-w-6xl grid-rows-[auto_1fr] overflow-hidden rounded-xl bg-white shadow-xl md:grid-cols-[15rem_1fr]">
        <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-2.5 md:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">Clip a picture</h2>
          <span className="min-w-0 truncate text-xs text-slate-500">for {forName}</span>
          <button type="button" onClick={onClose} className={cn(buttonClasses("ghost", "sm"), "ml-auto")} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>

        <aside className="hidden min-h-0 flex-col gap-3 overflow-y-auto border-r border-slate-200 p-3 md:flex">
          <div>
            <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">This job&apos;s PDFs</p>
            <ul className="space-y-0.5">
              {ordered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => pickFile(p.id)}
                    className={cn("flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50", p.id === fileId && "bg-blue-50 text-blue-900 ring-1 ring-inset ring-blue-200")}
                  >
                    <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="min-w-0 break-words">{p.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {doc ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void findNext();
              }}
            >
              <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Find in this PDF</p>
              <div className="flex gap-1">
                <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Model #, name…" className="input h-8 min-w-0 flex-1 text-sm" />
                <button type="submit" className={buttonClasses("secondary", "sm")} aria-label="Find">
                  <Search className="h-3.5 w-3.5" />
                </button>
              </div>
              {findNote ? <p className="mt-1 px-1 text-xs text-slate-500">{findNote}</p> : <p className="mt-1 px-1 text-xs text-slate-400">Enter again for the next one.</p>}
            </form>
          ) : null}
        </aside>

        <div className="flex min-h-0 flex-col bg-slate-100">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-1.5 text-sm">
            {/* On a phone the PDF list is a pick list. */}
            <select value={fileId ?? ""} onChange={(e) => pickFile(e.target.value)} className="input h-8 min-w-0 flex-1 text-sm md:hidden">
              {ordered.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="hidden min-w-0 flex-1 truncate text-slate-600 md:block">{pdf?.name}</span>
            {doc ? (
              <span className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className={buttonClasses("ghost", "sm")} aria-label="Page before">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="tabular-nums text-slate-600">
                  Page{" "}
                  <input
                    key={page}
                    defaultValue={page}
                    inputMode="numeric"
                    className="input inline h-7 w-12 px-1 text-center text-sm"
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      const n = Number((e.target as HTMLInputElement).value);
                      if (Number.isInteger(n) && n >= 1 && n <= doc.numPages) setPage(n);
                    }}
                  />{" "}
                  of {doc.numPages}
                </span>
                <button type="button" onClick={() => setPage((p) => Math.min(doc.numPages, p + 1))} disabled={page >= doc.numPages} className={buttonClasses("ghost", "sm")} aria-label="Next page">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </span>
            ) : null}
          </div>
          <div className="relative min-h-0 flex-1 overflow-auto p-3 sm:p-5">
            {!pdfs.length ? (
              <p className="mx-auto mt-10 max-w-sm text-center text-sm text-slate-600">
                No PDFs on this job yet. Add the vendor&apos;s picture book or spec sheet in Files (or drop it on the choice), then clip from it here.
              </p>
            ) : loadErr ? (
              <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">Couldn&apos;t open this PDF. ({loadErr})</p>
            ) : (
              <>
                {drawn ? (
                  <p className="pointer-events-none sticky top-0 z-10 mx-auto mb-2 w-fit rounded-full bg-slate-900 px-3 py-1 text-xs text-white shadow">Drag a box around the picture you want</p>
                ) : (
                  <p className="mb-2 text-center text-xs text-slate-500">Opening…</p>
                )}
                <div
                  className="relative mx-auto w-full max-w-3xl cursor-crosshair touch-none select-none"
                  onPointerDown={(e) => {
                    if (!drawn) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    dragging.current = true;
                    const p = pointOf(e);
                    setBox({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
                  }}
                  onPointerMove={(e) => {
                    if (!dragging.current) return;
                    const p = pointOf(e);
                    setBox((b) => (b ? { ...b, x1: p.x, y1: p.y } : b));
                  }}
                  onPointerUp={(e) => {
                    if (!dragging.current || !box) return;
                    dragging.current = false;
                    const p = pointOf(e);
                    clip({ ...box, x1: p.x, y1: p.y });
                  }}
                >
                  <canvas ref={canvas} className="block w-full bg-white shadow-md" />
                  {box ? (
                    <span
                      className="pointer-events-none absolute border-2 border-blue-600 bg-blue-600/10"
                      style={{
                        left: `${Math.min(box.x0, box.x1) * 100}%`,
                        top: `${Math.min(box.y0, box.y1) * 100}%`,
                        width: `${Math.abs(box.x1 - box.x0) * 100}%`,
                        height: `${Math.abs(box.y1 - box.y0) * 100}%`,
                      }}
                    />
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
