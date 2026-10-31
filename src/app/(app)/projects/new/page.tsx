import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { staffUsers } from "@/lib/projects";
import { templateOptions } from "@/lib/estimate-lines";
import Link from "@/components/link";
import { Copy } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { ProjectForm } from "../_components/project-form";
import { createProject } from "../actions";

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ kind?: string; client?: string }> }) {
  const user = await requireStaff();
  const { kind, client } = await searchParams;
  const [clients, managers, templates, plans] = await Promise.all([
    db.client.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, company: true },
    }),
    staffUsers(),
    templateOptions(),
    // Plan templates: houses built over and over — a new job copied from one (its plans, takeoff, estimate, schedule).
    db.project.findMany({ where: { isTemplate: true }, orderBy: { name: "asc" }, select: { id: true, name: true, squareFeet: true } }),
  ]);
  return (
    <div>
      <PageHeader breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: "New" }]} title="New project" description="Start a lead or set up a contracted job." />
      {plans.length ? (
        <div className="mb-5 rounded-lg border border-violet-200 bg-violet-50 p-4">
          <p className="text-sm font-semibold text-violet-900">Start from a plan template</p>
          <p className="mb-2 text-xs text-violet-800">A house you build over and over: its plans, takeoff, estimate and schedule come along — just add the lot.</p>
          <div className="flex flex-wrap gap-2">
            {plans.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}/copy`} className="inline-flex items-center gap-1.5 rounded-md border border-violet-300 bg-white px-3 py-1.5 text-sm text-violet-900 hover:bg-violet-100">
                <Copy className="h-3.5 w-3.5" />
                {p.name}
                {p.squareFeet ? <span className="text-xs text-violet-600">{p.squareFeet.toLocaleString()} sf</span> : null}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      <ProjectForm action={createProject} clients={clients} managers={managers} defaultManagerId={user.id} templates={templates} kind={kind} defaultClientId={client} />
    </div>
  );
}
