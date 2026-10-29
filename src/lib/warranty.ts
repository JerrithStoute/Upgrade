/**
 * Warranty requests: after move-in, the client reports something to fix in their portal (or you add
 * it from a phone call), you send a sub or someone on your team, and it's tracked to done.
 *
 * Plain rules, no database — tested in warranty.test.ts. Saving and emails: warranty-server.ts.
 */

export const WARRANTY_STATUSES = ["NEW", "SCHEDULED", "DONE", "NOT_COVERED"] as const;
export type WarrantyStatus = (typeof WARRANTY_STATUSES)[number];

/** Still to do. */
export const OPEN_WARRANTY: WarrantyStatus[] = ["NEW", "SCHEDULED"];
export const isOpen = (status: string) => (OPEN_WARRANTY as string[]).includes(status);

/** The words everyone sees — the client, the sub and the team alike. */
export function warrantyLabel(status: string) {
  switch (status) {
    case "SCHEDULED":
      return "Scheduled";
    case "DONE":
      return "Done";
    case "NOT_COVERED":
      return "Not covered";
    default:
      return "New";
  }
}

export function warrantyTone(status: string) {
  switch (status) {
    case "SCHEDULED":
      return "bg-blue-50 text-blue-800 ring-blue-200";
    case "DONE":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "NOT_COVERED":
      return "bg-slate-100 text-slate-600 ring-slate-200";
    default:
      return "bg-amber-50 text-amber-900 ring-amber-200";
  }
}

/** W-12 */
export const warrantyNo = (n: number) => `W-${n}`;

/** When a job's warranty runs out: `months` after it was finished. Null: not finished yet. */
export function warrantyEnds(finished: Date | null | undefined, months: number) {
  if (!finished) return null;
  const d = new Date(finished);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  // Jan 31 + 1 month = Feb 28/29, not March 3.
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d;
}

/** "Under warranty until …", "Warranty ended …", or not finished yet — one sentence, said the same everywhere. */
export function warrantyWords(finished: Date | null | undefined, months: number, today: Date, fmt: (d: Date) => string) {
  const ends = warrantyEnds(finished, months);
  if (!ends) return { covered: null as boolean | null, text: "The warranty starts when the job is finished (its actual end date)." };
  return ends >= today ? { covered: true, text: `Under warranty until ${fmt(ends)}.` } : { covered: false, text: `The warranty ended ${fmt(ends)}.` };
}

/** Where a job is in its warranty: shown once it's finished, or as soon as it has a request. */
export const showsWarranty = (p: { status: string; actualEndDate: Date | null }, requests: number) => p.status === "COMPLETED" || !!p.actualEndDate || requests > 0;

/** Open first (urgent, then oldest), then the closed ones (newest first). */
export function sortWarranty<T extends { status: string; urgent: boolean; createdAt: Date; closedAt: Date | null }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const ao = isOpen(a.status), bo = isOpen(b.status);
    if (ao !== bo) return ao ? -1 : 1;
    if (ao) return Number(b.urgent) - Number(a.urgent) || a.createdAt.getTime() - b.createdAt.getTime();
    return (b.closedAt ?? b.createdAt).getTime() - (a.closedAt ?? a.createdAt).getTime();
  });
}
