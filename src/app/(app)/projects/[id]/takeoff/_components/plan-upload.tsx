"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileText, Image as ImageIcon, Loader2, Upload, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_BYTES = 100 * 1024 * 1024;
const ACCEPT = "application/pdf,.pdf,image/png,image/jpeg,image/webp";

type Item = { key: string; file: File; progress: number; status: "queued" | "uploading" | "done" | "error"; error?: string };

function isPlanFile(f: File) {
  return f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf") || ["image/png", "image/jpeg", "image/webp"].includes(f.type);
}

function mb(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** One file per request so each gets its own progress bar and its own 100 MB limit. */
function uploadOne(projectId: string, file: File, clientVisible: boolean, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const fd = new FormData();
    fd.append("projectId", projectId);
    fd.append("clientVisible", String(clientVisible));
    fd.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/takeoff/plans");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `Upload failed (${xhr.status})`;
      try {
        message = JSON.parse(xhr.responseText).error ?? message;
      } catch {
        /* not JSON */
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(fd);
  });
}

/** Drop zone + file picker for plan sets; uploads several files in a row. */
export function PlanUpload({ projectId }: { projectId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [clientVisible, setClientVisible] = useState(false);
  const busy = items.some((i) => i.status === "queued" || i.status === "uploading");

  const patch = (key: string, p: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    const batch: Item[] = files.map((file) => {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`;
      if (!isPlanFile(file)) return { key, file, progress: 0, status: "error", error: "Not a PDF or PNG/JPG/WebP image" };
      if (file.size > MAX_BYTES) return { key, file, progress: 0, status: "error", error: `Larger than 100 MB (${mb(file.size)})` };
      return { key, file, progress: 0, status: "queued" };
    });
    setItems((list) => [...list.filter((i) => i.status !== "done"), ...batch]);
    for (const item of batch) {
      if (item.status !== "queued") continue;
      patch(item.key, { status: "uploading" });
      try {
        await uploadOne(projectId, item.file, clientVisible, (progress) => patch(item.key, { progress }));
        patch(item.key, { status: "done", progress: 100 });
      } catch (err) {
        patch(item.key, { status: "error", error: err instanceof Error ? err.message : "Upload failed" });
      }
    }
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
          dragging ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/50",
        )}
      >
        <Upload className={cn("h-6 w-6", dragging ? "text-blue-600" : "text-slate-400")} />
        <p className="text-sm font-medium text-slate-800">Drop plan files here, or click to choose</p>
        <p className="text-xs text-slate-500">PDF plan sets or PNG/JPG/WebP images · several at once · up to 100 MB each · also saved in Files → Plans</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={clientVisible} onChange={(e) => setClientVisible(e.target.checked)} disabled={busy} className="h-4 w-4 rounded border-slate-300" />
        Visible to client in Files
      </label>
      {items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map((i) => {
            const isPdf = i.file.type === "application/pdf" || i.file.name.toLowerCase().endsWith(".pdf");
            return (
              <li key={i.key} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                {isPdf ? <FileText className="h-4 w-4 shrink-0 text-rose-500" /> : <ImageIcon className="h-4 w-4 shrink-0 text-violet-600" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-slate-900">{i.file.name}</span>
                  {i.status === "uploading" || i.status === "queued" ? (
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full bg-blue-600 transition-all" style={{ width: `${i.progress}%` }} />
                    </span>
                  ) : i.status === "error" ? (
                    <span className="block text-xs text-rose-700">{i.error}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-slate-500">{mb(i.file.size)}</span>
                {i.status === "done" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : i.status === "error" ? (
                  <XCircle className="h-4 w-4 shrink-0 text-rose-600" />
                ) : i.status === "uploading" ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
                ) : (
                  <span className="shrink-0 text-xs text-slate-400">waiting</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
