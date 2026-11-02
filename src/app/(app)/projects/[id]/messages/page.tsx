import Link from "@/components/link";
import { MessageSquare, Plus, Lock, Send } from "lucide-react";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { cn, timeAgo } from "@/lib/utils";
import { Badge, Avatar, SubmitButton, ConfirmForm, EmptyState } from "@/components/ui";
import { ListFind } from "@/components/list-find";
import { createThread, replyToThread, deleteThread } from "./actions";
import { companyClock } from "@/lib/company-zone";

export default async function MessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ thread?: string; new?: string }>;
}) {
  const { dateTime } = await companyClock();
  const user = await requireView("files");
  const { id } = await params;
  const { thread: threadParam, new: newParam } = await searchParams;
  const project = await getProject(id);
  const threads = await db.messageThread.findMany({
    where: { projectId: project.id },
    orderBy: { lastMessageAt: "desc" },
    // Every message's words and who wrote them, so Find can narrow by them; the newest is the preview.
    include: { messages: { orderBy: { createdAt: "desc" }, select: { body: true, author: { select: { name: true } } } } },
  });
  const selectedId = threads.some((t) => t.id === threadParam) ? threadParam : threads[0]?.id;
  const selected = selectedId
    ? await db.messageThread.findUnique({
        where: { id: selectedId },
        include: { messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true, role: true } } } } },
      })
    : null;
  const base = `/projects/${project.id}/messages`;
  const here = selectedId ? `${base}?thread=${selectedId}` : base;
  const starting = !!newParam || threads.length === 0;
  const internal = threads.filter((t) => !t.clientVisible).length;

  const newBox = (
    <div className="border-b border-slate-100 bg-blue-50/50 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-900">New conversation</span>
        {threads.length ? (
          <Link href={here} className="text-xs font-medium text-blue-700 hover:underline">
            Cancel
          </Link>
        ) : null}
      </div>
      <form action={createThread} className="space-y-2">
        <input type="hidden" name="projectId" value={project.id} />
        <div className="flex flex-wrap items-center gap-2">
          <input name="subject" className="input h-8 py-1! min-w-48 flex-1 text-sm" required placeholder="Subject, like Tile layout question" aria-label="Subject" autoFocus={!!newParam} />
          <label className="flex items-center gap-1.5 text-xs text-slate-700">
            <input type="checkbox" name="clientVisible" defaultChecked className="h-4 w-4 rounded border-slate-300" />
            Client sees it
          </label>
        </div>
        <textarea name="body" className="input text-sm" rows={3} required placeholder="Write the first message…" aria-label="First message" />
        <SubmitButton size="xs" pendingText="Starting…">
          Start conversation
        </SubmitButton>
      </form>
    </div>
  );

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        {threads.length} conversation{threads.length === 1 ? "" : "s"}
        {threads.length ? ` · ${threads.length - internal} with the client · ${internal} internal` : ""}
      </p>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
          {threads.length ? <ListFind listId="thread-list" placeholder="Find a conversation…" /> : null}
          <Link
            href={`${here}${selectedId ? "&" : "?"}new=1`}
            className="ml-auto inline-flex h-7 items-center gap-1 rounded-md bg-blue-700 px-2.5 text-xs font-medium text-white hover:bg-blue-800"
          >
            <Plus className="h-3.5 w-3.5" /> New conversation
          </Link>
        </header>
        <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
          Client conversations show in their portal, and they&apos;re emailed each new message. <span className="font-medium">Internal</span> ones are your team only.
        </p>

        {threads.length === 0 ? (
          <>
            {newBox}
            <EmptyState icon={MessageSquare} title="No conversations yet" description="Start one above to keep talk about this job with the client (or the team) in one place." />
          </>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr]">
            {/* The conversations */}
            <div id="thread-list" className="border-b border-slate-100 lg:border-b-0 lg:border-r">
              <div data-find-group>
              <ul>
                {threads.map((t) => {
                  const last = t.messages[0];
                  const active = t.id === selectedId;
                  return (
                    <li
                      key={t.id}
                      data-find={[t.subject, ...t.messages.map((m) => `${m.author?.name ?? ""} ${m.body}`)].join(" ").toLowerCase()}
                      className="border-b border-slate-100 last:border-b-0"
                    >
                      <Link href={`${base}?thread=${t.id}`} className={cn("block px-4 py-2.5 hover:bg-slate-50", active && "bg-blue-50 hover:bg-blue-50")}>
                        <div className="flex items-baseline justify-between gap-2">
                          <p className={cn("min-w-0 truncate text-sm font-medium", active ? "text-blue-900" : "text-slate-900")}>
                            {t.subject}
                            {!t.clientVisible ? (
                              <span className="ml-1.5 inline-flex items-center gap-0.5 text-[11px] font-normal text-slate-500">
                                <Lock className="h-2.5 w-2.5" /> Internal
                              </span>
                            ) : null}
                          </p>
                          <span className="shrink-0 text-[11px] text-slate-400">{timeAgo(t.lastMessageAt)}</span>
                        </div>
                        {last ? (
                          <p className="truncate text-xs text-slate-500">
                            {last.author ? <span className="font-medium text-slate-600">{last.author.name.split(" ")[0]}: </span> : null}
                            {last.body}
                          </p>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <p data-find-none hidden className="px-4 py-3 text-sm text-slate-500">
                None match.
              </p>
              </div>
            </div>

            {/* The open conversation */}
            <div className="flex min-h-[440px] flex-col">
              {starting ? newBox : null}
              {selected ? (
                <>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-slate-100 px-4 py-2.5">
                    <h2 className="text-sm font-semibold text-slate-900">{selected.subject}</h2>
                    {!selected.clientVisible ? (
                      <Badge className="bg-slate-100 text-slate-600 ring-slate-200">
                        <Lock className="mr-1 h-2.5 w-2.5" /> Internal
                      </Badge>
                    ) : null}
                    <span className="text-xs text-slate-500" title={`Started ${dateTime(selected.createdAt)}`}>
                      {selected.messages.length} message{selected.messages.length === 1 ? "" : "s"} · {selected.clientVisible ? "with the client" : "team only"}
                    </span>
                    {user.role === "ADMIN" ? (
                      <ConfirmForm
                        action={deleteThread}
                        hidden={{ projectId: project.id, id: selected.id }}
                        message={`Delete "${selected.subject}" and all of its messages?`}
                        variant="ghost"
                        size="xs"
                        className="ml-auto"
                      >
                        <span className="text-rose-600">Delete…</span>
                      </ConfirmForm>
                    ) : null}
                  </div>
                  <div className="flex-1 space-y-3 bg-slate-50/60 px-4 py-3">
                    {selected.messages.map((m) => {
                      const mine = m.author?.id === user.id;
                      const name = m.author?.name ?? "Unknown";
                      return (
                        <div key={m.id} className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
                          <Avatar name={name} className={cn(m.author?.role === "CLIENT" && "bg-emerald-100 text-emerald-800")} />
                          <div className={cn("max-w-[75%]", mine ? "items-end text-right" : "items-start")}>
                            <div className={cn("mb-1 flex items-center gap-1.5 text-[11px] text-slate-500", mine && "justify-end")}>
                              <span className="font-medium text-slate-700">{mine ? "You" : name}</span>
                              {m.author && !mine ? <Badge status={m.author.role} className="px-1.5 py-0 text-[10px]" /> : null}
                              <span title={dateTime(m.createdAt)}>{timeAgo(m.createdAt)}</span>
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
                  <form action={replyToThread} className="flex items-end gap-2 border-t border-slate-100 px-4 py-2.5">
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="threadId" value={selected.id} />
                    <textarea
                      name="body"
                      aria-label="Reply"
                      className="input min-h-9 flex-1 text-sm"
                      rows={2}
                      required
                      placeholder={selected.clientVisible ? "Reply — the client will see this…" : "Reply to the team…"}
                    />
                    <SubmitButton size="xs" pendingText="Sending…">
                      <Send className="h-3.5 w-3.5" /> Send
                    </SubmitButton>
                  </form>
                </>
              ) : null}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
