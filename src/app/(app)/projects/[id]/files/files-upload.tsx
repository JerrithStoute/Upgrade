"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, Loader2, Upload, XCircle } from "lucide-react";
import { buttonClasses } from "@/components/ui";
import { cn } from "@/lib/utils";
import { actionMessage } from "@/lib/action-message";
import { putFile, startDirect } from "@/components/direct-upload";
import { preparePhoto } from "@/components/photos/prepare";

type Item = { name: string; progress: number; status: "uploading" | "done" | "error"; error?: string };

/**
 * The Files tab's drop zone — the same as the Plans tab's: drop files on it (or click it to choose) and
 * they upload right away, into the folder picked under it, the client seeing them or not. Photos are made
 * web-sized first. Online each file goes straight to cloud storage (with its own progress bar) and is then
 * checked and recorded; on a PC — or before that's switched on — they go through the server.
 */
export function FilesUpload({
  projectId,
  returnTo,
  folders,
  defaultFolder,
  action,
  finish,
  typesNote,
}: {
  projectId: string;
  returnTo: string;
  folders: readonly string[];
  defaultFolder: string;
  action: (fd: FormData) => Promise<void>;
  finish: (input: { projectId: string; folder: string; clientVisible: boolean; tickets: string[] }) => Promise<{ added: number; failed: string[] }>;
  typesNote: React.ReactNode;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [folder, setFolder] = useState(defaultFolder);
  const [clientVisible, setClientVisible] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const busy = items.some((i) => i.status === "uploading");

  const send = async (picked: File[]) => {
    if (!picked.length || busy) return;
    setNote(null);
    setItems(picked.map((f) => ({ name: f.name, progress: 0, status: "uploading" })));
    try {
      const files = await Promise.all(picked.map(preparePhoto));
      const first = await startDirect(projectId, "file", files[0]);
      if (!first.direct) {
        // Through the server, the way it's always gone on a PC.
        const fd = new FormData();
        fd.set("projectId", projectId);
        fd.set("returnTo", returnTo);
        fd.set("folder", folder);
        if (clientVisible) fd.set("clientVisible", "on");
        for (const f of files) fd.append("files", f);
        await action(fd);
        setItems([]);
        router.refresh();
        return;
      }
      const tickets: string[] = [];
      const problems: string[] = [];
      for (const [i, file] of files.entries()) {
        const set = (p: Partial<Item>) => setItems((list) => list.map((x, j) => (j === i ? { ...x, ...p } : x)));
        try {
          const started = i === 0 ? first : await startDirect(projectId, "file", file);
          if (!started.direct) throw new Error(`“${file.name}” couldn't be sent`);
          await putFile(started.url, file, (progress) => set({ progress }));
          tickets.push(started.ticket);
          set({ status: "done", progress: 100 });
        } catch (err) {
          const message = actionMessage(err, `“${file.name}” didn't upload`);
          problems.push(message);
          set({ status: "error", error: message });
        }
      }
      const r = tickets.length ? await finish({ projectId, folder, clientVisible, tickets }) : { added: 0, failed: [] };
      const failed = [...problems, ...r.failed];
      setNote({
        text: `${r.added ? `Uploaded ${r.added} file${r.added === 1 ? "" : "s"} to ${folder}.` : ""}${failed.length ? ` ${failed.join(" ")}` : ""}`.trim(),
        bad: failed.length > 0,
      });
      if (!failed.length) setItems([]);
      router.refresh();
    } catch (err) {
      setItems([]);
      setNote({ text: actionMessage(err, "The files didn't upload"), bad: true });
    }
  };

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop files here, or click to choose"
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
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
          void send(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed px-4 py-4 text-center transition-colors",
          dragging ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/50",
        )}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin text-blue-600" /> : <Upload className={cn("h-5 w-5", dragging ? "text-blue-600" : "text-slate-400")} />}
        <p className="text-sm font-medium text-slate-800">{busy ? "Uploading…" : "Drop files here, or click to choose"}</p>
        <div className="text-xs text-slate-500">They upload right away. {typesNote}</div>
        <input
          ref={input}
          id="up-files"
          type="file"
          multiple
          aria-label="Choose files"
          className="hidden"
          onChange={(e) => {
            void send(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600">
        <label className="flex items-center gap-1.5">
          Into
          <select id="up-folder" className="h-7 rounded-md border border-slate-300 bg-white pl-2 pr-7 text-xs text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 pointer-coarse:h-9 pointer-coarse:text-base" value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Folder">
            {folders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-slate-700">
          <input type="checkbox" checked={clientVisible} onChange={(e) => setClientVisible(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          Client sees them
        </label>
        <label className={cn(buttonClasses("secondary", "xs"), "ml-auto hidden cursor-pointer pointer-coarse:inline-flex")}>
          <Camera className="h-3.5 w-3.5" /> Take photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              void send(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {items.length ? (
        <ul className="space-y-1 text-sm">
          {items.map((i, n) => (
            <li key={n} className="flex items-center gap-2">
              {i.status === "uploading" ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
              ) : i.status === "done" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-rose-600" />
              )}
              <span className="min-w-0 flex-1 truncate text-slate-700">{i.name}</span>
              {i.status === "uploading" ? (
                <span className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full bg-blue-600 transition-all" style={{ width: `${i.progress}%` }} />
                </span>
              ) : null}
              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-500">{i.status === "error" ? "" : `${i.progress}%`}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {note ? <p className={note.bad ? "text-sm text-rose-700" : "text-sm text-emerald-700"}>{note.text}</p> : null}
    </div>
  );
}
