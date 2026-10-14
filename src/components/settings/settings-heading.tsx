"use client";

import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { settingsPageFor } from "./settings-pages";

/** Settings' heading: "Settings" on the home page; on a page, its name with the way back (like a job's pages). */
export function SettingsHeading() {
  const page = settingsPageFor(usePathname());
  if (!page) return <PageHeader title="Settings" description="Set up the program the way your company works. Pick what you want to change." />;
  return <PageHeader breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: page.label }]} title={page.label} description={page.about} />;
}
