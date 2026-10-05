"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CLIENT_VIEW_COOKIE, CLIENT_VIEW_HOURS, requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";

/** The client's pages Client view can open straight to — the same paths as yours under the job. */
const PAGES = ["selections", "change-orders", "invoices", "files", "schedule", "messages"] as const;
/** One of the pages above, one change order ("change-orders/<id>") or one invoice ("invoices/<id>"). */
const okPage = (p: string | null | undefined): p is string => !!p && ((PAGES as readonly string[]).includes(p) || /^(change-orders|invoices)\/[a-z0-9]+$/.test(p));

/**
 * "Client view": this job's client portal exactly as the client sees it (look only),
 * opened on the client's version of the page you're on. A draft change order or
 * invoice opens too — as it will look once it's sent (the client still can't see it).
 */
export async function openClientView(projectId: string, page: string | null) {
  await requireStaff();
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, clientId: true } });
  if (!project?.clientId) redirect(`/projects/${projectId}`);
  let to = okPage(page) ? page : "";
  // One change order / invoice: it has to be this job's (else its list).
  const [kind, id] = to.split("/");
  if (id) {
    const found =
      kind === "change-orders"
        ? await db.changeOrder.findFirst({ where: { id, projectId: project.id }, select: { id: true } })
        : await db.invoice.findFirst({ where: { id, projectId: project.id }, select: { id: true } });
    if (!found) to = kind;
  }
  // "<client>:<job>:<page>" — the page is where Back to my view returns you.
  (await cookies()).set(CLIENT_VIEW_COOKIE, `${project.clientId}:${project.id}:${to}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CLIENT_VIEW_HOURS * 60 * 60,
  });
  redirect(`/portal${to ? `/${to}` : ""}?project=${project.id}`);
}

/** "Back to my view": out of Client view, back to the job page it was opened from. */
export async function closeClientView() {
  await requireStaff();
  const store = await cookies();
  const [, projectId, page] = (store.get(CLIENT_VIEW_COOKIE)?.value ?? "").split(":");
  store.delete(CLIENT_VIEW_COOKIE);
  const back = okPage(page) ? `/${page}` : "";
  redirect(projectId ? `/projects/${projectId}${back}` : "/dashboard");
}
