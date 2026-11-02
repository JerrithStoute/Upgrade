import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { entryHours, fmtHours } from "@/lib/time-math";
import { getProject } from "@/lib/projects";
import Link from "@/components/link";
import { LogForm } from "../_components/log-form";
import { createLog } from "../actions";
import { companyClock } from "@/lib/company-zone";
import { timeRules } from "@/lib/time-clock";

export default async function NewDailyLogPage({ params }: { params: Promise<{ id: string }> }) {
  await requireView("field");
  const { id } = await params;
  const project = await getProject(id);
  // Today's time clock on this job fills in the crew and hours (change them if they're off).
  const now = new Date();
  const [clock, rules] = await Promise.all([companyClock(now), timeRules()]);
  const today = clock.real(new Date(clock.now.getFullYear(), clock.now.getMonth(), clock.now.getDate()));
  const clocked = await db.timeEntry.findMany({
    where: { projectId: project.id, clockIn: { gte: today } },
    select: { userId: true, clockIn: true, clockOut: true, breakMinutes: true },
  });
  const crew = new Set(clocked.map((e) => e.userId)).size;
  const hours = clocked.reduce((n, e) => n + entryHours(e, now, rules), 0);
  const base = `/projects/${project.id}/daily-logs`;
  return (
    <div className="space-y-2">
      <Link href={base} className="text-xs font-medium text-blue-700 hover:underline">
        ← Daily logs
      </Link>
      <LogForm
        title="New daily log"
        action={createLog}
        hidden={{ projectId: project.id }}
        values={{ date: clock.now, clientVisible: true, crewCount: crew, hoursWorked: Math.round(hours * 2) / 2 }}
        cancelHref={base}
        note={
          <>
            {crew
              ? `Crew and hours are from today's time clock on this job (${crew} ${crew === 1 ? "person" : "people"}, ${fmtHours(hours, rules.hoursFormat)} hrs so far). `
              : null}
            Leave weather, high or low blank and it&apos;s filled in for the job&apos;s ZIP code when you save. Photos are filed under Photos too.
          </>
        }
      />
    </div>
  );
}
