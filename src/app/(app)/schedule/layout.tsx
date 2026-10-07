import { requireStaff } from "@/lib/auth";
import { PageHeader, Tabs } from "@/components/ui";

/** Schedule across all jobs: the 4-week look-ahead and the company calendar. */
export default async function ScheduleLayout({ children }: { children: React.ReactNode }) {
  await requireStaff();
  return (
    <div>
      <PageHeader title="Schedule" description="Every active job's work, the company calendar — holidays, time off and reminders." />
      <Tabs
        className="mb-6"
        items={[
          { href: "/schedule", label: "Look-ahead", exact: true },
          { href: "/schedule/calendar", label: "Calendar" },
        ]}
      />
      {children}
    </div>
  );
}
