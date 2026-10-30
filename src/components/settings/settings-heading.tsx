"use client";

import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { CATALOG_GROUPS, settingsPageFor } from "./settings-pages";

/** Settings' heading: "Settings" on the home page; on a page, its name with the way back (like a job's pages). */
export function SettingsHeading() {
  const page = settingsPageFor(usePathname());
  if (!page) return <PageHeader title="Settings" description="Set up the program the way your company works. Pick what you want to change." />;
  return <PageHeader breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: page.label }]} title={page.label} description={page.about} />;
}

/** The Catalog's heading, the same way. */
export function CatalogHeading() {
  const page = settingsPageFor(usePathname(), CATALOG_GROUPS);
  if (!page)
    return <PageHeader title="Catalog" description="What you build jobs from: your items and prices, how doors and windows are described, lumber, and templates." />;
  return <PageHeader breadcrumbs={[{ label: "Catalog", href: "/catalog" }, { label: page.label }]} title={page.label} description={page.about} />;
}
