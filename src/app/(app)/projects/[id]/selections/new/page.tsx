import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject, activeCostCodes } from "@/lib/projects";
import { Card, CardHeader, CardBody, SubmitButton, ButtonLink } from "@/components/ui";
import { SelectionFields } from "../_components/selection-fields";
import { createSelection } from "../actions";

export default async function NewSelectionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const project = await getProject(id);
  const [costCodes, existing] = await Promise.all([
    activeCostCodes(),
    db.selection.findMany({ where: { projectId: project.id }, select: { category: true }, distinct: ["category"] }),
  ]);
  const categories = existing.map((e) => e.category).sort();
  return (
    <Card>
      <CardHeader title="New selection" description="Define what the client needs to choose and the allowance budgeted for it." />
      <CardBody>
        <form action={createSelection} className="space-y-4">
          <input type="hidden" name="projectId" value={project.id} />
          <SelectionFields values={{}} categories={categories} costCodes={costCodes} />
          <div className="flex items-center gap-2">
            <SubmitButton>Create selection</SubmitButton>
            <ButtonLink href={`/projects/${project.id}/selections`} variant="secondary">
              Cancel
            </ButtonLink>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
