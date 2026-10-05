import { getProject } from "@/lib/projects";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { ClientViewButton } from "./_components/client-view-button";
import Link from "next/link";
import { ChevronRight, Pencil } from "lucide-react";
import { ProjectHeaderSwitch } from "@/components/layout/topbar-slot";
import { StickyJobHead } from "@/components/layout/sticky-job-head";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  const base = `/projects/${project.id}`;
  const address = [project.address, project.city, project.state].filter(Boolean).join(", ");
  const clientName = project.client ? `${project.client.firstName} ${project.client.lastName}` : "No client";

  return (
    <div>
      <ProjectHeaderSwitch
        compact={
          // The project up in the top bar: on the drawing screen, and once you scroll the header away.
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <Link href="/projects" className="shrink-0 text-xs text-slate-500 hover:text-slate-800">
              Projects
            </Link>
            <ChevronRight className="h-3 w-3 shrink-0 text-slate-400" />
            <Link href={base} className="min-w-0 truncate font-semibold text-slate-900 hover:text-blue-700" title={project.name}>
              #{project.number} {project.name}
            </Link>
            <Badge status={project.status} className="shrink-0" />
            <span className="hidden min-w-0 truncate text-xs text-slate-500 xl:inline">{[clientName, address].filter(Boolean).join(" · ")}</span>
            {project.clientId ? (
              <span className="ml-auto shrink-0">
                <ClientViewButton projectId={project.id} />
              </span>
            ) : null}
            <Link href={`${base}/edit`} className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Edit project">
              <Pencil className="h-3.5 w-3.5" />
            </Link>
          </div>
        }
      >
        <PageHeader
          breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: `#${project.number}` }]}
          title={project.name}
          meta={<Badge status={project.status} />}
          description={[clientName, address].filter(Boolean).join(" · ")}
          actions={
            <span className="flex flex-wrap items-center gap-2">
              {project.clientId ? <ClientViewButton projectId={project.id} /> : null}
              <ButtonLink href={`${base}/edit`} variant="secondary" size="sm">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </ButtonLink>
            </span>
          }
        />
      </ProjectHeaderSwitch>
      <StickyJobHead>
        <Tabs
          items={[
            { href: base, label: "Overview", exact: true },
            { href: `${base}/plans`, label: "Plans" },
            { href: `${base}/materials`, label: "Material list" },
            { href: `${base}/takeoff`, label: "Takeoff" },
            { href: `${base}/estimate`, label: "Estimate" },
            { href: `${base}/selections`, label: "Selections" },
            { href: `${base}/change-orders`, label: "Change Orders" },
            { href: `${base}/schedule`, label: "Schedule" },
            { href: `${base}/budget`, label: "Budget" },
            { href: `${base}/invoices`, label: "Invoices" },
            { href: `${base}/daily-logs`, label: "Daily Logs" },
            { href: `${base}/todos`, label: "To-Dos" },
            { href: `${base}/files`, label: "Files" },
            { href: `${base}/messages`, label: "Messages" },
          ]}
        />
      </StickyJobHead>
      {children}
    </div>
  );
}
