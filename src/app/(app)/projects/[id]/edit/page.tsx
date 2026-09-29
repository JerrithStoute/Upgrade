import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject, staffUsers } from "@/lib/projects";
import { Card, CardBody, CardHeader, ConfirmForm } from "@/components/ui";
import { ProjectForm } from "../../_components/project-form";
import { deleteProject, updateProject } from "../../actions";

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const [project, clients, managers] = await Promise.all([
    getProject(id),
    db.client.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, company: true },
    }),
    staffUsers(),
  ]);

  return (
    <div className="space-y-6">
      <ProjectForm action={updateProject} project={project} clients={clients} managers={managers} />

      <Card className="border-rose-200">
        <CardHeader
          title="Danger zone"
          description="Deleting a project permanently removes its estimates, selections, change orders, schedule, invoices, logs, files and messages."
        />
        <CardBody>
          <ConfirmForm
            action={deleteProject}
            hidden={{ id: project.id }}
            message={`Delete project #${project.number} "${project.name}" and all of its data? This cannot be undone.`}
          >
            Delete project
          </ConfirmForm>
        </CardBody>
      </Card>
    </div>
  );
}
