"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronRight, MessageSquare, Paperclip } from "lucide-react";
import { cn, fmtDate, money } from "@/lib/utils";
import { daysUntil, deadlineState } from "@/lib/deadlines";
import { ChoicePicture, CommentsBox, FilesBox, type CardComment, type CardFile, ChoiceFiles } from "@/components/selections/extras";
import { clientAddFiles, clientComment, clientMakeChoice, clientRemoveFile } from "@/app/(portal)/portal/actions";

export type PortalCard = {
  selectionId: string;
  name: string;
  division: string;
  specText: string | null;
  clientNotes: string | null;
  allowance: number | null;
  choices: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    vendor: string | null;
    modelNumber: string | null;
    pictureId: string | null;
    /** When the client opened the picture full size (null = not yet). */
    pictureSeen: string | null;
    files: { id: string; name: string; seen: string | null }[];
  }[];
  chosenId: string | null;
  status: string;
  deadline: Date | null;
  deadlineTask: string | null;
  updated: boolean;
  comments: CardComment[];
  files: CardFile[];
};

const DECLINE = "DECLINED";
const FINAL = ["APPROVED", "ORDERED", "INSTALLED"];

type Filter = "needs" | "chosen" | "all";
/** Waiting on their pick (and there's something to pick from). */
const needsChoice = (c: PortalCard) => c.status === "PENDING" && c.choices.length > 0;

/**
 * The client's selections: one row each, grouped by division, filtered by pills (Needs your
 * choice first). A row opens in place to choose. `open` = a selection to start opened (from Home).
 */
export function PortalSelectionCards({ cards, open: startOpen }: { cards: PortalCard[]; open?: string | null }) {
  const needs = cards.filter(needsChoice).length;
  const [filter, setFilter] = useState<Filter>(startOpen || !needs ? "all" : "needs");
  const [open, setOpen] = useState<Set<string>>(() => new Set(startOpen ? [startOpen] : []));
  useEffect(() => {
    if (startOpen) document.getElementById(`sel-${startOpen}`)?.scrollIntoView({ block: "start" });
  }, [startOpen]);
  const shown = cards.filter((c) => (filter === "needs" ? needsChoice(c) : filter === "chosen" ? c.status !== "PENDING" : true));
  const divisions: [string, PortalCard[]][] = [];
  for (const c of shown) {
    const g = divisions.find(([d]) => d === c.division);
    if (g) g[1].push(c);
    else divisions.push([c.division, [c]]);
  }
  const pill = (f: Filter, label: string, n: number) => (
    <button
      type="button"
      onClick={() => setFilter(f)}
      className={cn("rounded-full px-3 py-1 text-xs font-medium", filter === f ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50")}
    >
      {label} · {n}
    </button>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {pill("needs", "Needs your choice", needs)}
        {pill("chosen", "Chosen", cards.filter((c) => c.status !== "PENDING").length)}
        {pill("all", "All", cards.length)}
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {divisions.length === 0 ? <p className="px-4 py-3 text-sm text-slate-500">{filter === "needs" ? "Nothing needs your choice right now." : "None yet."}</p> : null}
        {divisions.map(([d, list], i) => (
          <section key={d}>
            <h2 className={cn("bg-slate-50 px-4 py-1.5 text-xs text-slate-500", i > 0 && "border-t border-slate-200")}>{d}</h2>
            {list.map((c) => (
              <Card
                key={c.selectionId}
                c={c}
                open={open.has(c.selectionId)}
                onToggle={() =>
                  setOpen((o) => {
                    const n = new Set(o);
                    if (n.has(c.selectionId)) n.delete(c.selectionId);
                    else n.add(c.selectionId);
                    return n;
                  })
                }
              />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function Card({ c, open, onToggle }: { c: PortalCard; open: boolean; onToggle: () => void }) {
  const router = useRouter();
  const current = c.status === "DECLINED" ? DECLINE : c.chosenId;
  const [pick, setPick] = useState<string | null>(current);
  // Clicking the ticked choice again unticks it.
  const toggle = (id: string) => setPick((p) => (p === id ? null : id));
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [extra, setExtra] = useState<"files" | "comments" | null>(null);
  const final = FINAL.includes(c.status);
  const state = deadlineState(c.deadline ? new Date(c.deadline) : null, c.status);
  const diff = (price: number) => (c.allowance === null ? null : price - c.allowance);
  // What they've opened just now (the page catches up on its own).
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const track = (id: string) => {
    setOpened((o) => new Set(o).add(id));
    setTimeout(() => router.refresh(), 1500);
  };
  const isSeen = (f: { id: string; seen?: string | null }) => !!f.seen || opened.has(f.id);
  /** Files on a choice — and the selection's (not their own) — still to open before they can choose it. */
  const toOpen = (choiceId: string) => {
    const x = c.choices.find((ch) => ch.id === choiceId);
    if (!x) return [];
    const files = [...c.files.filter((f) => !f.mine), ...(x.pictureId ? [{ id: x.pictureId, name: `the picture of ${x.name}`, seen: x.pictureSeen }] : []), ...x.files];
    return files.filter((f) => !isSeen(f));
  };
  const pending = pick && pick !== DECLINE ? toOpen(pick) : [];
  const chosen = c.choices.find((x) => x.id === c.chosenId);
  const waitingOnBuilder = c.status === "PENDING" && c.choices.length === 0;
  // The row's one line under the name.
  const sub = [
    c.allowance !== null ? `Allowance ${money(c.allowance)}` : null,
    c.status === "DECLINED"
      ? "Not wanted"
      : chosen
        ? `Your choice: ${chosen.name}`
        : waitingOnBuilder
          ? "Choices coming"
          : c.deadline
            ? `Choose by ${fmtDate(c.deadline, "MMM d")}${c.deadlineTask ? ` (before ${c.deadlineTask})` : ""}`
            : `${c.choices.length} choice${c.choices.length === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article id={`sel-${c.selectionId}`} className={cn("scroll-mt-32 border-t border-slate-100", open && "bg-slate-50/60")}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-slate-50">
        <ChevronRight className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", open && "rotate-90")} />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-sm text-slate-900", open && "font-semibold")}>{c.name}</span>
          <span className="block truncate text-xs text-slate-500">{sub}</span>
        </span>
        <span className="flex shrink-0 flex-wrap justify-end gap-1">
          {c.updated ? <Tag className="bg-emerald-600 text-white">Updated</Tag> : null}
          {state === "overdue" ? (
            <Tag className="bg-rose-600 text-white">
              <AlertTriangle className="-mt-0.5 mr-0.5 inline h-3 w-3" /> Overdue
            </Tag>
          ) : state === "soon" && c.deadline ? (
            <Tag className="bg-amber-50 text-amber-800">{dueIn(new Date(c.deadline))}</Tag>
          ) : null}
          {c.status !== "PENDING" ? (
            <Tag className={c.status === "DECLINED" ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-800"}>
              {c.status === "DECLINED" ? "Not wanted" : final ? "Final" : "Chosen"}
            </Tag>
          ) : waitingOnBuilder ? (
            <Tag className="bg-slate-100 text-slate-600">Waiting on builder</Tag>
          ) : null}
        </span>
      </button>

      {open ? (
        <div className="space-y-2.5 pb-3 pl-10 pr-4">
          {c.specText ? <p className="whitespace-pre-line text-sm text-slate-600">{c.specText}</p> : null}
          {c.clientNotes ? (
            <p className="whitespace-pre-line text-sm text-slate-600">
              <span className="font-medium text-slate-800">Notes for you: </span>
              {c.clientNotes}
            </p>
          ) : null}

          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {c.choices.length === 0 ? <p className="px-3 py-2.5 text-sm text-slate-500">Your builder is still adding choices for this one.</p> : null}
            {c.choices.map((x) => (
              <label key={x.id} className={cn("flex items-center gap-2.5 px-3 py-2", final ? "cursor-default" : "cursor-pointer hover:bg-slate-50", c.chosenId === x.id && "bg-emerald-50/60")}>
                <input
                  type="radio"
                  name={`pick-${c.selectionId}`}
                  className="h-4 w-4 shrink-0"
                  checked={pick === x.id}
                  disabled={final}
                  onChange={() => {}}
                  onClick={() => toggle(x.id)}
                />
                <ChoicePicture small pictureId={x.pictureId} seen={x.pictureId && isSeen({ id: x.pictureId, seen: x.pictureSeen }) ? (x.pictureSeen ?? "now") : null} track={track} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-900">
                    {x.name}
                    {c.chosenId === x.id ? <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">Your choice</span> : null}
                  </span>
                  {x.vendor || x.modelNumber ? <span className="block text-xs text-slate-500">{[x.vendor, x.modelNumber && `Model ${x.modelNumber}`].filter(Boolean).join(" · ")}</span> : null}
                  {x.description ? <span className="block whitespace-pre-line text-xs text-slate-600">{x.description}</span> : null}
                  <ChoiceFiles files={x.files.map((f) => ({ ...f, seen: isSeen(f) ? (f.seen ?? "now") : null }))} track={track} />
                  {!final && toOpen(x.id).length ? (
                    <span className="mt-0.5 block text-xs font-medium text-amber-700">
                      Open {toOpen(x.id).length === 1 ? "the file" : `all ${toOpen(x.id).length} files`} to choose this one.
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold tabular-nums text-slate-900">{money(x.price)}</span>
                  <Diff value={diff(x.price)} />
                </span>
              </label>
            ))}
            {c.choices.length ? (
              <label className={cn("flex items-center gap-2.5 px-3 py-2", final ? "cursor-default" : "cursor-pointer hover:bg-slate-50", c.status === "DECLINED" && "bg-emerald-50/60")}>
                <input
                  type="radio"
                  name={`pick-${c.selectionId}`}
                  className="h-4 w-4 shrink-0"
                  checked={pick === DECLINE}
                  disabled={final}
                  onChange={() => {}}
                  onClick={() => toggle(DECLINE)}
                />
                <span className="flex-1 text-sm text-slate-600">I do not want this selection</span>
                <span className="shrink-0 text-right">
                  <Diff value={diff(0)} />
                </span>
              </label>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline" onClick={() => setExtra(extra === "files" ? null : "files")}>
              <Paperclip className="h-3.5 w-3.5" /> Files ({c.files.length})
            </button>
            <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline" onClick={() => setExtra(extra === "comments" ? null : "comments")}>
              <MessageSquare className="h-3.5 w-3.5" /> Comments ({c.comments.length})
            </button>
            <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {pending.length && !final ? (
                <span className="text-xs text-amber-800">
                  Please open {pending.map((f) => (f.name.startsWith("the picture") ? f.name : `“${f.name}”`)).join(", ")} first.
                </span>
              ) : null}
              {err ? <span className="text-xs text-rose-700">{err}</span> : null}
              {final ? (
                <span className="text-xs text-slate-500">This one is final. Ask your builder if you need to change it.</span>
              ) : c.choices.length ? (
                <button
                  type="button"
                  className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
                  disabled={busy || pick === current || pending.length > 0}
                  onClick={() =>
                    start(async () => {
                      setErr(null);
                      const r = await clientMakeChoice(c.selectionId, pick);
                      if (!r.ok) setErr(r.error);
                      else router.refresh();
                    })
                  }
                >
                  {busy ? "Saving…" : pick === null && current ? "Clear my choice" : current ? "Change my choice" : "Make choice"}
                </button>
              ) : null}
            </span>
          </div>
          {extra === "files" ? (
            <FilesBox
              files={c.files.map((f) => ({ ...f, seen: isSeen(f) ? (f.seen ?? "now") : null }))}
              onAdd={(fd) => clientAddFiles(c.selectionId, fd)}
              onRemove={(id) => clientRemoveFile(id)}
              canRemove={(f) => f.mine}
              track={track}
            />
          ) : extra === "comments" ? (
            <CommentsBox comments={c.comments} onPost={(body) => clientComment(c.selectionId, body)} />
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function dueIn(d: Date) {
  const n = daysUntil(d);
  return n === 0 ? "Due today" : n === 1 ? "Due tomorrow" : `Due in ${n} days`;
}

function Diff({ value }: { value: number | null }) {
  if (value === null) return null;
  const txt = Math.abs(value) < 0.005 ? "On allowance" : value > 0 ? `${money(value)} over` : `${money(-value)} under`;
  return <span className={cn("block text-xs tabular-nums", value > 0.004 ? "text-rose-700" : value < -0.004 ? "text-emerald-700" : "text-slate-500")}>{txt}</span>;
}

function Tag({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={cn("whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium", className)}>{children}</span>;
}
