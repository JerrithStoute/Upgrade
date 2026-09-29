import Link from "next/link";
import { MessageSquare, Send } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { portalContext } from "@/lib/portal";
import { cn, fmtDateTime, timeAgo } from "@/lib/utils";
import { Avatar, Card, CardBody, CardHeader, Collapsible, EmptyState, Field, SubmitButton } from "@/components/ui";
import { PortalPageHeader } from "@/components/portal/page-header";
import { createThread, replyToThread } from "../actions";

export const metadata = { title: "Messages" };

export default async function PortalMessagesPage({ searchParams }: { searchParams: Promise<{ project?: string; thread?: string }> }) {
  const user = await requireClient();
  const { project: projectParam, thread: threadParam } = await searchParams;
  const { projects, project } = await portalContext(user.clientId, projectParam);

  if (!project) {
    return (
      <>
        <PortalPageHeader title="Messages" projects={projects} project={null} />
        <EmptyState icon={MessageSquare} title="No projects yet" description="You'll be able to message your team once your project is set up." />
      </>
    );
  }

  const threads = await db.messageThread.findMany({
    where: { projectId: project.id, clientVisible: true },
    orderBy: { lastMessageAt: "desc" },
    include: {
      _count: { select: { messages: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, include: { author: { select: { name: true } } } },
    },
  });

  const activeId = threadParam && threads.some((t) => t.id === threadParam) ? threadParam : threads[0]?.id ?? null;
  const active = activeId
    ? await db.messageThread.findFirst({
        where: { id: activeId, projectId: project.id, clientVisible: true },
        include: { messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true, role: true } } } } },
      })
    : null;

  const base = `/portal/messages?project=${project.id}`;

  return (
    <>
      <PortalPageHeader title="Messages" description="Conversations with your project team." projects={projects} project={project} />
      <div className="space-y-6">
        <Collapsible summary="New message" defaultOpen={threads.length === 0}>
          <form action={createThread} className="space-y-4">
            <input type="hidden" name="projectId" value={project.id} />
            <Field label="Subject" htmlFor="subject">
              <input id="subject" name="subject" className="input" required maxLength={200} placeholder="What's this about?" />
            </Field>
            <Field label="Message" htmlFor="new-body">
              <textarea id="new-body" name="body" className="input" rows={4} required />
            </Field>
            <SubmitButton pendingText="Sending…">
              <Send className="h-4 w-4" /> Send message
            </SubmitButton>
          </form>
        </Collapsible>

        {threads.length === 0 ? (
          <EmptyState icon={MessageSquare} title="No conversations yet" description="Start one above and your project team will be notified." />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <Card className="overflow-hidden">
              <CardHeader title="Conversations" description={`${threads.length} thread${threads.length === 1 ? "" : "s"}`} />
              <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
                {threads.map((t) => {
                  const last = t.messages[0];
                  return (
                    <li key={t.id}>
                      <Link
                        href={`${base}&thread=${t.id}`}
                        className={cn("block px-5 py-3 hover:bg-slate-50", t.id === activeId && "bg-blue-50/60 hover:bg-blue-50/60")}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn("truncate text-sm", t.id === activeId ? "font-semibold text-blue-900" : "font-medium text-slate-900")}>{t.subject}</p>
                          <span className="shrink-0 text-xs text-slate-400">{timeAgo(t.lastMessageAt)}</span>
                        </div>
                        {last ? (
                          <p className="mt-0.5 truncate text-xs text-slate-500">
                            {last.author?.name ?? "Team"}: {last.body}
                          </p>
                        ) : null}
                        <p className="mt-0.5 text-[11px] text-slate-400">{t._count.messages} message{t._count.messages === 1 ? "" : "s"}</p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>

            {active ? (
              <Card className="flex min-w-0 flex-col">
                <CardHeader title={active.subject} description={`Started ${fmtDateTime(active.createdAt)}`} />
                <CardBody className="flex-1 space-y-4">
                  {active.messages.map((m) => {
                    const mine = m.author?.id === user.id;
                    return (
                      <div key={m.id} className={cn("flex gap-3", mine && "flex-row-reverse")}>
                        <Avatar name={m.author?.name ?? "Team"} className={mine ? "bg-blue-100 text-blue-800" : undefined} />
                        <div className={cn("max-w-[85%] min-w-0", mine && "text-right")}>
                          <p className="text-xs text-slate-500">
                            <span className="font-medium text-slate-700">{m.author?.name ?? "Team"}</span>
                            {m.author && m.author.role !== "CLIENT" ? <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] uppercase text-slate-500">Team</span> : null}
                            {" · "}
                            {fmtDateTime(m.createdAt)}
                          </p>
                          <div
                            className={cn(
                              "mt-1 inline-block whitespace-pre-line rounded-2xl px-4 py-2.5 text-left text-sm",
                              mine ? "rounded-tr-sm bg-blue-700 text-white" : "rounded-tl-sm bg-slate-100 text-slate-800",
                            )}
                          >
                            {m.body}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardBody>
                <div className="border-t border-slate-100 px-5 py-4">
                  <form action={replyToThread} className="space-y-3">
                    <input type="hidden" name="threadId" value={active.id} />
                    <textarea name="body" className="input" rows={3} required placeholder="Write a reply…" aria-label="Reply" />
                    <div className="flex justify-end">
                      <SubmitButton pendingText="Sending…">
                        <Send className="h-4 w-4" /> Reply
                      </SubmitButton>
                    </div>
                  </form>
                </div>
              </Card>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}
