import { requireStaff } from "@/lib/auth";
import { ARTICLES } from "@/help";
import { GROUPS, visibleArticles } from "@/help/find";
import { HelpArticleView } from "@/components/help/help-article";
import { PrintButton } from "../projects/[id]/_components/print-button";

export const metadata = { title: "Help manual" };

/** The whole manual on one page: contents first, then every article — to read through or print (letter paper). */
export default async function HelpPage() {
  const user = await requireStaff();
  const articles = visibleArticles(ARTICLES, user.role, user.access);
  const titles = Object.fromEntries(articles.map((a) => [a.slug, a.title]));
  const groups = GROUPS.map((g) => [g, articles.filter((a) => a.group === g)] as const).filter(([, list]) => list.length);
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <style>{`@media print { @page { size: letter; margin: 0.6in; } .help-chapter { break-before: page; } .help-chapter:first-of-type { break-before: auto; } .help-item { break-inside: avoid; } }`}</style>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">The Builder Station manual</h1>
          <p className="text-sm text-slate-600">
            How every part of the program works: what each button is and how to use it. The <strong>?</strong> at the top of any page opens the part for that page, with a search
            box.
          </p>
        </div>
        <PrintButton label="Print the manual" />
      </header>

      <nav className="rounded-xl border border-slate-200 p-4">
        <p className="mb-2 text-sm font-semibold text-slate-900">Contents</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {groups.map(([g, list]) => (
            <div key={g}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{g}</p>
              <ul className="mt-1 space-y-0.5 text-sm">
                {list.map((a) => (
                  <li key={a.slug}>
                    <a href={`#${a.slug}`} className="text-blue-700 hover:underline">
                      {a.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {groups.map(([g, list]) => (
        <section key={g} className="help-chapter space-y-10">
          <h2 className="border-b-2 border-slate-900 pb-1 text-base font-bold uppercase tracking-wide text-slate-900">{g}</h2>
          {list.map((a) => (
            <HelpArticleView key={a.slug} article={a} titles={titles} />
          ))}
        </section>
      ))}
    </div>
  );
}
