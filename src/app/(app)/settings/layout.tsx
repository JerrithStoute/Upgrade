import { requireAdmin } from "@/lib/auth";
import { PageHeader, Tabs } from "@/components/ui";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div>
      <PageHeader title="Settings" description="Company profile, team access, the cost code library, estimate templates, and the takeoff Item List, member sizes and templates." />
      <Tabs
        className="mb-6"
        items={[
          { href: "/settings", label: "Company", exact: true },
          { href: "/settings/team", label: "Team" },
          { href: "/settings/cost-codes", label: "Cost codes" },
          { href: "/settings/estimate-templates", label: "Estimate templates" },
          { href: "/settings/items", label: "Item list" },
          { href: "/settings/member-sizes", label: "Member sizes" },
          { href: "/settings/takeoff-templates", label: "Takeoff templates" },
        ]}
      />
      {children}
    </div>
  );
}
