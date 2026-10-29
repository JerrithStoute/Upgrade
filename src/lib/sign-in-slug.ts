/**
 * A builder's sign-in address for its clients and subs: app.thebuilderstation.com/login/<slug>.
 * Plain rules, no database — tested in sign-in-slug.test.ts.
 */

/** Taken by the program's own pages under /login. */
const RESERVED = new Set(["two-step", "setup", "station", "all", "team", "api", "new"]);

export const SLUG_RULE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

/** Usable as an address: 3–30 letters, numbers and dashes, not starting or ending with a dash. */
export const validSlug = (s: string | null | undefined): s is string => !!s && SLUG_RULE.test(s) && !RESERVED.has(s);

/** A short address from the company's name: its first word ("JT&I Custom Homes" → "jti"), longer if that's too short. */
export function slugFromName(name: string) {
  const words = name
    .normalize("NFKD")
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  let slug = words[0] ?? "";
  for (let i = 1; slug.replace(/-/g, "").length < 3 && i < words.length; i++) slug += `-${words[i]}`;
  slug = slug.slice(0, 30).replace(/-+$/, "");
  return validSlug(slug) ? slug : "builder";
}

/** What someone typed, made into an address (or null when nothing's left of it). */
export function cleanSlug(typed: string) {
  const s = typed
    .normalize("NFKD")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/, "");
  return s || null;
}

/** `slug`, or the first of slug-2, slug-3… not taken. */
export function firstFree(slug: string, taken: (s: string) => boolean) {
  if (!taken(slug) && validSlug(slug)) return slug;
  for (let n = 2; ; n++) {
    const s = `${slug.slice(0, 27)}-${n}`;
    if (!taken(s)) return s;
  }
}
