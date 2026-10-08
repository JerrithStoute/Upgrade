import { requireReports } from "@/lib/auth";
import { PageHeader, Tabs } from "@/components/ui";

export const metadata = { title: "Reports" };

/** Company-wide money reports: profit by job, WIP, cash flow, what clients owe. */
export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  await requireReports();
  return (
    <div>
      <PageHeader title="Reports" description="How your jobs are doing — worked out from your estimates, change orders, costs, bills, invoices and payments." />
      <div className="no-print">
        <Tabs
          className="mb-6"
          items={[
            { href: "/reports", label: "Job profit", exact: true },
            { href: "/reports/wip", label: "WIP (over / under billing)" },
            { href: "/reports/cash-flow", label: "Cash flow" },
            { href: "/reports/aging", label: "What clients owe (AR aging)" },
          ]}
        />
      </div>
      {children}
    </div>
  );
}
