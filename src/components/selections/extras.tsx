"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, ImagePlus, Paperclip, X } from "lucide-react";
import { cn, fmtDateTime } from "@/lib/utils";
import { buttonClasses } from "@/components/ui";

type Result = { ok: true } | { ok: false; error: string };
export type CardComment = { id: string; author: string; body: string; internal: boolean; at: Date; mine: boolean };
export type CardLog = { id: string; who: string; what: string; at: Date };
/** `seen`: for a client, when they opened it; for your team, "Sarah viewed Oct 6, 2:14 PM" (clients only). */
export type CardFile = { id: string; name: string; isImage: boolean; mine: boolean; seen?: string | null };

/**
 * "Did the client see it?" A client gets Open to review / ✓ Viewed (and the link counts
 * as opening it); your team sees ✓ Client viewed (when, on hover) / Not viewed by client.
 */
function SeenMark({ seen, client }: { seen: string | null | undefined; client: boolean }) {
  if (client)
    return seen ? <span className="text-[10px] font-semibold text-emerald-700">✓ Viewed</span> : <span className="text-[10px] font-semibold text-amber-700">Open to review</span>;
  return seen ? (
    <span className="text-[10px] font-medium text-emerald-700" title={seen}>
      ✓ Client viewed
    </span>
  ) : (
    <span className="text-[10px] text-slate-400">Not viewed by client</span>
  );
}
/** What can go in a files box — said right there, so nobody has to ask. */
export function FileTypesNote({ className, viewOnly }: { className?: string; /** Only opening files here (the client's Files page): just how they open. */ viewOnly?: boolean }) {
  if (viewOnly)
    return (
      <p className={cn("text-[11px] leading-snug text-slate-400", className)}>
        PDFs and pictures (JPG, PNG, GIF, WebP) open right in your browser; Word, Excel and other files download so you can open them on your computer.
      </p>
    );
  return (
    <p className={cn("text-[11px] leading-snug text-slate-400", className)}>
      Any file up to 25 MB. PDFs and pictures (JPG, PNG, GIF, WebP) open in the browser; Word, Excel and other files download. iPhone photos (HEIC) download too — set the iPhone to
      Settings › Camera › Formats › Most Compatible for JPGs.
    </p>
  );
}

/** The link to a file: a client's counts as opening it (`?open=1`). */
const fileHref = (id: string, track?: unknown) => `/api/files/${id}${track ? "?open=1" : ""}`;

function useRun() {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      setErr(null);
      const r = await fn();
      if (!r.ok) setErr(r.error);
      else {
        after?.();
        router.refresh();
      }
    });
  return { busy, err, run };
}

/**
 * "Last comment" with View / Add comments and (for your team) View change log —
 * like the box on your CoConstruct selections.
 */
export function CommentsBox({
  comments,
  log,
  onPost,
  team,
}: {
  comments: CardComment[];
  /** Your team only; the client has no change log. */
  log?: CardLog[];
  onPost: (body: string, internal: boolean) => Promise<Result>;
  /** Your team: can mark a comment "team only". */
  team?: boolean;
}) {
  const [open, setOpen] = useState<"comments" | "log" | null>(null);
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const { busy, err, run } = useRun();
  const last = comments.at(-1);
  return (
    <div className="rounded-lg border border-slate-200 p-3 text-sm">
      <p className="mb-1 font-semibold text-slate-900">Last comment</p>
      {last ? (
        <>
          <p className="text-xs text-slate-500">
            {last.author} · {fmtDateTime(last.at)}
            {last.internal ? " · team only" : ""}
          </p>
          <p className="line-clamp-3 whitespace-pre-line text-slate-700">{last.body}</p>
        </>
      ) : (
        <p className="text-slate-400">No comments yet.</p>
      )}
      <p className="mt-2 flex flex-wrap gap-3 text-xs">
        <button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => setOpen(open === "comments" ? null : "comments")}>
          View / add comments{comments.length ? ` (${comments.length})` : ""}
        </button>
        {log ? (
          <button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => setOpen(open === "log" ? null : "log")}>
            View change log{log.length ? ` (${log.length})` : ""}
          </button>
        ) : null}
      </p>

      {open === "comments" ? (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {comments.map((m) => (
              <li key={m.id} className={cn("rounded-lg px-3 py-2", m.internal ? "bg-amber-50" : m.mine ? "bg-blue-50" : "bg-slate-50")}>
                <p className="text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-700">{m.author}</span> · {fmtDateTime(m.at)}
                  {m.internal ? " · team only" : ""}
                </p>
                <p className="whitespace-pre-line text-slate-800">{m.body}</p>
              </li>
            ))}
          </ul>
          <textarea className="input" rows={2} placeholder="Write a comment…" value={body} onChange={(e) => setBody(e.target.value)} aria-label="Comment" />
          <div className="flex items-center gap-2">
            {team ? (
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                Team only (the client won&apos;t see it)
              </label>
            ) : null}
            <span className="ml-auto text-xs text-rose-700">{err}</span>
            <button
              type="button"
              className={buttonClasses("primary", "sm")}
              disabled={busy || !body.trim()}
              onClick={() =>
                run(
                  () => onPost(body, internal),
                  () => {
                    setBody("");
                    setInternal(false);
                  },
                )
              }
            >
              {busy ? "Posting…" : "Post"}
            </button>
          </div>
        </div>
      ) : null}

      {open === "log" && log ? (
        <ul className="mt-3 max-h-72 space-y-1.5 overflow-y-auto border-t border-slate-100 pt-3 text-xs">
          {log.length === 0 ? <li className="text-slate-400">Nothing changed yet.</li> : null}
          {log.map((l) => (
            <li key={l.id}>
              <span className="text-slate-500">{fmtDateTime(l.at)}</span> · <span className="font-medium text-slate-700">{l.who}</span>: {l.what}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** A selection's files and pictures, with Add files and remove (×) where allowed. */
export function FilesBox({
  files,
  onAdd,
  onRemove,
  canRemove,
  track,
  showSeen,
}: {
  files: CardFile[];
  onAdd: (fd: FormData) => Promise<Result>;
  onRemove: (fileId: string) => Promise<Result>;
  canRemove: (f: CardFile) => boolean;
  /** The client's view: opening a file records it. */
  track?: (fileId: string) => void;
  /** Your team's view of a selection: whether the client opened each file. */
  showSeen?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const { busy, err, run } = useRun();
  const upload = (list: FileList | null) => {
    if (!list?.length) return;
    const fd = new FormData();
    for (const f of Array.from(list)) fd.append("files", f);
    run(() => onAdd(fd));
  };
  return (
    <div
      className={cn("rounded-lg border p-3 text-sm transition-colors", over ? "border-blue-400 bg-blue-50" : "border-slate-200")}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        upload(e.dataTransfer.files);
      }}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="font-semibold text-slate-900">Files</p>
        <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline" onClick={() => input.current?.click()} disabled={busy}>
          <Paperclip className="h-3.5 w-3.5" /> {busy ? "Adding…" : "Add files"}
        </button>
        <input ref={input} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
      </div>
      {files.length === 0 ? <p className="text-slate-400">No files — drop them here, or Add files.</p> : null}
      <FileTypesNote className="mb-1.5" />
      <ul className="flex flex-wrap gap-2">
        {files.map((f) => (
          <li key={f.id} className="group relative">
            <a href={fileHref(f.id, track && !f.mine)} target="_blank" rel="noopener" title={f.name} className="block" onClick={() => track && !f.mine && track(f.id)}>
              {f.isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/files/${f.id}`} alt={f.name} className="h-16 w-16 rounded-md object-cover ring-1 ring-slate-200" />
              ) : (
                <span className="flex h-16 w-28 flex-col items-center justify-center gap-1 rounded-md bg-slate-50 px-1 text-center text-[10px] text-slate-600 ring-1 ring-slate-200">
                  <FileText className="h-4 w-4 text-slate-400" />
                  <span className="line-clamp-2 break-all">{f.name}</span>
                </span>
              )}
            </a>
            {(track || showSeen) && !f.mine ? (
              <span className="mt-0.5 block text-center leading-none">
                <SeenMark seen={f.seen} client={!!track} />
              </span>
            ) : null}
            {canRemove(f) ? (
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-white p-0.5 text-slate-500 shadow ring-1 ring-slate-200 hover:text-rose-700 group-hover:block"
                onClick={() => window.confirm(`Remove "${f.name}"?`) && run(() => onRemove(f.id))}
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {err ? <p className="mt-1 text-xs text-rose-700">{err}</p> : null}
    </div>
  );
}

/** A choice's picture; your team can add or replace it. */
export function ChoicePicture({
  pictureId,
  onUpload,
  seen,
  track,
}: {
  pictureId: string | null;
  onUpload?: (fd: FormData) => Promise<Result>;
  /** See CardFile.seen; leave out to show nothing. */
  seen?: string | null;
  /** The client's view: opening it full size records it. */
  track?: (fileId: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { busy, err, run } = useRun();
  if (!pictureId && !onUpload) return null;
  return (
    <span className="relative block shrink-0">
      {pictureId ? (
        <a
          href={fileHref(pictureId, track)}
          target="_blank"
          rel="noopener"
          title={track ? "Open the picture full size" : undefined}
          onClick={(e) => {
            e.stopPropagation();
            track?.(pictureId);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/files/${pictureId}`} alt="" className="h-16 w-16 rounded-md object-cover ring-1 ring-slate-200" />
        </a>
      ) : (
        <button
          type="button"
          title="Add a picture"
          className="flex h-16 w-16 items-center justify-center rounded-md border-2 border-dashed border-slate-200 text-slate-300 hover:border-blue-300 hover:text-blue-600"
          onClick={(e) => {
            e.preventDefault();
            input.current?.click();
          }}
          disabled={busy}
        >
          <ImagePlus className="h-5 w-5" />
        </button>
      )}
      {pictureId && onUpload ? (
        <button
          type="button"
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-white px-1 text-[10px] text-blue-700 shadow ring-1 ring-slate-200"
          onClick={(e) => {
            e.preventDefault();
            input.current?.click();
          }}
        >
          Change
        </button>
      ) : null}
      {onUpload ? (
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const fd = new FormData();
            fd.set("file", f);
            run(() => onUpload(fd));
          }}
        />
      ) : null}
      {pictureId && seen !== undefined ? (
        <span className="mt-0.5 block text-center leading-none">
          <SeenMark seen={seen} client={!!track} />
        </span>
      ) : null}
      {err ? <span className="absolute left-0 top-full w-40 text-[10px] text-rose-700">{err}</span> : null}
    </span>
  );
}

/**
 * A choice's documents — spec sheets, quotes (PDFs and the like). Your team adds them
 * (📎 or drop them on the choice) and can remove them; the client sees and opens them.
 */
export function ChoiceFiles({
  files,
  onAdd,
  onRemove,
  track,
  showSeen,
}: {
  files: { id: string; name: string; seen?: string | null }[];
  onAdd?: (fd: FormData) => Promise<Result>;
  onRemove?: (fileId: string) => Promise<Result>;
  /** The client's view: opening a file records it. */
  track?: (fileId: string) => void;
  /** Your team's view: whether the client opened each. */
  showSeen?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { busy, err, run } = useRun();
  if (!files.length && !onAdd) return null;
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {files.map((f) => (
        <span key={f.id} className="inline-flex max-w-full items-center gap-1 rounded-md bg-slate-100 py-0.5 pl-1.5 pr-1 text-xs text-slate-700 ring-1 ring-inset ring-slate-200">
          <FileText className="h-3.5 w-3.5 shrink-0 text-rose-600" />
          <a href={fileHref(f.id, track)} target="_blank" rel="noopener" className="truncate hover:text-blue-700 hover:underline" title={f.name} onClick={() => track?.(f.id)}>
            {f.name}
          </a>
          {track || showSeen ? <SeenMark seen={f.seen} client={!!track} /> : null}
          {onRemove ? (
            <button
              type="button"
              disabled={busy}
              className="rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              aria-label={`Remove ${f.name}`}
              onClick={(e) => {
                e.preventDefault();
                if (window.confirm(`Remove "${f.name}" from this choice?`)) run(() => onRemove(f.id));
              }}
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </span>
      ))}
      {onAdd ? (
        <>
          <button
            type="button"
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-blue-700"
            title="Add a PDF, spec sheet or quote (or drop it on the choice)"
            onClick={(e) => {
              e.preventDefault();
              input.current?.click();
            }}
          >
            <Paperclip className="h-3.5 w-3.5" /> {busy ? "Adding…" : "Add file"}
          </button>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (!list.length) return;
              const fd = new FormData();
              for (const f of list) fd.append("files", f);
              run(() => onAdd(fd));
            }}
          />
        </>
      ) : null}
      {err ? <span className="text-xs text-rose-700">{err}</span> : null}
    </span>
  );
}
