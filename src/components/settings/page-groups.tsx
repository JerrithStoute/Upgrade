import Link from "@/components/link";
import { ChevronRight } from "lucide-react";
import type { SettingsGroup } from "./settings-pages";

/** The Settings and Catalog home pages: every page, in its group, with what it's for — and, where given, how many it holds. */
export function PageGroups({ groups, counts }: { groups: SettingsGroup[]; counts?: Record<string, string> }) {
  return (
    <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
      {groups.map((g) => (
        <section key={g.title} className="mb-4 break-inside-avoid rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-blue-50 text-blue-700">
              <g.icon className="h-3.5 w-3.5" />
            </span>
            {g.title}
          </h2>
          <ul>
            {g.pages.map((p) => (
              <li key={p.href} className="border-t border-slate-100 first:border-t-0">
                <Link href={p.href} className="group flex items-center gap-3 px-4 py-2 hover:bg-slate-50">
                  <p.icon className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-blue-700" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800 group-hover:text-blue-800">{p.label}</span>
                    <span className="block truncate text-xs text-slate-500">{p.about}</span>
                  </span>
                  {counts?.[p.href] ? <span className="shrink-0 whitespace-nowrap text-xs text-slate-400">{counts[p.href]}</span> : null}
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-slate-500" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
