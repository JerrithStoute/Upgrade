"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { markUpPhoto } from "@/app/(app)/projects/[id]/files/markup-actions";
import { PhotoEditor } from "./photo-editor";

/**
 * **Mark up** for a photo already saved to the job: opens the markup screen (draw, arrows, circles, notes,
 * crop, turn) on it, and Save puts the marked-up photo in its place — the original is kept behind it.
 * `chip`: a small pencil in a thumbnail's corner (the thumbnail's box needs `relative`); otherwise a text link.
 */
export function MarkUpPhoto({ id, name, chip, className }: { id: string; name: string; chip?: boolean; className?: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"opening" | "saving" | null>(null);

  const open = async () => {
    setBusy("opening");
    try {
      const res = await fetch(`/api/files/${id}?through=1`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      setFile(new File([blob], name, { type: blob.type }));
    } catch {
      window.alert("That photo didn't open — try again.");
    } finally {
      setBusy(null);
    }
  };

  const save = async (edited: File) => {
    setFile(null);
    setBusy("saving");
    const fd = new FormData();
    fd.set("id", id);
    fd.set("photo", edited);
    const r = await markUpPhoto(fd);
    setBusy(null);
    if (!r.ok) window.alert(r.error);
    router.refresh();
  };

  return (
    <>
      {chip ? (
        <button
          type="button"
          onClick={open}
          disabled={!!busy}
          aria-label={`Mark up ${name}`}
          title="Mark up"
          className={cn(
            "absolute bottom-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-white/90 text-slate-700 shadow ring-1 ring-slate-200 hover:bg-white hover:text-blue-700",
            className,
          )}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
        </button>
      ) : (
        <button type="button" onClick={open} disabled={!!busy} className={cn("text-xs font-medium text-blue-700 hover:underline disabled:opacity-60", className)}>
          {busy === "opening" ? "Opening…" : busy === "saving" ? "Saving…" : "Mark up"}
        </button>
      )}
      {file ? <PhotoEditor file={file} onCancel={() => setFile(null)} onSave={save} /> : null}
    </>
  );
}
