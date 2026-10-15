import { Fragment } from "react";
import type { HelpArticle } from "@/help/types";
import { sectionId } from "@/help/find";

/** Text with **bold** words. */
export function Rich({ text }: { text: string }) {
  const parts = text.split("**");
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <strong key={i} className="font-semibold text-slate-900">
            {p}
          </strong>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * One article, laid out the same way every time: what it is, how to use it, each part of the
 * screen with its buttons (what it is, how to use it), good to know, related.
 * Used by the Help panel and the full manual page.
 */
export function HelpArticleView({
  article,
  titles,
  onOpen,
  headingLevel = 2,
}: {
  article: HelpArticle;
  /** slug → title, for the Related links. */
  titles: Record<string, string>;
  /** Open a related article (the panel); without it, related articles link to the manual page. */
  onOpen?: (slug: string) => void;
  headingLevel?: 1 | 2;
}) {
  const H = headingLevel === 1 ? "h1" : "h2";
  const related = (article.related ?? []).filter((s) => titles[s]);
  return (
    <article id={article.slug} className="help-article scroll-mt-20 space-y-5 text-sm leading-relaxed text-slate-700">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{article.group}</p>
        <H className="text-lg font-semibold text-slate-900">{article.title}</H>
      </header>

      <section className="space-y-1">
        <h3 className="font-semibold text-slate-900">What it is</h3>
        <p>
          <Rich text={article.what} />
        </p>
      </section>

      {article.how.length ? (
        <section id={sectionId(article.slug, "How to use it")} className="scroll-mt-20 space-y-1">
          <h3 className="font-semibold text-slate-900">How to use it</h3>
          <ol className="list-decimal space-y-1 pl-5">
            {article.how.map((t, i) => (
              <li key={i}>
                <Rich text={t} />
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {article.sections.map((s) => (
        <section key={s.heading} id={sectionId(article.slug, s.heading)} className="scroll-mt-20 space-y-2">
          <h3 className="border-b border-slate-200 pb-1 font-semibold text-slate-900">{s.heading}</h3>
          {s.text?.map((t, i) => (
            <p key={i}>
              <Rich text={t} />
            </p>
          ))}
          {s.steps?.length ? (
            <ol className="list-decimal space-y-1 pl-5">
              {s.steps.map((t, i) => (
                <li key={i}>
                  <Rich text={t} />
                </li>
              ))}
            </ol>
          ) : null}
          {s.items?.length ? (
            <dl className="space-y-2.5">
              {s.items.map((it) => (
                <div key={it.name} className="help-item border-l-2 border-slate-200 pl-3">
                  <dt className="font-semibold text-slate-900">{it.name}</dt>
                  <dd>
                    <Rich text={it.what} />
                  </dd>
                  {it.how ? (
                    <dd className="mt-0.5">
                      <span className="font-medium text-slate-900">How: </span>
                      <Rich text={it.how} />
                    </dd>
                  ) : null}
                </div>
              ))}
            </dl>
          ) : null}
        </section>
      ))}

      {article.tips?.length ? (
        <section id={sectionId(article.slug, "Good to know")} className="scroll-mt-20 space-y-1">
          <h3 className="font-semibold text-slate-900">Good to know</h3>
          <ul className="list-disc space-y-1 pl-5">
            {article.tips.map((t, i) => (
              <li key={i}>
                <Rich text={t} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {related.length ? (
        <section className="no-print space-y-1">
          <h3 className="font-semibold text-slate-900">Related</h3>
          <ul className="flex flex-wrap gap-2">
            {related.map((s) => (
              <li key={s}>
                {onOpen ? (
                  <button type="button" onClick={() => onOpen(s)} className="rounded-full px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-200 hover:bg-blue-50">
                    {titles[s]}
                  </button>
                ) : (
                  <a href={`#${s}`} className="rounded-full px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-200 hover:bg-blue-50">
                    {titles[s]}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
