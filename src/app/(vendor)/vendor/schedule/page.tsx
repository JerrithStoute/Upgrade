import { CalendarDays } from "lucide-react";
import { requireVendor } from "@/lib/auth";
import { db } from "@/lib/db";
import { cn, fmtDate } from "@/lib/utils";
import { EmptyState, Table, THead, TBody, Tr, Th, Td } from "@/components/ui";

/** Their work on every job's schedule: what, where, when. */
export default async function VendorSchedulePage() {
  const user = await requireVendor();
  const today = new Date();
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const tasks = await db.scheduleTask.findMany({
    where: { vendorId: user.vendorId },
    include: { project: { select: { name: true, address: true, city: true } } },
    orderBy: { startDate: "asc" },
  });
  const upcoming = tasks.filter((t) => t.endDate >= day && t.percentComplete < 100);
  const past = tasks.filter((t) => !upcoming.includes(t)).reverse();
  const table = (rows: typeof tasks, faded?: boolean) => (
    <Table>
      <THead>
        <tr>
          <Th>Work</Th>
          <Th>Job</Th>
          <Th>Start</Th>
          <Th>Finish</Th>
          <Th right>Done</Th>
        </tr>
      </THead>
      <TBody>
        {rows.map((t) => (
          <Tr key={t.id} className={cn(faded && "text-slate-500")}>
            <Td className="font-medium">
              {t.name}
              {t.notes ? <span className="block text-xs font-normal text-slate-500">{t.notes}</span> : null}
            </Td>
            <Td className="text-xs">
              {t.project.name}
              {t.project.address ? <span className="block text-slate-500">{[t.project.address, t.project.city].filter(Boolean).join(", ")}</span> : null}
            </Td>
            <Td className="whitespace-nowrap">{fmtDate(t.startDate, "EEE, MMM d")}</Td>
            <Td className="whitespace-nowrap">{fmtDate(t.endDate, "EEE, MMM d")}</Td>
            <Td right>{t.percentComplete}%</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Your schedule</h1>
        <p className="text-sm text-slate-500">Dates can move with the job — check back before you go.</p>
      </div>
      {upcoming.length ? table(upcoming) : <EmptyState icon={CalendarDays} title="Nothing scheduled for you right now" />}
      {past.length ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">Done or past</h2>
          {table(past, true)}
        </section>
      ) : null}
    </div>
  );
}
