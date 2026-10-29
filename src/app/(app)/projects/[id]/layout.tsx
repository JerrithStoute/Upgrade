import { getProject } from "@/lib/projects";
import { requireStaff } from "@/lib/auth";
import { allows, areaForPath } from "@/lib/access";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { ClientViewButton } from "./_components/client-view-button";
import Link from "@/components/link";
import { ChevronRight, Copy, Pencil } from "lucide-react";
import { ProjectHeaderSwitch } from "@/components/layout/topbar-slot";
import { StickyJobHead } from "@/components/layout/sticky-job-head";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { removeSample } from "../sample-actions";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, project] = await Promise.all([requireStaff(), getProject(id)]);
  const base = `/projects/${project.id}`;
  const address = [project.address, project.city, project.state].filter(Boolean).join(", ");
  const clientName = project.client ? `${project.client.firstName} ${project.client.lastName}` : "No client";

  return (
    <div>
      <ProjectHeaderSwitch
        compact={
          // The project up in the top bar: on the drawing screen, and once you scroll the header away.
          <div className="flex min-w-0 items-center gap-2 text-sm">
            {/* Phones: just the job's name — the rest needs a wider bar. */}
            <Link href="/projects" className="hidden shrink-0 text-xs text-slate-500 hover:text-slate-800 sm:inline">
              Projects
            </Link>
            <ChevronRight className="hidden h-3 w-3 shrink-0 text-slate-400 sm:block" />
            <Link href={base} className="min-w-0 truncate font-semibold text-slate-900 hover:text-blue-700" title={project.name}>
              #{project.number} {project.name}
            </Link>
            <Badge status={project.status} className="hidden shrink-0 sm:inline-flex" />
            <span className="hidden min-w-0 truncate text-xs text-slate-500 xl:inline">{[clientName, address].filter(Boolean).join(" · ")}</span>
            {project.clientId ? (
              <span className="ml-auto hidden shrink-0 md:block">
                <ClientViewButton projectId={project.id} />
              </span>
            ) : null}
            <Link href={`${base}/edit`} className="hidden shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 md:block" title="Edit project">
              <Pencil className="h-3.5 w-3.5" />
            </Link>
          </div>
        }
      >
        <PageHeader
          breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: `#${project.number}` }]}
          title={project.name}
          meta={
            <>
              <Badge status={project.status} />
              {project.isSample ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Sample</span> : null}
              {project.isTemplate ? (
                <Link href={`${base}/copy`} className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800" title="Kept to copy new jobs from — off the job lists">
                  Plan template
                </Link>
              ) : null}
              {/* Phones: just a pencil here, instead of the buttons row. */}
              <Link href={`${base}/edit`} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 md:hidden" title="Edit project" aria-label="Edit project">
                <Pencil className="h-4 w-4" />
              </Link>
            </>
          }
          description={<span className="line-clamp-1 md:line-clamp-none">{[clientName, address].filter(Boolean).join(" · ")}</span>}
          actionsClassName="hidden md:flex"
          actions={
            <span className="flex flex-wrap items-center gap-2">
              {project.clientId ? <ClientViewButton projectId={project.id} /> : null}
              <ButtonLink href={`${base}/copy`} variant="secondary" size="sm" title="A new job from this one — its plans, takeoff, estimate and schedule — for another lot">
                <Copy className="h-3.5 w-3.5" /> {project.isTemplate ? "Use this plan" : "Copy"}
              </ButtonLink>
              <ButtonLink href={`${base}/edit`} variant="secondary" size="sm">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </ButtonLink>
            </span>
          }
        />
      </ProjectHeaderSwitch>
      {project.isSample ? (
        // The made-up job to explore (sample-job.ts): what it is, and the way out.
        <div className="no-print mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-inset ring-amber-200">
          <p className="min-w-0 flex-1">
            <span className="font-semibold">This is a sample job</span> — a made-up house to explore. Click anything and change it; nothing here is sent to anyone or to QuickBooks.
          </p>
          {user.role === "ADMIN" ? (
            <ConfirmForm action={removeSample} variant="secondary" message="Remove the sample job and everything in it? You can add it again from Getting started on the dashboard.">
              Remove sample job
            </ConfirmForm>
          ) : null}
        </div>
      ) : null}
      <StickyJobHead>
        <Tabs
          items={[
            { href: base, label: "Overview", exact: true },
            { href: `${base}/plans`, label: "Plans" },
            { href: `${base}/materials`, label: "Material list" },
            { href: `${base}/takeoff`, label: "Takeoff" },
            { href: `${base}/estimate`, label: "Estimate" },
            { href: `${base}/bids`, label: "Bids" },
            { href: `${base}/selections`, label: "Selections" },
            { href: `${base}/change-orders`, label: "Change Orders" },
            { href: `${base}/schedule`, label: "Schedule" },
            ...(project.isSpec ? [{ href: `${base}/spec`, label: "Spec sale" }] : []),
            { href: `${base}/purchasing`, label: "Purchasing" },
            { href: `${base}/budget`, label: "Budget" },
            { href: `${base}/invoices`, label: "Invoices" },
            { href: `${base}/daily-logs`, label: "Daily Logs" },
            { href: `${base}/todos`, label: "To-Dos" },
            { href: `${base}/files`, label: "Files" },
            { href: `${base}/messages`, label: "Messages" },
          ].filter((t) => allows(user.access, areaForPath(t.href), 1))}
        />
      </StickyJobHead>
      {children}
    </div>
  );
}
