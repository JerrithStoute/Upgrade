import { allows, type Access } from "@/lib/access";
import type { HelpArticle, HelpGroup } from "./types";

/** The manual's chapters, in order. */
export const GROUPS: HelpGroup[] = ["Getting started", "Takeoff", "Jobs", "Estimates", "Financials", "Field", "Settings"];

/** The articles this person sees: their position's areas (admins see everything). */
export function visibleArticles(articles: HelpArticle[], role: string, access: Access) {
  return articles.filter((a) => (a.area === "admin" ? role === "ADMIN" : role === "ADMIN" || allows(access, a.area, 1)));
}

/** How well a page pattern fits an address: the number of fixed parts, or -1 when it doesn't fit. */
function fit(pattern: string, pathname: string) {
  const p = pattern.split("/").filter(Boolean);
  const s = pathname.split("?")[0].split("#")[0].split("/").filter(Boolean);
  if (p.length !== s.length) return -1;
  let fixed = 0;
  for (let i = 0; i < p.length; i++) {
    if (p[i] === "*") continue;
    if (p[i] !== s[i]) return -1;
    fixed++;
  }
  return fixed;
}

/** Every article for this page, best fit first (the first is the one Help opens to). */
export function articlesForPath(articles: HelpArticle[], pathname: string) {
  const scored: { a: HelpArticle; score: number }[] = [];
  for (const a of articles) {
    const score = Math.max(-1, ...a.pages.map((p) => fit(p, pathname)));
    if (score >= 0) scored.push({ a, score });
  }
  // Best fit first; a tie keeps the order the articles are written in.
  return scored.sort((x, y) => y.score - x.score).map((x) => x.a);
}

/** Plain text of a bit of article text (drops the ** bold marks). */
export const plain = (t: string) => t.replace(/\*\*/g, "");

/** Every searchable bit of an article, with where it is (the section's heading, for jumping to it). */
function pieces(a: HelpArticle) {
  const out: { section: string | null; text: string; weight: number }[] = [
    { section: null, text: a.title, weight: 6 },
    { section: null, text: a.what, weight: 2 },
    ...a.how.map((t) => ({ section: "How to use it", text: t, weight: 1 })),
  ];
  for (const s of a.sections) {
    out.push({ section: s.heading, text: s.heading, weight: 3 });
    for (const t of [...(s.text ?? []), ...(s.steps ?? [])]) out.push({ section: s.heading, text: t, weight: 1 });
    for (const i of s.items ?? []) {
      out.push({ section: s.heading, text: i.name, weight: 4 });
      out.push({ section: s.heading, text: `${i.name} — ${i.what}${i.how ? ` ${i.how}` : ""}`, weight: 1 });
    }
  }
  for (const t of a.tips ?? []) out.push({ section: "Good to know", text: t, weight: 1 });
  return out.map((p) => ({ ...p, text: plain(p.text) }));
}

const words = (q: string) =>
  q
    .toLowerCase()
    .replace(/[^a-z0-9$%'"\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 || /\d/.test(w));

/** Words builders type that the manual says another way. */
const SAME: Record<string, string[]> = {
  zero: ["$0", "no price"],
  po: ["purchase order"],
  pos: ["purchase orders"],
  co: ["change order"],
  cos: ["change orders"],
  sqft: ["sq. ft.", "sf"],
  sub: ["subcontractor", "vendor"],
  subs: ["subcontractors", "vendors"],
};
const forms = (w: string) => [w, ...(SAME[w] ?? [])];

/** A word found in the text: whole word, or the start of one ("wall" finds "walls"), or a word that means the same. $0 finds "$0". */
const has = (text: string, w: string) => forms(w).some((x) => new RegExp(`(^|[^a-z0-9])${x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(text));

export type HelpHit = { slug: string; title: string; group: HelpGroup; section: string | null; snippet: string; score: number };

/**
 * Search: every word typed must be in the article somewhere; articles where the words sit
 * together (in one sentence, a button's name, the title) come first. The snippet is the
 * best-matching sentence, so you can tell which hit you want.
 */
export function searchHelp(articles: HelpArticle[], query: string, limit = 20): HelpHit[] {
  const ws = words(query);
  if (!ws.length) return [];
  const hits: HelpHit[] = [];
  for (const a of articles) {
    const ps = pieces(a);
    if (!ws.every((w) => ps.some((p) => has(p.text, w)))) continue;
    let best: (typeof ps)[number] | null = null;
    let bestScore = 0;
    let total = 0;
    for (const p of ps) {
      const n = ws.filter((w) => has(p.text, w)).length;
      if (!n) continue;
      // All the words in one place counts most; the whole phrase as typed, more still.
      const s = p.weight * n * n * (n === ws.length ? 2 : 1) * (p.text.toLowerCase().includes(query.trim().toLowerCase()) ? 2 : 1);
      total += s;
      if (s > bestScore) {
        bestScore = s;
        best = p;
      }
    }
    if (!best) continue;
    hits.push({ slug: a.slug, title: a.title, group: a.group, section: best.section, snippet: snippetOf(best.text, ws), score: bestScore * 10 + total });
  }
  return hits.sort((x, y) => y.score - x.score).slice(0, limit);
}

/** A sentence or so around the first word found, trimmed to about 160 characters. */
function snippetOf(text: string, ws: string[]) {
  if (text.length <= 160) return text;
  const lower = text.toLowerCase();
  const found = ws.flatMap(forms).map((w) => lower.indexOf(w.toLowerCase())).filter((i) => i >= 0);
  const at = found.length ? Math.min(...found) : 0;
  const from = Math.max(0, at - 60);
  return `${from > 0 ? "…" : ""}${text.slice(from, from + 160).trim()}${from + 160 < text.length ? "…" : ""}`;
}

/** A section's anchor inside an article: "find-walls--the-toolbar". */
export const sectionId = (slug: string, heading: string) =>
  `${slug}--${heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
