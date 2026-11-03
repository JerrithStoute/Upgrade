import Link from "@/components/link";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn, fmtDate, money } from "@/lib/utils";
import { EscalationCoButton } from "./escalation-co-button";

/**
 * On a sent or approved estimate: what its materials cost today against its bid snapshot —
 * bid quantities, today's prices. Red past the company's escalation trigger (the whole
 * increase can be charged), gray under it or when prices went down.
 */
export function EscalationLine({
  e,
  sheetHref,
  settingsHref,
  makeCo,
}: {
  e: { kind: "SENT" | "SIGNED"; takenAt: Date; then: number; now: number; change: number; pct: number; triggerPct: number; past: boolean; fileId: string | null };
  sheetHref: string;
  settingsHref?: string;
  /** Past the trigger, for someone who may make change orders: "Make escalation change order". */
  makeCo?: { projectId: string; estimateId: string };
}) {
  const since = e.kind === "SENT" ? `your ${fmtDate(e.takenAt, "MMM d, yyyy")} proposal` : `the contract was signed ${fmtDate(e.takenAt, "MMM d, yyyy")}`;
  const up = e.change > 0.005;
  const down = e.change < -0.005;
  const trigger = `${e.triggerPct}%`;
  const link = "font-medium underline underline-offset-2 hover:no-underline";
  return (
    <div
      className={cn(
        "no-print flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border px-3 py-1.5 text-xs",
        e.past ? "border-rose-200 bg-rose-50 text-rose-900" : "border-slate-200 bg-slate-50 text-slate-700",
      )}
    >
      {down ? <TrendingDown className="h-4 w-4 shrink-0" /> : <TrendingUp className="h-4 w-4 shrink-0" />}
      <span>
        <b className="font-semibold">
          Materials since {since}: {up ? `up ${e.pct}%` : down ? `down ${Math.abs(e.pct)}%` : "no change"}
        </b>
        {up || down ? ` (${up ? "+" : "−"}${money(Math.abs(e.change))}: ${money(e.then)} → ${money(e.now)})` : ""}
        {e.past
          ? ` — past your ${trigger} escalation trigger: the whole increase, ${money(e.change)}, can be charged.`
          : up
            ? ` — under your ${trigger} escalation trigger.`
            : ""}
      </span>
      <span className="text-[11px] opacity-80">Bid quantities, today&apos;s prices, materials only.</span>
      <span className="ml-auto flex items-center gap-3">
        {e.past && makeCo ? <EscalationCoButton {...makeCo} asLink /> : null}
        <Link href={sheetHref} className={link}>
          Price change sheet
        </Link>
        {e.fileId ? (
          <a href={`/api/files/${e.fileId}`} target="_blank" rel="noreferrer" className={link}>
            {e.kind === "SENT" ? "Sent" : "Signed"} snapshot (PDF)
          </a>
        ) : null}
        {settingsHref ? (
          <Link href={settingsHref} className={link}>
            Trigger
          </Link>
        ) : null}
      </span>
    </div>
  );
}
