import Link from "next/link";
import { MessageSquare, Plus, Lock, Send } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { cn, fmtDateTime, timeAgo } from "@/lib/utils";
import { Badge, Avatar, SubmitButton, ConfirmForm, Collapsible, Field, EmptyState } from "@/components/ui";
import { createThread, replyToThread, deleteThread } from "./actions";

export default async function MessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ thread?: string }>;
}) {
  const user = await requireStaff();
  const { id } = await params;
  const { thread: threadParam } = await searchParams;
  const project = await getProject(id);
  const threads = await db.messageThread.findMany({
    where: { projectId: project.id },
    orderBy: { lastMessageAt: "desc" },
    include: {
      _count: { select: { messages: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, author: { select: { name: true } } } },
    },
  });
  const selectedId = threads.some((t) => t.id === threadParam) ? threadParam : threads[0]?.id;
  const selected = selectedId
    ? await db.messageThread.findUnique({
        where: { id: selectedId },
        include: { messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true, role: true } } } } },
      })
    : null;
  const base = `/projects/${project.id}/messages`;

  return (
    <div className="space-y-6">
      <Collapsible
        defaultOpen={threads.length === 0}
        summary={
          <span className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> New conversation
          </span>
        }
      >
        <form action={createThread} className="space-y-4">
          <input type="hidden" name="projectId" value={project.id} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Subject" htmlFor="thread-subject" className="md:col-span-2">
              <input id="thread-subject" name="subject" className="input" required placeholder="e.g. Tile layout question" />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
              <input type="checkbox" name="clientVisible" defaultChecked className="h-4 w-4 rounded border-slate-300" />
              Visible to client
            </label>
            <Field label="Message" htmlFor="thread-body" className="md:col-span-3">
              <textarea id="thread-body" name="body" className="input" rows={3} required placeholder="Write the first message…" />
            </Field>
          </div>
          <SubmitButton>Start conversation</SubmitButton>
        </form>
      </Collapsible>

      {threads.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No conversations yet" description="Start a thread to keep project communication with the client (or the team) in one place." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          {/* Thread list */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500">
              Conversations · {threads.length}
            </div>
            <ul className="divide-y divide-slate-100">
              {threads.map((t) => {
                const last = t.messages[0];
                const active = t.id === selectedId;
                return (
                  <li key={t.id}>
                    <Link href={`${base}?thread=${t.id}`} className={cn("block px-4 py-3 hover:bg-slate-50", active && "bg-blue-50 hover:bg-blue-50")}>
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn("truncate text-sm font-medium", active ? "text-blue-900" : "text-slate-900")}>{t.subject}</p>
                        <span className="shrink-0 text-[11px] text-slate-400">{timeAgo(t.lastMessageAt)}</span>
                      </div>
                      {last ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                          {last.author ? <span className="font-medium text-slate-600">{last.author.name.split(" ")[0]}: </span> : null}
                          {last.body}
                        </p>
                      ) : null}
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">
                        <span>
                          {t._count.messages} message{t._count.messages === 1 ? "" : "s"}
                        </span>
                        {!t.clientVisible ? (
                          <Badge className="bg-slate-100 text-slate-600 ring-slate-200">
                            <Lock className="mr-1 h-2.5 w-2.5" /> Internal
                          </Badge>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Selected thread */}
          {selected ? (
            <div className="flex min-h-[480px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-5 py-3">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                    {selected.subject}
                    {!selected.clientVisible ? (
                      <Badge className="bg-slate-100 text-slate-600 ring-slate-200">
                        <Lock className="mr-1 h-2.5 w-2.5" /> Internal
                      </Badge>
                    ) : null}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {selected.messages.length} message{selected.messages.length === 1 ? "" : "s"} · started {fmtDateTime(selected.createdAt)}
                    {selected.clientVisible ? " · visible in client portal" : " · team only"}
                  </p>
                </div>
                {user.role === "ADMIN" ? (
                  <ConfirmForm action={deleteThread} hidden={{ projectId: project.id, id: selected.id }} message={`Delete "${selected.subject}" and all of its messages?`} variant="ghost">
                    <span className="text-xs text-rose-600">Delete thread</span>
                  </ConfirmForm>
                ) : null}
              </div>
              <div className="flex-1 space-y-4 bg-slate-50/60 px-5 py-4">
                {selected.messages.map((m) => {
                  const mine = m.author?.id === user.id;
                  const name = m.author?.name ?? "Unknown";
                  return (
                    <div key={m.id} className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
                      <Avatar name={name} className={cn(m.author?.role === "CLIENT" && "bg-emerald-100 text-emerald-800")} />
                      <div className={cn("max-w-[75%]", mine ? "items-end text-right" : "items-start")}>
                        <div className={cn("mb-1 flex items-center gap-1.5 text-[11px] text-slate-500", mine && "justify-end")}>
                          <span className="font-medium text-slate-700">{name}</span>
                          {m.author ? <Badge status={m.author.role} className="px-1.5 py-0 text-[10px]" /> : null}
                          <span title={fmtDateTime(m.createdAt)}>{timeAgo(m.createdAt)}</span>
                        </div>
                        <div
                          className={cn(
                            "inline-block whitespace-pre-line rounded-2xl px-3.5 py-2 text-left text-sm shadow-sm",
                            mine ? "rounded-br-sm bg-blue-700 text-white" : "rounded-bl-sm bg-white text-slate-800 ring-1 ring-slate-200",
                          )}
                        >
                          {m.body}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <form action={replyToThread} className="border-t border-slate-100 px-5 py-3">
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="threadId" value={selected.id} />
                <label htmlFor="reply-body" className="sr-only">
                  Reply
                </label>
                <textarea id="reply-body" name="body" className="input" rows={3} required placeholder={selected.clientVisible ? "Reply — the client will see this…" : "Reply to the team…"} />
                <div className="mt-2 flex justify-end">
                  <SubmitButton size="sm" pendingText="Sending…">
                    <Send className="h-3.5 w-3.5" /> Send reply
                  </SubmitButton>
                </div>
              </form>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
