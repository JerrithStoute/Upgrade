import { systemDb } from "@/lib/db";
import { requireStation } from "@/lib/station-auth";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { CopyJobForm } from "./copy-form";

export const metadata = { title: "Copy a job" };

/**
 * The Station owner's "Copy a job to another builder" — a real job into a demo or test account.
 * The original is only read. See src/lib/job-copy-across.ts for what comes along.
 */
export default async function CopyJobPage() {
  await requireStation({ owner: true });
  const [companies, jobs] = await Promise.all([
    systemDb.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    systemDb.project.findMany({
      where: { isTemplate: false, isSample: false },
      orderBy: { number: "asc" },
      select: { id: true, companyId: true, number: true, name: true, status: true },
    }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Copy a job" description="One builder's job into another builder's account — for a demo or a test account. The original is never changed." />
      <Card>
        <CardHeader
          title="Copy a job to another builder"
          description="Comes along: the plans and every takeoff, the newest estimate and the schedule. Their own cost codes, Item List, sizes and parameters are used where they match by name, and anything missing is added to their lists. The client comes over by name only — no email, phone or address — so nothing sent from the copy reaches the real client. Never: bids, POs, bills, invoices, change orders, selections, logs, time, messages, photos or other files."
        />
        <div className="p-5">
          <CopyJobForm builders={companies.map((c) => ({ id: c.id, name: c.name, jobs: jobs.filter((j) => j.companyId === c.id) }))} />
        </div>
      </Card>
    </div>
  );
}
