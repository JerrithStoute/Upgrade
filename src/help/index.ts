import type { HelpArticle } from "./types";
import { JOBS } from "./articles/jobs";
import { SALES } from "./articles/sales";
import { TAKEOFF } from "./articles/takeoff";
import { ESTIMATES } from "./articles/estimates";
import { FINANCIALS } from "./articles/financials";
import { FINANCIALS_2 } from "./articles/financials-2";
import { FIELD } from "./articles/field";
import { SETTINGS } from "./articles/settings";

/** Every article in the manual. Within a page, the first one listed is the one Help opens to. */
export const ARTICLES: HelpArticle[] = [...JOBS, ...SALES, ...TAKEOFF, ...ESTIMATES, ...FINANCIALS, ...FINANCIALS_2, ...FIELD, ...SETTINGS];

/**
 * Pages that don't get an article. (None today: the people who run The Builder Station have their own
 * pages, under /station, outside the builders' program and its manual.) Every page must have one —
 * src/help/help.test.ts fails for a new page without, so nothing slips through.
 */
export const NO_HELP_PAGES: string[] = [];
