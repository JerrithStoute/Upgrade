"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, FileText, Loader2, Paperclip, Pencil, X } from "lucide-react";
import { buttonClasses } from "@/components/ui";
import { cn } from "@/lib/utils";
import { PhotoEditor } from "./photo-editor";
import { isPhoto, preparePhoto } from "./prepare";

/** A picked file's little picture (or its name, for a PDF and such). Tap a photo to mark it up. */
function Thumb({ file, onEdit, onRemove }: { file: File; onEdit?: () => void; onRemove: () => void }) {
  const photo = isPhoto(file) && !/hei[cf]/i.test(file.type + file.name);
  const url = useMemo(() => (photo ? URL.createObjectURL(file) : null), [file, photo]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return (
    <li className="relative">
      {url && onEdit ? (
        <button type="button" onClick={onEdit} className="group block" title="Mark up this photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={file.name} className="h-20 w-20 rounded-md object-cover ring-1 ring-slate-200" />
          <span className="absolute inset-x-1 bottom-1 inline-flex items-center justify-center gap-0.5 rounded bg-slate-900/70 py-0.5 text-[10px] font-medium text-white">
            <Pencil className="h-3 w-3" /> Mark up
          </span>
        </button>
      ) : (
        <span className="flex h-20 w-28 flex-col items-center justify-center gap-1 rounded-md bg-slate-50 px-1 text-center text-[10px] text-slate-600 ring-1 ring-slate-200">
          <FileText className="h-4 w-4 text-slate-400" />
          <span className="line-clamp-2 break-all">{file.name}</span>
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-0.5 text-slate-500 shadow ring-1 ring-slate-200 hover:text-rose-600"
        aria-label={`Don't add ${file.name}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

/** Picked files, each photo made ready (sized, HEIC → JPG) and markable — shared by both ways in. */
function usePicked() {
  const [files, setFiles] = useState<File[]>([]);
  const [readying, setReadying] = useState(0);
  const [editing, setEditing] = useState<number | null>(null);
  const add = async (list: FileList | File[] | null) => {
    const picked = Array.from(list ?? []);
    if (!picked.length) return [] as File[];
    setReadying((n) => n + picked.length);
    const ready = await Promise.all(picked.map(preparePhoto));
    setReadying((n) => n - picked.length);
    return ready;
  };
  return { files, setFiles, readying, editing, setEditing, add };
}

function Editing({ files, editing, setEditing, setFiles }: Pick<ReturnType<typeof usePicked>, "files" | "editing" | "setEditing" | "setFiles">) {
  const file = editing === null ? null : files[editing];
  if (!file) return null;
  return (
    <PhotoEditor
      key={editing}
      file={file}
      onCancel={() => setEditing(null)}
      onSave={(edited) => {
        setFiles((all) => all.map((f, i) => (i === editing ? edited : f)));
        setEditing(null);
      }}
    />
  );
}

/**
 * Photos (and other files) for a form: **Take photo** (a phone's camera, straight away) and **Add
 * photos** / **Add files**, then each photo shown small — tap it to mark it up (draw, arrows, circles,
 * notes, crop, turn) before it's saved. The picked files go in with the form under `name`, as a file
 * box would; photos are sized for the web and turned into JPGs on the way.
 */
export function PhotoPicker({
  name,
  id,
  photosOnly,
  required,
  className,
}: {
  name: string;
  id?: string;
  /** Photos only (a daily log); otherwise any file, photos markable. */
  photosOnly?: boolean;
  required?: boolean;
  className?: string;
}) {
  const real = useRef<HTMLInputElement>(null);
  const { files, setFiles, readying, editing, setEditing, add } = usePicked();
  const [problem, setProblem] = useState<string | null>(null);

  // What the form sends: the picked files, in the form's own (hidden) file box.
  useEffect(() => {
    const input = real.current;
    if (!input) return;
    try {
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(f);
      input.files = dt.files;
    } catch {
      // (A very old browser: can't hand files to the form this way.)
    }
  }, [files]);

  // The form's emptied after an upload (or reset): so is this.
  useEffect(() => {
    const form = real.current?.form;
    if (!form) return;
    const clear = () => setFiles([]);
    form.addEventListener("reset", clear);
    return () => form.removeEventListener("reset", clear);
  }, [setFiles]);

  const pick = async (list: FileList | null) => {
    setProblem(null);
    if (typeof DataTransfer === "undefined") {
      setProblem("This browser is too old to add files here — update it, or use another browser.");
      return;
    }
    const ready = await add(list);
    setFiles((all) => [...all, ...ready]);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <label className={cn(buttonClasses("secondary", "md"), "hidden cursor-pointer pointer-coarse:inline-flex")}>
          <Camera className="h-4 w-4" /> Take photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              void pick(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <label className={cn(buttonClasses("secondary", "md"), "cursor-pointer")}>
          <Paperclip className="h-4 w-4" /> {photosOnly ? "Add photos" : "Add files"}
          <input
            id={id}
            type="file"
            multiple
            accept={photosOnly ? "image/*" : undefined}
            className="sr-only"
            onChange={(e) => {
              void pick(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {readying ? (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Getting {readying === 1 ? "it" : `${readying}`} ready…
          </span>
        ) : null}
      </div>
      {/* The form's own file box: filled from the list below (sr-only, not hidden, so "required" can be checked). */}
      <input ref={real} type="file" name={name} multiple required={required} tabIndex={-1} aria-hidden className="sr-only" />
      {files.length ? (
        <ul className="flex flex-wrap gap-2 pt-1.5">
          {files.map((f, i) => (
            <Thumb key={`${i}-${f.name}-${f.lastModified}`} file={f} onEdit={() => setEditing(i)} onRemove={() => setFiles((all) => all.filter((_, j) => j !== i))} />
          ))}
        </ul>
      ) : null}
      {problem ? <p className="text-xs text-rose-700">{problem}</p> : null}
      <Editing files={files} editing={editing} setEditing={setEditing} setFiles={setFiles} />
    </div>
  );
}

/**
 * For a place that adds files the moment they're picked (a selection's Files): any photos among them
 * are shown first — tap one to mark it up — then **Add** sends them all. Files with no photos go
 * straight in.
 */
export function usePhotoCheck() {
  const { files, setFiles, readying, editing, setEditing, add } = usePicked();
  const done = useRef<((files: File[] | null) => void) | null>(null);

  const check = async (list: FileList | File[] | null): Promise<File[] | null> => {
    const picked = Array.from(list ?? []);
    if (!picked.some(isPhoto)) return picked;
    const ready = await add(picked);
    setFiles(ready);
    return new Promise((resolve) => (done.current = resolve));
  };
  const finish = (out: File[] | null) => {
    done.current?.(out);
    done.current = null;
    setFiles([]);
  };

  const open = files.length > 0 || readying > 0;
  const element = open
    ? createPortal(
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="Photos to add">
          <div className="w-full max-w-md space-y-3 rounded-xl bg-white p-4 shadow-xl">
            <p className="font-semibold text-slate-900">Add {files.length === 1 ? "this" : `these ${files.length}`}?</p>
            <p className="text-xs text-slate-500">Tap a photo to mark it up first — draw, arrows, circles, notes, crop.</p>
            {readying ? (
              <p className="inline-flex items-center gap-1 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Getting them ready…
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2 pt-1.5">
                {files.map((f, i) => (
                  <Thumb
                    key={`${i}-${f.name}-${f.lastModified}`}
                    file={f}
                    onEdit={() => setEditing(i)}
                    // (The last one taken out: nothing to add.)
                    onRemove={() => (files.length === 1 ? finish(null) : setFiles((all) => all.filter((_, j) => j !== i)))}
                  />
                ))}
              </ul>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className={buttonClasses("ghost", "sm")} onClick={() => finish(null)}>
                Cancel
              </button>
              <button type="button" className={buttonClasses("primary", "sm")} disabled={readying > 0 || !files.length} onClick={() => finish(files)}>
                Add
              </button>
            </div>
          </div>
          <Editing files={files} editing={editing} setEditing={setEditing} setFiles={setFiles} />
        </div>,
        document.body,
      )
    : null;
  return { check, element };
}
