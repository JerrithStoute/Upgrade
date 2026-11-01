"use client";

import { usePathname } from "next/navigation";
import Link from "@/components/link";
import { CATALOG_GROUPS, settingsPageFor, type SettingsGroup } from "./settings-pages";

/**
 * The small heading of the newer pages: a way back (on a page), the name, and its note beside it. A page inside a
 * page (one template, Possible duplicates) gets just the way back to its list; it shows its own name.
 */
function Heading({ home, homeHref, about, groups }: { home: string; homeHref: string; about: string; groups?: SettingsGroup[] }) {
  const path = usePathname();
  const page = settingsPageFor(path, groups);
  if (page && path !== page.href)
    return (
      <Link href={page.href} className="no-print mb-0.5 inline-block text-xs text-slate-500 hover:text-slate-800">
        ← {page.label}
      </Link>
    );
  return (
    <div className="mb-4">
      {page ? (
        <Link href={homeHref} className="text-xs text-slate-500 hover:text-slate-800">
          ← {home}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold text-slate-900">{page ? page.label : home}</h1>
        <p className="text-xs text-slate-500">{page ? page.about : about}</p>
      </div>
    </div>
  );
}

/** Settings' heading: "Settings" on the home page; on a page, its name with the way back (like a job's pages). */
export function SettingsHeading() {
  return <Heading home="Settings" homeHref="/settings" about="Set up the program the way your company works. Pick what you want to change." />;
}

/** The Catalog's heading, the same way. */
export function CatalogHeading() {
  return (
    <Heading
      home="Catalog"
      homeHref="/catalog"
      about="What you build jobs from: your items and prices, how doors and windows are described, lumber, and templates."
      groups={CATALOG_GROUPS}
    />
  );
}
