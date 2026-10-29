"use client";

import { CircleHelp } from "lucide-react";

/** The event a HelpLink sends; the Help button (top bar) opens the manual to that article and part. */
export const OPEN_HELP = "open-help";
export type OpenHelp = { slug: string; section?: string };

/**
 * A small ? beside a heading: opens Help right at the part of the manual that explains it — so
 * "what is this?" is one click from where you're looking.
 */
export function HelpLink({ slug, section, label = "What's this?" }: OpenHelp & { label?: string }) {
  return (
    <button
      type="button"
      className="tap no-print inline-flex shrink-0 items-center rounded-full p-0.5 align-middle text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent<OpenHelp>(OPEN_HELP, { detail: { slug, section } }));
      }}
    >
      <CircleHelp className="h-4 w-4" />
    </button>
  );
}
