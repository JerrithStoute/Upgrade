import { PageHeader } from "@/components/ui/page-header";
import { ProjectSwitcher } from "./project-switcher";

/**
 * Portal page header: title/description plus a project switcher when the client has
 * more than one project.
 */
export function PortalPageHeader({
  title,
  description,
  projects,
  project,
  actions,
  breadcrumbs,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  projects: { id: string; number: number; name: string }[];
  project: { id: string } | null;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}) {
  const switcher = projects.length > 1 && project ? <ProjectSwitcher projects={projects} currentId={project.id} /> : null;
  return (
    <PageHeader
      title={title}
      description={description}
      breadcrumbs={breadcrumbs}
      actions={
        switcher || actions ? (
          <>
            {switcher}
            {actions}
          </>
        ) : undefined
      }
    />
  );
}
