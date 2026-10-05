"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { buttonClasses } from "@/components/ui";

/** One button: pick the returned file and it's imported straight away (no separate submit). */
export function ImportButton({
  action,
  projectId,
  bidId,
  label = "Import returned file…",
  variant = "secondary",
}: {
  action: (fd: FormData) => Promise<void>;
  projectId: string;
  bidId?: string;
  label?: string;
  variant?: "secondary" | "ghost";
}) {
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form ref={form} action={action} onSubmit={() => setBusy(true)}>
      <input type="hidden" name="projectId" value={projectId} />
      {bidId ? <input type="hidden" name="bidId" value={bidId} /> : null}
      <label className={buttonClasses(variant, "sm", busy ? "pointer-events-none opacity-60" : "cursor-pointer")} title="The Excel file the vendor sent back">
        <Upload className="h-3.5 w-3.5" /> {busy ? "Reading…" : label}
        <input
          type="file"
          name="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) form.current?.requestSubmit();
          }}
        />
      </label>
    </form>
  );
}
