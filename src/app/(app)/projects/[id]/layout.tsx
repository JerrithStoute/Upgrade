import { getProject } from "@/lib/projects";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Pencil } from "lucide-react";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  const base = `/projects/${project.id}`;
  const address = [project.address, project.city, project.state].filter(Boolean).join(", ");
  const clientName = project.client ? `${project.client.firstName} ${project.client.lastName}` : "No client";

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: `#${project.number}` }]}
        title={project.name}
        meta={<Badge status={project.status} />}
        description={[clientName, address].filter(Boolean).join(" · ")}
        actions={
          <ButtonLink href={`${base}/edit`} variant="secondary" size="sm">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </ButtonLink>
        }
      />
      <Tabs
        className="mb-6"
        items={[
          { href: base, label: "Overview", exact: true },
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
      {children}
    </div>
  );
}
