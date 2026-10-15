import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ADMIN_ACCESS, NO_ACCESS, STARTER_POSITIONS } from "@/lib/access";
import { ARTICLES, NO_HELP_PAGES } from "./index";
import { articlesForPath, searchHelp, sectionId, visibleArticles } from "./find";

/** Every staff page, as an address with * for the parts that change ("/projects/*\/takeoff/*"). */
function staffPages() {
  const root = join(process.cwd(), "src", "app", "(app)");
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === "page.tsx") {
        const route = p.slice(root.length).split("\\").join("/").replace(/\/page\.tsx$/, "").replace(/\[[^\]]+\]/g, "*");
        out.push(route || "/");
      }
    }
  };
  walk(root);
  return out;
}
const fits = (pattern: string, page: string) => {
  const a = pattern.split("/").filter(Boolean);
  const b = page.split("/").filter(Boolean);
  return a.length === b.length && a.every((s, i) => s === "*" || s === b[i]);
};

describe("help manual", () => {
  it("every page has an article — or is a page that gets none (and that list is current)", () => {
    const pages = staffPages();
    const missing = pages.filter((p) => !articlesForPath(ARTICLES, p).length && !NO_HELP_PAGES.some((n) => fits(n, p)));
    assert.deepEqual(missing, [], `Pages with no help article — write one in src/help/articles: ${missing.join(", ")}`);
    const stale = NO_HELP_PAGES.filter((n) => !pages.some((p) => fits(n, p)) || pages.some((p) => fits(n, p) && articlesForPath(ARTICLES, p).length));
    assert.deepEqual(stale, [], `No-help entries with no page, or that now have an article — take them off: ${stale.join(", ")}`);
  });

  it("articles are well formed: unique slugs, related links that exist, every section heading unique", () => {
    const slugs = new Set<string>();
    for (const a of ARTICLES) {
      assert.ok(!slugs.has(a.slug), `two articles named ${a.slug}`);
      slugs.add(a.slug);
      assert.ok(a.what.length > 20 && a.title, `${a.slug} needs a title and what it is`);
      const ids = a.sections.map((s) => sectionId(a.slug, s.heading));
      assert.equal(new Set(ids).size, ids.length, `${a.slug} has two sections with the same heading`);
      for (const s of a.sections) for (const i of s.items ?? []) assert.ok(i.what, `${a.slug}: "${i.name}" says what it is`);
      // Bold marks come in pairs.
      const all = [a.what, ...a.how, ...(a.tips ?? []), ...a.sections.flatMap((s) => [...(s.text ?? []), ...(s.steps ?? []), ...(s.items ?? []).flatMap((i) => [i.what, i.how ?? ""])])];
      for (const t of all) assert.equal((t.match(/\*\*/g) ?? []).length % 2, 0, `${a.slug}: unpaired ** in "${t.slice(0, 60)}"`);
    }
    for (const a of ARTICLES) for (const r of a.related ?? []) assert.ok(slugs.has(r), `${a.slug} links to missing article ${r}`);
  });

  it("Help opens to the page's own article", () => {
    const first = (p: string) => articlesForPath(ARTICLES, p)[0]?.slug;
    assert.equal(first("/projects/abc/takeoff/def"), "takeoff-screen");
    assert.equal(first("/projects/abc/takeoff/rebid"), "price-review");
    assert.equal(first("/projects/abc/estimate"), "estimate");
    assert.equal(first("/projects/new"), "projects");
    assert.equal(first("/projects/abc"), "project-page");
    assert.equal(first("/settings/items?unpriced=1"), "item-list");
    assert.equal(first("/time/sheets"), "timesheets");
    assert.equal(first("/dashboard"), "dashboard");
    assert.equal(first("/schedule/calendar"), "company-schedule");
    // The drawing screen has more articles than its own: Find walls, Floor above…
    const more = articlesForPath(ARTICLES, "/projects/abc/takeoff/def").map((a) => a.slug);
    for (const s of ["find-walls", "upper-floor", "takeoff-joists", "takeoff-scale"]) assert.ok(more.includes(s), s);
  });

  it("search finds what a builder would type", () => {
    const top = (q: string) => searchHelp(ARTICLES, q)[0]?.slug;
    assert.equal(top("find walls"), "find-walls");
    assert.equal(top("calibrate"), "takeoff-scale");
    assert.equal(top("needs a price"), "item-list");
    assert.equal(top("overtime"), "time-clock-settings");
    assert.equal(top("change order"), "change-orders");
    assert.ok(searchHelp(ARTICLES, "floor above").some((h) => h.slug === "upper-floor"));
    assert.ok(searchHelp(ARTICLES, "wall").length > 3, "a word finds every article it's in, and the start of a word matches (wall → walls)");
    assert.ok(searchHelp(ARTICLES, "zero price").slice(0, 3).some((h) => h.slug === "item-list"), "zero finds $0 — the example in the search box");
    assert.ok(searchHelp(ARTICLES, "po").some((h) => h.slug === "purchasing"), "PO finds purchase order");
    assert.ok(searchHelp(ARTICLES, "rain delay").some((h) => h.slug === "job-schedule"), "rain delay finds Delay this job");
    assert.deepEqual(searchHelp(ARTICLES, "zzzz qqq"), []);
    assert.deepEqual(searchHelp(ARTICLES, "  "), []);
    const hit = searchHelp(ARTICLES, "mark sent")[0];
    assert.ok(hit.snippet.toLowerCase().includes("mark sent"), "the snippet shows where it matched");
  });

  it("people see help only for what their position opens", () => {
    const crew = STARTER_POSITIONS.find((p) => p.key === "FIELD")!.access;
    const seen = visibleArticles(ARTICLES, "STAFF", crew).map((a) => a.slug);
    assert.ok(seen.includes("time-clock"), "everyone has their time clock");
    assert.ok(!seen.includes("invoices") || crew.invoices > 0);
    assert.ok(!seen.includes("time-clock-settings"), "admin pages are admins' only");
    assert.equal(visibleArticles(ARTICLES, "ADMIN", ADMIN_ACCESS).length, ARTICLES.length);
    assert.ok(!visibleArticles(ARTICLES, "STAFF", NO_ACCESS).some((a) => a.area !== null), "no access: only everyone's articles");
  });
});
