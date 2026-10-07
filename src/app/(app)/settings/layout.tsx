import { requireAdmin } from "@/lib/auth";
import { PageHeader, Tabs } from "@/components/ui";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Company profile, team access, the cost code library, estimate divisions, parameters and templates, the takeoff Item List, member sizes, span tables and templates, the vendors you get bids from, and your work week, delay reasons and schedule templates."
      />
      <Tabs
        className="mb-6"
        items={[
          { href: "/settings", label: "Company", exact: true },
          { href: "/settings/team", label: "Team" },
          { href: "/settings/billing", label: "Billing" },
          { href: "/settings/cost-codes", label: "Cost codes" },
          { href: "/settings/estimate-divisions", label: "Estimate divisions" },
          { href: "/settings/estimate-parameters", label: "Estimate parameters" },
          { href: "/settings/estimate-templates", label: "Estimate templates" },
          { href: "/settings/items", label: "Item list" },
          { href: "/settings/member-sizes", label: "Member sizes" },
          { href: "/settings/span-tables", label: "Span tables" },
          { href: "/settings/vendors", label: "Vendors" },
          { href: "/settings/takeoff-templates", label: "Takeoff templates" },
          { href: "/settings/schedule", label: "Schedule" },
          { href: "/settings/schedule-templates", label: "Schedule templates" },
        ]}
      />
      {children}
    </div>
  );
}
