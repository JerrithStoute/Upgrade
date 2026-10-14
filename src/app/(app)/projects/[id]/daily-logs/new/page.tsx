import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { entryHours, fmtHours } from "@/lib/time-math";
import { getProject } from "@/lib/projects";
import { Card, CardHeader, CardBody, SubmitButton, ButtonLink } from "@/components/ui";
import { LogFields } from "../_components/log-form";
import { createLog } from "../actions";
import { companyClock } from "@/lib/company-zone";

export default async function NewDailyLogPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const project = await getProject(id);
  // Today's time clock on this job fills in the crew and hours (change them if they're off).
  const now = new Date();
  const clock = await companyClock(now);
  const today = clock.real(new Date(clock.now.getFullYear(), clock.now.getMonth(), clock.now.getDate()));
  const clocked = await db.timeEntry.findMany({
    where: { projectId: project.id, clockIn: { gte: today } },
    select: { userId: true, clockIn: true, clockOut: true, breakMinutes: true },
  });
  const crew = new Set(clocked.map((e) => e.userId)).size;
  const hours = clocked.reduce((n, e) => n + entryHours(e, now), 0);
  return (
    <Card>
      <CardHeader title="New daily log" description="Capture today's conditions, crew and progress. Photos are attached to the log and filed under Photos." />
      <CardBody>
        <form action={createLog} className="space-y-4">
          <input type="hidden" name="projectId" value={project.id} />
          <LogFields values={{ date: clock.now, clientVisible: true, crewCount: crew, hoursWorked: Math.round(hours * 2) / 2 }} />
          {crew ? (
            <p className="text-xs text-slate-500">
              Crew and hours are from today&apos;s time clock on this job ({crew} {crew === 1 ? "person" : "people"}, {fmtHours(hours)} hrs so far).
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <SubmitButton pendingText="Saving log…">Save log</SubmitButton>
            <ButtonLink href={`/projects/${project.id}/daily-logs`} variant="secondary">
              Cancel
            </ButtonLink>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
