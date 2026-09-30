import { requireAdmin } from "@/lib/auth";
import { PageHeader, Tabs } from "@/components/ui";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div>
      <PageHeader title="Settings" description="Company profile, team access, the cost code library and estimate templates." />
      <Tabs
        className="mb-6"
        items={[
          { href: "/settings", label: "Company", exact: true },
          { href: "/settings/team", label: "Team" },
          { href: "/settings/cost-codes", label: "Cost codes" },
          { href: "/settings/estimate-templates", label: "Estimate templates" },
        ]}
      />
      {children}
    </div>
  );
}
