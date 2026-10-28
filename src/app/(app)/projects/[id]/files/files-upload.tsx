"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Field, FormGrid, SubmitButton } from "@/components/ui";
import { actionMessage } from "@/lib/action-message";
import { putFile, startDirect } from "@/components/direct-upload";
import { PhotoPicker } from "@/components/photos/photo-picker";

type Item = { name: string; progress: number; status: "uploading" | "done" | "error"; error?: string };

/**
 * Upload files to the job: the folder, the files, visible to the client or not. Online the files go
 * straight to cloud storage (with a progress bar each) and are then checked and recorded; on a PC — or
 * before that's switched on — the form sends them through the server as it always has.
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
  const form = useRef<HTMLFormElement>(null);
  // Set once direct isn't available: the form then goes the old way, through the server.
  const throughServer = useRef(false);
  const [items, setItems] = useState<Item[]>([]);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const busy = items.some((i) => i.status === "uploading");

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    if (throughServer.current) return;
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) return;
    setNote(null);
    try {
      const first = await startDirect(projectId, "file", files[0]);
      if (!first.direct) {
        throughServer.current = true;
        form.current?.requestSubmit();
        return;
      }
      setItems(files.map((f) => ({ name: f.name, progress: 0, status: "uploading" })));
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
      const r = tickets.length
        ? await finish({ projectId, folder: String(fd.get("folder") ?? ""), clientVisible: fd.get("clientVisible") === "on", tickets })
        : { added: 0, failed: [] };
      const failed = [...problems, ...r.failed];
      setNote({
        text: `${r.added ? `Uploaded ${r.added} file${r.added === 1 ? "" : "s"}.` : ""}${failed.length ? ` ${failed.join(" ")}` : ""}`.trim(),
        bad: failed.length > 0,
      });
      form.current?.reset();
      router.refresh();
    } catch (err) {
      setNote({ text: actionMessage(err, "The files didn't upload"), bad: true });
    }
  };

  return (
    <form ref={form} action={action} onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <FormGrid className="md:grid-cols-3">
        <Field label="Folder" htmlFor="up-folder">
          <select id="up-folder" name="folder" className="input" defaultValue={defaultFolder}>
            {folders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Files" htmlFor="up-files" className="md:col-span-2">
          <PhotoPicker id="up-files" name="files" required />
          {typesNote}
        </Field>
      </FormGrid>
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
      <div className="flex items-center gap-4">
        <SubmitButton pendingText="Uploading…" disabled={busy}>
          {busy ? "Uploading…" : "Upload"}
        </SubmitButton>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="clientVisible" defaultChecked className="h-4 w-4 rounded border-slate-300" />
          Visible to client
        </label>
      </div>
      {note ? <p className={note.bad ? "text-sm text-rose-700" : "text-sm text-emerald-700"}>{note.text}</p> : null}
    </form>
  );
}
