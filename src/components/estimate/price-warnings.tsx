import Link from "next/link";
import { AlertTriangle, ChevronDown, Clock, RefreshCw } from "lucide-react";
import { cn, fmtDate, money, num } from "@/lib/utils";

/** Every name — they only show once you open the list. */
function Names({ names }: { names: string[] }) {
  return (
    <ul className="mt-1.5 max-h-60 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs">
      {names.map((n, i) => (
        <li key={i}>{n}</li>
      ))}
    </ul>
  );
}

const TONE = {
  amber: "border-amber-200 bg-amber-50 text-amber-900",
  blue: "border-blue-200 bg-blue-50 text-blue-900",
  rose: "border-rose-200 bg-rose-50 text-rose-900",
};

/**
 * One line: the icon, what's wrong and a few words why. With `children`, "Show list"
 * opens the rest (the names, how to fix them) underneath.
 */
function Box({ tone, icon, title, note, children }: { tone: keyof typeof TONE; icon: React.ReactNode; title: string; note?: React.ReactNode; children?: React.ReactNode }) {
  const line = (
    <>
      <span className="shrink-0">{icon}</span>
      {/* A list line stays one line (it opens for the rest); a plain one may wrap, so its link stays in view. */}
      <span className={cn("min-w-0 flex-1", children && "truncate")}>
        <b className="font-semibold">{title}</b>
        {note ? <span className="text-xs"> — {note}</span> : null}
      </span>
    </>
  );
  if (!children) return <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm", TONE[tone])}>{line}</div>;
  return (
    <details className={cn("group rounded-lg border px-3 py-1.5 text-sm", TONE[tone])}>
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        {line}
        <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium underline-offset-2 hover:underline">
          <span className="group-open:hidden">Show list</span>
          <span className="hidden group-open:inline">Hide list</span>
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="pb-1.5 pl-6">{children}</div>
    </details>
  );
}

const link = "font-medium underline underline-offset-2 hover:no-underline";

/**
 * Before a proposal goes out: takeoff items with no price, estimate items at $0,
 * Item List prices that moved since the job was priced, and pricing past its
 * "good for" date. Shows nothing when all is well.
 */
export function PriceWarnings({
  unpriced = [],
  zeroLines = [],
  changed,
  expired,
  materialsHref,
  rebidHref,
  className,
}: {
  unpriced?: { name: string; quantity: number; unit: string }[];
  zeroLines?: string[];
  changed?: { count: number; change: number };
  expired?: { on: Date; days: number };
  materialsHref: string;
  rebidHref: string;
  className?: string;
}) {
  const parts: React.ReactNode[] = [];
  if (unpriced.length)
    parts.push(
      <Box
        key="unpriced"
        tone="amber"
        icon={<AlertTriangle className="h-4 w-4" />}
        title={`${unpriced.length} takeoff item${unpriced.length === 1 ? " has" : "s have"} no price`}
        note="they count as $0 on the estimate and the proposal."
      >
        <Names names={unpriced.map((u) => `${u.name} — ${num(u.quantity, 2)} ${u.unit}`)} />
        <p className="mt-1.5 text-xs">
          Price them in the takeoff, the Material list or the Item List — the estimate picks them up the next time you open it.{" "}
          <Link href={materialsHref} className={link}>
            Material list
          </Link>
        </p>
      </Box>,
    );
  if (zeroLines.length)
    parts.push(
      <Box
        key="zero"
        tone="amber"
        icon={<AlertTriangle className="h-4 w-4" />}
        title={`${zeroLines.length} item${zeroLines.length === 1 ? " is" : "s are"} $0 on this estimate`}
        note="give them a cost, delete them, or make them optional."
      >
        <Names names={zeroLines} />
      </Box>,
    );
  if (changed && changed.count)
    parts.push(
      <Box
        key="changed"
        tone="blue"
        icon={<RefreshCw className="h-4 w-4" />}
        title={`Item List prices changed for ${changed.count} item${changed.count === 1 ? "" : "s"} since this job's prices were locked`}
        note={
          <>
            {changed.change >= 0 ? "+" : "−"}
            {money(Math.abs(changed.change))} in cost; the job keeps its locked prices.{" "}
            <Link href={rebidHref} className={link}>
              Price review
            </Link>
          </>
        }
      />,
    );
  if (expired)
    parts.push(
      <Box
        key="expired"
        tone="rose"
        icon={<Clock className="h-4 w-4" />}
        title={`The pricing on this proposal expired ${fmtDate(expired.on)}`}
        note={
          <>
            it was good for {expired.days} days. Make a new version to send again, with{" "}
            <Link href={rebidHref} className={link}>
              Price review
            </Link>{" "}
            for today&apos;s prices.
          </>
        }
      />,
    );
  if (!parts.length) return null;
  return <div className={cn("no-print space-y-1.5", className)}>{parts}</div>;
}

/** Estimate lines that would show at $0: in the price, not from the takeoff (the takeoff check covers those). */
export function zeroLineNames(items: { description: string; quantity: number; unitCost: number; isOptional: boolean; takeoffRollup: string | null }[]) {
  return items.filter((i) => !i.isOptional && !i.takeoffRollup && !(i.quantity * i.unitCost > 0)).map((i) => i.description.trim() || "Untitled item");
}
