import Link from "next/link";
import type { Project } from "@prisma/client";
import { PROJECT_STATUSES, PROJECT_TYPES } from "@/lib/constants";
import { dateInput, titleCase } from "@/lib/utils";
import { ButtonLink, Card, CardBody, CardHeader, Field, FormGrid, SubmitButton } from "@/components/ui";

type ClientOption = { id: string; firstName: string; lastName: string; company: string | null };
type ManagerOption = { id: string; name: string };
type TemplateOption = { id: string; name: string; _count: { items: number } };

export function ProjectForm({
  action,
  project,
  clients,
  managers,
  defaultManagerId,
  templates,
}: {
  action: (formData: FormData) => Promise<void>;
  project?: Project;
  clients: ClientOption[];
  managers: ManagerOption[];
  defaultManagerId?: string;
  /** Estimate templates offered when creating a project (omit when editing). */
  templates?: TemplateOption[];
}) {
  const editing = Boolean(project);
  return (
    <form action={action} className="space-y-6">
      {project ? <input type="hidden" name="id" value={project.id} /> : null}

      <Card>
        <CardHeader title="Project" description="Basic details used across estimates, schedule and invoices." />
        <CardBody>
          <FormGrid>
            <Field label="Project name" htmlFor="name" className="md:col-span-2">
              <input id="name" name="name" required className="input" defaultValue={project?.name ?? ""} placeholder="e.g. Smith Kitchen Remodel" />
            </Field>
            <Field label="Type" htmlFor="type">
              <select id="type" name="type" className="input" defaultValue={project?.type ?? "REMODEL"}>
                {PROJECT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {titleCase(t)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status" htmlFor="status">
              <select id="status" name="status" className="input" defaultValue={project?.status ?? "LEAD"}>
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {titleCase(s)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Client" htmlFor="clientId">
              <select id="clientId" name="clientId" className="input" defaultValue={project?.clientId ?? ""}>
                <option value="">— No client —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName}
                    {c.company ? ` (${c.company})` : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                <Link href="/clients/new" className="text-blue-700 hover:underline">
                  or add a client
                </Link>
              </p>
            </Field>
            <Field label="Project manager" htmlFor="managerId">
              <select id="managerId" name="managerId" className="input" defaultValue={project?.managerId ?? defaultManagerId ?? ""}>
                <option value="">— Unassigned —</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Description" htmlFor="description" className="md:col-span-2">
              <textarea id="description" name="description" rows={3} className="input" defaultValue={project?.description ?? ""} />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Site" />
        <CardBody>
          <FormGrid>
            <Field label="Address" htmlFor="address" className="md:col-span-2">
              <input id="address" name="address" className="input" defaultValue={project?.address ?? ""} />
            </Field>
            <Field label="City" htmlFor="city">
              <input id="city" name="city" className="input" defaultValue={project?.city ?? ""} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="State" htmlFor="state">
                <input id="state" name="state" className="input" defaultValue={project?.state ?? ""} maxLength={2} />
              </Field>
              <Field label="ZIP" htmlFor="zip">
                <input id="zip" name="zip" className="input" defaultValue={project?.zip ?? ""} />
              </Field>
            </div>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Schedule" />
        <CardBody>
          <FormGrid>
            <Field label="Start date" htmlFor="startDate">
              <input id="startDate" name="startDate" type="date" className="input" defaultValue={dateInput(project?.startDate)} />
            </Field>
            {editing ? (
              <Field label="Actual end date" htmlFor="actualEndDate">
                <input id="actualEndDate" name="actualEndDate" type="date" className="input" defaultValue={dateInput(project?.actualEndDate)} />
              </Field>
            ) : null}
          </FormGrid>
        </CardBody>
      </Card>

      {!editing && templates ? (
        <Card>
          <CardHeader title="Estimate" description="Start this job's estimate from one of your templates. You can adjust every line afterwards." />
          <CardBody>
            <FormGrid>
              <Field label="Estimate template" htmlFor="templateId" hint={templates.length ? undefined : "No templates yet — an admin can create them in Settings → Estimate templates."}>
                <select id="templateId" name="templateId" className="input" defaultValue="" disabled={templates.length === 0}>
                  <option value="">None — I&apos;ll build the estimate later</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t._count.items} lines)
                    </option>
                  ))}
                </select>
              </Field>
            </FormGrid>
          </CardBody>
        </Card>
      ) : null}

      <div className="flex items-center gap-2">
        <SubmitButton>{editing ? "Save changes" : "Create project"}</SubmitButton>
        <ButtonLink href={project ? `/projects/${project.id}` : "/projects"} variant="ghost">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
