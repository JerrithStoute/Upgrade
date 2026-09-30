import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { staffUsers } from "@/lib/projects";
import { templateOptions } from "@/lib/estimate-lines";
import { PageHeader } from "@/components/ui";
import { ProjectForm } from "../_components/project-form";
import { createProject } from "../actions";

export default async function NewProjectPage() {
  const user = await requireStaff();
  const [clients, managers, templates] = await Promise.all([
    db.client.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, company: true },
    }),
    staffUsers(),
    templateOptions(),
  ]);
  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: "New" }]}
        title="New project"
        description="Start a lead or set up a contracted job."
      />
      <ProjectForm action={createProject} clients={clients} managers={managers} defaultManagerId={user.id} templates={templates} />
    </div>
  );
}
