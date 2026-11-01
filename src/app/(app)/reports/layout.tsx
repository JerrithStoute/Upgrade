import { requireView } from "@/lib/auth";
import { Tabs } from "@/components/ui";

export const metadata = { title: "Reports" };

/** Company-wide money reports: profit by job, WIP, cash flow, what clients owe. */
export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  await requireView("reports");
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold text-slate-900">Reports</h1>
        <p className="text-xs text-slate-500">How your jobs are doing — from your estimates, change orders, costs, bills, invoices and payments.</p>
      </div>
      <div className="no-print">
        <Tabs
          className="mb-4"
          items={[
            { href: "/reports", label: "Job profit", exact: true },
            { href: "/reports/wip", label: "WIP (over / under billing)" },
            { href: "/reports/cash-flow", label: "Cash flow" },
            { href: "/reports/aging", label: "What clients owe" },
            { href: "/reports/sales", label: "Sales and win rate" },
          ]}
        />
      </div>
      {children}
    </div>
  );
}
