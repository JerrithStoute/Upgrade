import Link from "@/components/link";
import { differenceInCalendarDays } from "date-fns";
import { MessageSquare, Plus, Send } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { portalContext } from "@/lib/portal";
import { cn, fmtDate } from "@/lib/utils";
import { EmptyState, SubmitButton } from "@/components/ui";
import { PortalPageHeader } from "@/components/portal/page-header";
import { createThread, replyToThread } from "../actions";
import { companyClock } from "@/lib/company-zone";

export const metadata = { title: "Messages" };

export default async function PortalMessagesPage({ searchParams }: { searchParams: Promise<{ project?: string; thread?: string; new?: string }> }) {
  const user = await requireClient();
  const { now, wall } = await companyClock();
  const { project: projectParam, thread: threadParam, new: newParam } = await searchParams;
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
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1, include: { author: { select: { id: true, name: true } } } } },
  });

  // On a phone: the list, or one conversation (?thread=), or the new message form (?new=1).
  // On a computer: the list beside whichever of those is open (the newest conversation by default).
  const composing = newParam === "1" || threads.length === 0;
  const picked = threadParam && threads.some((t) => t.id === threadParam) ? threadParam : null;
  const activeId = composing ? null : (picked ?? threads[0]?.id ?? null);
  const showList = !composing && !picked; // what a phone shows
  const active = activeId
    ? await db.messageThread.findFirst({
        where: { id: activeId, projectId: project.id, clientVisible: true },
        include: { messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true, role: true } } } } },
      })
    : null;

  const base = `/portal/messages?project=${project.id}`;
  const when = (d: Date) => {
    const w = wall(d);
    const days = differenceInCalendarDays(now, w);
    return days === 0 ? fmtDate(w, "h:mm a") : days < 7 ? fmtDate(w, "EEE") : fmtDate(w, "MMM d");
  };
  const dayLabel = (d: Date) => {
    const days = differenceInCalendarDays(now, wall(d));
    return days === 0 ? "Today" : days === 1 ? "Yesterday" : fmtDate(wall(d), days < 7 ? "EEEE" : "EEE, MMM d, yyyy");
  };
  const panel = "flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm";

  return (
    <>
      <PortalPageHeader title="Messages" description="Conversations with your project team." projects={projects} project={project} />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[20rem_1fr]">
        {threads.length ? (
          <section className={cn(panel, !showList && "hidden lg:flex")}>
            <header className="flex items-center justify-between gap-2 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-slate-900">Conversations</h2>
              <Link href={`${base}&new=1`} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
                <Plus className="h-4 w-4" /> New message
              </Link>
            </header>
            <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto border-t border-slate-100">
              {threads.map((t) => {
                const last = t.messages[0];
                const on = t.id === activeId;
                return (
                  <li key={t.id}>
                    <Link href={`${base}&thread=${t.id}`} className={cn("flex items-start justify-between gap-3 px-4 py-2.5", on ? "hover:bg-slate-50 lg:bg-blue-50/70 lg:hover:bg-blue-50" : "hover:bg-slate-50")}>
                      <span className="min-w-0">
                        <span className={cn("block truncate text-sm font-medium", on ? "lg:text-blue-900" : "text-slate-900")}>{t.subject}</span>
                        {last ? (
                          <span className="block truncate text-xs text-slate-500">
                            {last.author?.id === user.id ? "You" : (last.author?.name ?? "Team")}: {last.body}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">{when(t.lastMessageAt)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {composing ? (
          <section className={cn(panel, threads.length === 0 && "lg:col-span-2")}>
            <header className="border-b border-slate-100 px-4 py-2.5">
              {threads.length ? (
                <Link href={base} className="text-sm font-medium text-blue-700 hover:underline lg:hidden">
                  ← Messages
                </Link>
              ) : null}
              <h2 className="text-sm font-semibold text-slate-900">New message</h2>
              {threads.length === 0 ? <p className="text-xs text-slate-500">Your project team is notified when you send it.</p> : null}
            </header>
            <form action={createThread} className="space-y-3 px-4 py-3">
              <input type="hidden" name="projectId" value={project.id} />
              <input name="subject" className="input" required maxLength={200} placeholder="What's this about?" aria-label="Subject" />
              <textarea name="body" className="input" rows={4} required placeholder="Your message" aria-label="Message" />
              <div className="flex items-center justify-end gap-3">
                {threads.length ? (
                  <Link href={base} className="text-sm text-slate-600 hover:underline">
                    Cancel
                  </Link>
                ) : null}
                <SubmitButton pendingText="Sending…">
                  <Send className="h-4 w-4" /> Send message
                </SubmitButton>
              </div>
            </form>
          </section>
        ) : active ? (
          <section className={cn(panel, showList && "hidden lg:flex")}>
            <header className="border-b border-slate-100 px-4 py-2.5">
              <Link href={base} className="text-sm font-medium text-blue-700 hover:underline lg:hidden">
                ← Messages
              </Link>
              <h2 className="text-sm font-semibold text-slate-900">{active.subject}</h2>
            </header>
            <div className="flex flex-1 flex-col gap-2 px-3 py-3 sm:px-4">
              {active.messages.map((m, i) => {
                const mine = m.author?.id === user.id;
                const prev = active.messages[i - 1];
                const newDay = !prev || differenceInCalendarDays(wall(m.createdAt), wall(prev.createdAt)) !== 0;
                return (
                  <div key={m.id} className="flex flex-col">
                    {newDay ? <p className="my-1 self-center text-xs text-slate-400">{dayLabel(m.createdAt)}</p> : null}
                    <p className={cn("mb-0.5 text-[11px] text-slate-500", mine ? "self-end mr-1" : "ml-1")}>
                      {mine ? "" : `${m.author?.name ?? "Team"}${m.author && m.author.role !== "CLIENT" ? " · Team" : ""} · `}
                      {fmtDate(wall(m.createdAt), "h:mm a")}
                    </p>
                    <div
                      className={cn(
                        "max-w-[85%] whitespace-pre-line break-words rounded-2xl px-3.5 py-2 text-sm",
                        mine ? "self-end rounded-br-sm bg-blue-700 text-white" : "self-start rounded-bl-sm bg-slate-100 text-slate-800",
                      )}
                    >
                      {m.body}
                    </div>
                  </div>
                );
              })}
            </div>
            <form action={replyToThread} className="flex items-end gap-2 border-t border-slate-100 px-3 py-2.5">
              <input type="hidden" name="threadId" value={active.id} />
              <textarea name="body" rows={1} required placeholder="Write a reply…" aria-label="Reply" className="input min-h-[2.5rem] flex-1 resize-y rounded-2xl" />
              <SubmitButton pendingText="…" className="h-10 w-10 shrink-0 justify-center rounded-full !px-0" aria-label="Send reply">
                <Send className="h-4 w-4" />
              </SubmitButton>
            </form>
          </section>
        ) : null}
      </div>
    </>
  );
}
