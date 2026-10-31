import type { AreaKey } from "@/lib/access";

/**
 * The help manual, written for a builder who has never seen the program. Every article is laid
 * out the same way: what it is, how to use it, then each button and box — what it is and how to
 * use it — then good-to-know tips and related articles.
 *
 * Text is plain words; **two stars** make a word bold (button names, mostly).
 */

/** One button, box, menu or switch on the screen. */
export type HelpItem = {
  /** Its label exactly as it reads on screen. */
  name: string;
  /** What it is. */
  what: string;
  /** How to use it (left out when "what" already says it). */
  how?: string;
};

/** A part of the screen (the toolbar, the left panel…) and what's on it. */
export type HelpSection = {
  heading: string;
  /** A sentence or two about this part. */
  text?: string[];
  /** Step-by-step, numbered. */
  steps?: string[];
  items?: HelpItem[];
};

export type HelpGroup = "Getting started" | "Takeoff" | "Jobs" | "Estimates" | "Financials" | "Field" | "Directory" | "Catalog" | "Settings";

export type HelpArticle = {
  /** Its address in the manual: /help#slug. */
  slug: string;
  title: string;
  group: HelpGroup;
  /**
   * Who sees it: the area of the program it belongs to (people whose position hides that area
   * don't see its help), null for everyone on the team, "admin" for admin-only pages.
   */
  area: AreaKey | null | "admin";
  /**
   * The pages it explains, as addresses with * for any one part: "/projects/*\/takeoff/*".
   * The Help button opens the best match for the page you're on. Leave empty for a topic
   * that's reached from another article (Find walls, from the drawing screen's).
   */
  pages: string[];
  /** What it is — one or two sentences. */
  what: string;
  /** How to use it — the usual job, step by step. */
  how: string[];
  /** The screen, part by part: each button and box. */
  sections: HelpSection[];
  /** Good to know: gotchas and tips. */
  tips?: string[];
  /** Slugs of related articles. */
  related?: string[];
};
