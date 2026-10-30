import { requireStaff } from "@/lib/auth";
import { allows, areaForPath } from "@/lib/access";
import { SETTINGS_GROUPS } from "@/components/settings/settings-pages";
import { PageGroups } from "@/components/settings/page-groups";

export const metadata = { title: "Settings" };

/** Settings home: every setting, grouped by the part of the program it sets up. Each shows only if the person may open it. */
export default async function SettingsHomePage() {
  const user = await requireStaff();
  const mayOpen = (href: string) => {
    const area = areaForPath(href);
    return user.role === "ADMIN" || (area !== null && allows(user.access, area, 1));
  };
  return <PageGroups groups={SETTINGS_GROUPS.map((g) => ({ ...g, pages: g.pages.filter((p) => mayOpen(p.href)) })).filter((g) => g.pages.length)} />;
}
