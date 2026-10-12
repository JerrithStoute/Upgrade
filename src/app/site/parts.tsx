import { Check } from "lucide-react";
import Link from "@/components/link";
import { cn } from "@/lib/utils";

/**
 * The website's screenshots (public/site-shots, taken from the Whitfield test job).
 * Width and height are set, so the page doesn't jump while they load.
 */
export const SHOTS: Record<"rafters" | "takeoff" | "estimate" | "schedule", { src: string; w: number; h: number; alt: string }> = {
  rafters: { src: "/site-shots/rafters.webp", w: 1490, h: 1000, alt: "A roof plan with rafters laid out by pitch in the takeoff" },
  takeoff: { src: "/site-shots/takeoff.webp", w: 1600, h: 1000, alt: "A floor plan with exterior and interior walls measured in the takeoff" },
  estimate: { src: "/site-shots/estimate.webp", w: 1360, h: 944, alt: "An estimate organized by division and category" },
  schedule: { src: "/site-shots/schedule.webp", w: 1360, h: 944, alt: "A job schedule" },
};

/** A screenshot in a plain browser frame. */
export function Shot({ shot, priority, className }: { shot: keyof typeof SHOTS; priority?: boolean; className?: string }) {
  const s = SHOTS[shot];
  return (
    <div className={cn("overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10", className)}>
      <div className="flex h-7 items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={s.src} width={s.w} height={s.h} alt={s.alt} loading={priority ? "eager" : "lazy"} className="block h-auto w-full" />
    </div>
  );
}

export function CheckList({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("space-y-2", className)}>
      {items.map((t) => (
        <li key={t} className="flex gap-2">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

/** The closing "ask for an invitation" band. */
export function InviteBand() {
  return (
    <section className="bg-blue-700">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 px-4 py-14 sm:px-6 md:flex-row md:items-center">
        <div className="text-white">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">We’re opening to builders a few at a time.</h2>
          <p className="mt-2 text-blue-100">Tell us a little about your company and we’ll send you an invitation.</p>
        </div>
        <Link href="/site/request-invite" className="shrink-0 rounded-md bg-white px-5 py-3 font-medium text-blue-800 shadow-sm hover:bg-blue-50 md:ml-auto">
          Request an invite
        </Link>
      </div>
    </section>
  );
}

/** A plain page heading for the inner pages. */
export function SiteHeading({ title, intro }: { title: string; intro?: string }) {
  return (
    <section className="border-b border-slate-100 bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {intro ? <p className="mt-4 max-w-2xl text-lg text-slate-600">{intro}</p> : null}
      </div>
    </section>
  );
}
