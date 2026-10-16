"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { ArrowLeft, BookOpen, CircleHelp, List, Search, X } from "lucide-react";
import type { Access } from "@/lib/access";
import type { HelpArticle } from "@/help/types";
import {
  GROUPS,
  articlesForPath,
  searchHelp,
  sectionId,
  visibleArticles,
} from "@/help/find";
import { HelpArticleView, Rich } from "./help-article";
import { OPEN_HELP, type OpenHelp } from "./help-link";

type View =
  { kind: "toc" } | { kind: "article"; slug: string; section?: string | null };

/**
 * The ? in the top bar: the manual in a panel at the side, opened to the article for the page
 * you're on, with a search box. The articles load the first time it's opened.
 */
export function HelpButton({ role, access }: { role: string; access: Access }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<HelpArticle[] | null>(null);
  const [view, setView] = useState<View>({ kind: "toc" });
  const [back, setBack] = useState<View[]>([]);
  const [query, setQuery] = useState("");
  const body = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const articles = useMemo(
    () => (all ? visibleArticles(all, role, access) : []),
    [all, role, access],
  );
  const titles = useMemo(
    () => Object.fromEntries(articles.map((a) => [a.slug, a.title])),
    [articles],
  );
  const here = useMemo(
    () => articlesForPath(articles, pathname),
    [articles, pathname],
  );
  const hits = useMemo(() => searchHelp(articles, query), [articles, query]);

  /** Opens the panel: to the article for this page, or (a HelpLink's ?) to the article and part asked for. */
  const show = async (to?: OpenHelp) => {
    setOpen(true);
    const list = all ?? (await import("@/help")).ARTICLES;
    if (!all) setAll(list);
    const visible = visibleArticles(list, role, access);
    const page = to && visible.some((a) => a.slug === to.slug) ? visible.find((a) => a.slug === to.slug) : articlesForPath(visible, pathname)[0];
    setView(page ? { kind: "article", slug: page.slug, section: to?.section ?? null } : { kind: "toc" });
    setBack([]);
    setQuery("");
    setTimeout(() => search.current?.focus(), 0);
  };
  const go = (v: View) => {
    setBack((b) => [...b, view]);
    setView(v);
    setQuery("");
  };

  // ? opens it (when you're not typing in a box); Esc closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing =
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable);
      if (e.key === "Escape" && open) setOpen(false);
      else if (e.key === "?" && !typing && !open) {
        e.preventDefault();
        void show();
      }
    };
    window.addEventListener("keydown", onKey);
    // A ? beside a heading (HelpLink): straight to its part of the manual.
    const onAsk = (e: Event) => void show((e as CustomEvent<OpenHelp>).detail);
    window.addEventListener(OPEN_HELP, onAsk);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_HELP, onAsk);
    };
  });

  // Opening an article: to the top, or to the part a search found.
  useEffect(() => {
    if (!open || !body.current) return;
    if (view.kind === "article" && view.section) {
      const el = body.current.querySelector(
        `[id="${sectionId(view.slug, view.section)}"]`,
      );
      if (el) {
        el.scrollIntoView({ block: "start" });
        return;
      }
    }
    body.current.scrollTop = 0;
  }, [view, open]);

  const article =
    view.kind === "article"
      ? articles.find((a) => a.slug === view.slug)
      : undefined;
  const alsoHere = article ? here.filter((a) => a.slug !== article.slug) : [];

  return (
    <>
      <button
        type="button"
        onClick={() => void show()}
        className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
        title="Help — how this page works (or press ?)"
      >
        <CircleHelp className="h-4 w-4" />
        <span className="sr-only">Help</span>
      </button>
      {/* On the page itself, not inside the top bar: the bar's blur would box a fixed panel into it. */}
      {open
        ? createPortal(
            <div
              className="no-print fixed inset-0 z-50 flex justify-end"
              role="dialog"
              aria-modal="true"
              aria-label="Help"
            >
              <button
                type="button"
                className="absolute inset-0 cursor-default bg-slate-900/20"
                aria-label="Close help"
                onClick={() => setOpen(false)}
              />
              <div className="relative flex h-full w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-xl">
                <div className="space-y-2 border-b border-slate-200 p-3">
                  <div className="flex items-center gap-1">
                    {back.length ? (
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                        title="Back"
                        onClick={() => {
                          setView(back[back.length - 1]);
                          setBack((b) => b.slice(0, -1));
                          setQuery("");
                        }}
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                    ) : null}
                    <p className="flex-1 text-sm font-semibold text-slate-900">
                      Help
                    </p>
                    <button
                      type="button"
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                      onClick={() => go({ kind: "toc" })}
                    >
                      <List className="h-3.5 w-3.5" /> All topics
                    </button>
                    <a
                      href={`/help${article ? `#${article.slug}` : ""}`}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                      title="The whole manual on one page — to read through or print"
                    >
                      <BookOpen className="h-3.5 w-3.5" /> Full manual
                    </a>
                    <button
                      type="button"
                      className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                      title="Close (Esc)"
                      onClick={() => setOpen(false)}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      ref={search}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search help — e.g. find walls, zero price, overtime"
                      className="input !pl-8"
                      aria-label="Search help"
                    />
                  </div>
                </div>

                <div ref={body} className="flex-1 overflow-y-auto p-4">
                  {!all ? (
                    <p className="text-sm text-slate-500">Loading…</p>
                  ) : query.trim() ? (
                    hits.length ? (
                      <ul className="space-y-1">
                        {hits.map((h) => (
                          <li key={h.slug}>
                            <button
                              type="button"
                              className="w-full rounded-lg p-2 text-left hover:bg-slate-50"
                              onClick={() =>
                                go({
                                  kind: "article",
                                  slug: h.slug,
                                  section: h.section,
                                })
                              }
                            >
                              <span className="block text-sm font-medium text-slate-900">
                                {h.title}
                                {h.section ? (
                                  <span className="font-normal text-slate-500">
                                    {" "}
                                    · {h.section}
                                  </span>
                                ) : null}
                              </span>
                              <span className="block text-xs text-slate-600">
                                {h.snippet}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-500">
                        Nothing in the manual matches “{query.trim()}”. Try
                        fewer or different words.
                      </p>
                    )
                  ) : article ? (
                    <div className="space-y-5">
                      <HelpArticleView
                        article={article}
                        titles={titles}
                        onOpen={(s) => go({ kind: "article", slug: s })}
                      />
                      {alsoHere.length ? (
                        <div className="space-y-1 border-t border-slate-200 pt-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            More about this page
                          </p>
                          <ul className="flex flex-wrap gap-2">
                            {alsoHere.map((a) => (
                              <li key={a.slug}>
                                <button
                                  type="button"
                                  onClick={() =>
                                    go({ kind: "article", slug: a.slug })
                                  }
                                  className="rounded-full px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-200 hover:bg-blue-50"
                                >
                                  {a.title}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <Topics
                      articles={articles}
                      onOpen={(s) => go({ kind: "article", slug: s })}
                    />
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** Every article, chapter by chapter. */
function Topics({
  articles,
  onOpen,
}: {
  articles: HelpArticle[];
  onOpen: (slug: string) => void;
}) {
  return (
    <div className="space-y-4">
      {GROUPS.map((g) => {
        const list = articles.filter((a) => a.group === g);
        if (!list.length) return null;
        return (
          <section key={g} className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {g}
            </h3>
            <ul>
              {list.map((a) => (
                <li key={a.slug}>
                  <button
                    type="button"
                    className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"
                    onClick={() => onOpen(a.slug)}
                  >
                    <span className="block text-sm font-medium text-slate-900">
                      {a.title}
                    </span>
                    <span className="line-clamp-1 block text-xs text-slate-500">
                      <Rich text={a.what} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
