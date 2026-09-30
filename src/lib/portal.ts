import "server-only";
import { notFound } from "next/navigation";
import { db } from "./db";

const managerSelect = { select: { id: true, name: true, phone: true, email: true } } as const;

/** All projects belonging to a client, most recently updated first. */
export async function getClientProjects(clientId: string) {
  return db.project.findMany({
    where: { clientId },
    orderBy: { updatedAt: "desc" },
    include: { manager: managerSelect },
  });
}

export type PortalProject = Awaited<ReturnType<typeof getClientProjects>>[number];

const CLOSED = ["COMPLETED", "CANCELLED"];

/** Pick the default project: most recently updated non-completed one, else the most recent. */
export function defaultPortalProject(projects: PortalProject[]) {
  return projects.find((p) => !CLOSED.includes(p.status)) ?? projects[0] ?? null;
}

/**
 * Load a project for the portal, verifying it belongs to the client.
 * With no projectId, returns the client's default project. 404s when nothing matches.
 */
export async function getPortalProject(clientId: string, projectId?: string | null) {
  if (projectId) {
    const project = await db.project.findFirst({ where: { id: projectId, clientId }, include: { manager: managerSelect } });
    if (!project) notFound();
    return project;
  }
  const project = defaultPortalProject(await getClientProjects(clientId));
  if (!project) notFound();
  return project;
}

/**
 * Convenience for list pages: the client's projects plus the currently selected one
 * (null when the client has no projects, so the page can render an EmptyState).
 * An explicit `?project=` that the client doesn't own 404s.
 */
export async function portalContext(clientId: string, projectId?: string | null) {
  const projects = await getClientProjects(clientId);
  let project: PortalProject | null = null;
  if (projectId) {
    project = projects.find((p) => p.id === projectId) ?? null;
    if (!project) notFound();
  } else {
    project = defaultPortalProject(projects);
  }
  return { projects, project };
}

/** Append `?project=` to a portal href. */
export function portalHref(path: string, projectId: string) {
  return `${path}${path.includes("?") ? "&" : "?"}project=${projectId}`;
}

/** Overall schedule completion: duration-weighted average of task percentComplete. */
export function scheduleProgress(tasks: { startDate: Date; endDate: Date; percentComplete: number }[]) {
  if (!tasks.length) return 0;
  let weight = 0;
  let done = 0;
  for (const t of tasks) {
    const days = Math.max(1, (t.endDate.getTime() - t.startDate.getTime()) / 86_400_000 + 1);
    weight += days;
    done += days * (t.percentComplete / 100);
  }
  return weight ? Math.round((done / weight) * 100) : 0;
}

/** Invoice totals from items and payments. */
export function invoiceTotals(inv: { items: { quantity: number; unitPrice: number }[]; payments: { amount: number }[] }) {
  const total = inv.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
  return { total, paid, balance: total - paid };
}
