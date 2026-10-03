"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Loader2 } from "lucide-react";
import { buttonClasses } from "@/components/ui";

/**
 * "New revision": pick the updated plan file; it's saved as the next revision of
 * this plan set and opened, where you compare and bring the takeoffs forward.
 */
export function RevisionUpload({ projectId, planId, nextRevision }: { projectId: string; planId: string; nextRevision: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("projectId", projectId);
      fd.append("revisionOf", planId);
      fd.append("clientVisible", "false");
      fd.append("file", file);
      const res = await fetch("/api/takeoff/plans", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error ?? `Upload failed (${res.status})`);
      router.push(`/projects/${projectId}/takeoff/${body.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className={buttonClasses("ghost", "sm")}
        title={`Upload the updated plans as Rev ${nextRevision}, then compare and bring your takeoffs forward`}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FilePlus2 className="h-3.5 w-3.5" />} New revision
      </button>
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
    </>
  );
}
