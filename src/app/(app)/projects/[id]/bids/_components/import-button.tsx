"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { buttonClasses } from "@/components/ui";

/**
 * One button: pick what the vendor sent back and it's taken in straight away (no separate submit). Their
 * Excel file brings its prices in by itself; a PDF or photo is kept on the bid, to type the prices off.
 */
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
      <label
        className={buttonClasses(variant, "sm", busy ? "pointer-events-none opacity-60" : "cursor-pointer")}
        title={bidId ? "What the vendor sent back: their Excel file (prices come in by themselves), or a PDF or photo" : "The Excel file a vendor sent back — it knows which bid it is"}
      >
        <Upload className="h-3.5 w-3.5" /> {busy ? "Reading…" : label}
        <input
          type="file"
          name="file"
          accept={bidId ? ".xlsx,.pdf,.jpg,.jpeg,.png,.webp,.heic,application/pdf,image/*" : ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) form.current?.requestSubmit();
          }}
        />
      </label>
    </form>
  );
}
