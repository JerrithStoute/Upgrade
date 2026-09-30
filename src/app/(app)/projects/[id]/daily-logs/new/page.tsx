import { requireStaff } from "@/lib/auth";
import { getProject } from "@/lib/projects";
import { Card, CardHeader, CardBody, SubmitButton, ButtonLink } from "@/components/ui";
import { LogFields } from "../_components/log-form";
import { createLog } from "../actions";

export default async function NewDailyLogPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const project = await getProject(id);
  return (
    <Card>
      <CardHeader title="New daily log" description="Capture today's conditions, crew and progress. Photos are attached to the log and filed under Photos." />
      <CardBody>
        <form action={createLog} className="space-y-4">
          <input type="hidden" name="projectId" value={project.id} />
          <LogFields values={{ date: new Date(), clientVisible: true }} />
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
