import Link from "@/components/link";
import { ChevronRight } from "lucide-react";
import type { SettingsGroup } from "./settings-pages";

/** The Settings and Catalog home pages: every page, in its group, with what it's for. */
export function PageGroups({ groups }: { groups: SettingsGroup[] }) {
  return (
    <div className="columns-1 gap-5 md:columns-2 xl:columns-3">
      {groups.map((g) => (
        <section key={g.title} className="mb-5 break-inside-avoid rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-blue-700">
              <g.icon className="h-4 w-4" />
            </span>
            {g.title}
          </h2>
          <ul className="p-1.5">
            {g.pages.map((p) => (
              <li key={p.href}>
                <Link href={p.href} className="group flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-slate-50">
                  <p.icon className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-blue-700" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800 group-hover:text-blue-800">{p.label}</span>
                    <span className="block truncate text-xs text-slate-500">{p.about}</span>
                  </span>
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
