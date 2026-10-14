"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MarkupPanel } from "@/components/estimate/markup-table";
import type { MarkupRow } from "@/lib/markup";

/** Your default Markup, margin & tax table — the same table as on an estimate, saved with its own button. */
export function DefaultMarkupTable({
  initial,
  costCodes,
  save,
}: {
  initial: MarkupRow[];
  costCodes: { id: string; code: string | null; name: string }[];
  save: (rows: MarkupRow[]) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [rows, setRows] = useState(initial);
  const router = useRouter();
  return (
    <MarkupPanel
      inline
      rows={rows}
      amounts={null}
      costCodes={costCodes}
      locked={null}
      onChange={setRows}
      saveDefault={async (r) => {
        const res = await save(r);
        if (res.ok) router.refresh();
        return res;
      }}
    />
  );
}
