import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { getProject, nextChangeOrderNumber } from "@/lib/projects";
import { CHANGE_ORDER_REASONS } from "@/lib/finance";
import { Card, CardBody, CardHeader, Field, FormGrid, SubmitButton, buttonClasses } from "@/components/ui";
import { createChangeOrder } from "../actions";

export default async function NewChangeOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const project = await getProject(id);
  const number = await nextChangeOrderNumber(project.id);

  return (
    <Card className="max-w-3xl">
      <CardHeader title={`New change order #${number}`} description="Describe the scope change. You can add priced line items on the next screen." />
      <CardBody>
        <form action={createChangeOrder} className="space-y-4">
          <input type="hidden" name="projectId" value={project.id} />
          <FormGrid>
            <Field label="Title" htmlFor="co-title" className="md:col-span-2">
              <input id="co-title" name="title" className="input" required placeholder="e.g. Add pot filler & relocate range" />
            </Field>
            <Field label="Description" htmlFor="co-description" className="md:col-span-2">
              <textarea id="co-description" name="description" rows={4} className="input" placeholder="What changed and why" />
            </Field>
            <Field label="Reason" htmlFor="co-reason">
              <select id="co-reason" name="reason" className="input" defaultValue={CHANGE_ORDER_REASONS[0]}>
                {CHANGE_ORDER_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Schedule impact (days)" htmlFor="co-days">
              <input id="co-days" name="scheduleImpactDays" type="number" step="1" className="input" defaultValue={0} />
            </Field>
          </FormGrid>
          <div className="flex items-center gap-2">
            <SubmitButton>Create change order</SubmitButton>
            <Link href={`/projects/${project.id}/change-orders`} className={buttonClasses("secondary")}>
              Cancel
            </Link>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
