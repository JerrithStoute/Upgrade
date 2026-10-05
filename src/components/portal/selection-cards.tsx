"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { cn, fmtDate, money } from "@/lib/utils";
import { daysUntil, deadlineState } from "@/lib/deadlines";
import { buttonClasses } from "@/components/ui";
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

/** The client's selections, grouped by division. */
export function PortalSelectionCards({ cards }: { cards: PortalCard[] }) {
  const divisions: [string, PortalCard[]][] = [];
  for (const c of cards) {
    const g = divisions.find(([d]) => d === c.division);
    if (g) g[1].push(c);
    else divisions.push([c.division, [c]]);
  }
  return (
    <div className="space-y-5">
      {divisions.map(([d, list]) => (
        <section key={d} className="space-y-3">
          <h2 className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-semibold uppercase tracking-wide text-slate-700">{d}</h2>
          {list.map((c) => (
            <Card key={c.selectionId} c={c} />
          ))}
        </section>
      ))}
    </div>
  );
}

function Card({ c }: { c: PortalCard }) {
  const router = useRouter();
  const current = c.status === "DECLINED" ? DECLINE : c.chosenId;
  const [pick, setPick] = useState<string | null>(current);
  // Clicking the ticked choice again unticks it.
  const toggle = (id: string) => setPick((p) => (p === id ? null : id));
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
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

  return (
    <article id={`sel-${c.selectionId}`} className="scroll-mt-4 rounded-xl border border-slate-200 bg-white shadow-sm">
      <header
        className={cn("flex flex-wrap items-start justify-between gap-3 rounded-t-xl border-b px-5 py-3", state === "overdue" ? "border-rose-200 bg-rose-50" : "border-slate-200")}
      >
        <div>
          <h3 className="text-base font-semibold text-slate-900">{c.name}</h3>
          {c.deadline ? (
            <p className="mt-0.5 text-xs text-slate-600">
              Please choose by <span className="font-medium text-slate-800">{fmtDate(c.deadline, "EEE, MMM d, yyyy")}</span>
              {c.deadlineTask ? ` (before ${c.deadlineTask})` : ""}
            </p>
          ) : null}
        </div>
        <span className="flex flex-wrap items-center gap-1.5">
          {state === "overdue" ? (
            <Tag className="bg-rose-600 text-white ring-rose-600">
              <AlertTriangle className="-mt-0.5 mr-0.5 inline h-3 w-3" /> Overdue
            </Tag>
          ) : state === "soon" && c.deadline ? (
            <Tag className="bg-amber-50 text-amber-800 ring-amber-200">{dueIn(new Date(c.deadline))}</Tag>
          ) : null}
          {c.updated ? <Tag className="bg-emerald-600 text-white ring-emerald-600">Updated</Tag> : null}
          {c.status !== "PENDING" ? (
            <Tag className="bg-emerald-50 text-emerald-800 ring-emerald-200">{c.status === "DECLINED" ? "Not wanted" : final ? "Final" : "Chosen"}</Tag>
          ) : null}
        </span>
      </header>

      <div className="grid gap-4 p-5 md:grid-cols-[1fr_20rem]">
        <div className="space-y-3">
          {c.specText ? (
            <Box title="Specification information">
              <p className="whitespace-pre-line">{c.specText}</p>
            </Box>
          ) : null}
          {c.clientNotes ? (
            <Box title="Notes for you">
              <p className="whitespace-pre-line">{c.clientNotes}</p>
            </Box>
          ) : null}
          <FilesBox
            files={c.files.map((f) => ({ ...f, seen: isSeen(f) ? (f.seen ?? "now") : null }))}
            onAdd={(fd) => clientAddFiles(c.selectionId, fd)}
            onRemove={(id) => clientRemoveFile(id)}
            canRemove={(f) => f.mine}
            track={track}
          />
        </div>
        <CommentsBox comments={c.comments} onPost={(body) => clientComment(c.selectionId, body)} />
      </div>

      <div className="border-t border-slate-200 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-slate-900">Choices</h4>
          {c.allowance !== null ? (
            <span className="text-sm">
              Allowance: <span className="font-semibold tabular-nums">{money(c.allowance)}</span>
            </span>
          ) : null}
        </div>
        <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {c.choices.length === 0 ? <p className="px-4 py-3 text-sm text-slate-500">Your builder is still adding choices for this one.</p> : null}
          {c.choices.map((x, i) => (
            <label
              key={x.id}
              className={cn("flex items-start gap-3 px-4 py-3", final ? "cursor-default" : "cursor-pointer hover:bg-slate-50", c.chosenId === x.id && "bg-emerald-50/60")}
            >
              <input
                type="radio"
                name={`pick-${c.selectionId}`}
                className="mt-1 h-4 w-4"
                checked={pick === x.id}
                disabled={final}
                onChange={() => {}}
                onClick={() => toggle(x.id)}
              />
              <span className="w-7 shrink-0 pt-0.5 text-sm font-semibold text-slate-500">#{i + 1}</span>
              <ChoicePicture pictureId={x.pictureId} seen={x.pictureId && isSeen({ id: x.pictureId, seen: x.pictureSeen }) ? (x.pictureSeen ?? "now") : null} track={track} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">
                  {x.name}
                  {c.chosenId === x.id ? <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Your choice</span> : null}
                </span>
                {x.description ? <span className="mt-0.5 block whitespace-pre-line text-sm text-slate-600">{x.description}</span> : null}
                <ChoiceFiles files={x.files.map((f) => ({ ...f, seen: isSeen(f) ? (f.seen ?? "now") : null }))} track={track} />
                {!final && toOpen(x.id).length ? (
                  <span className="mt-1 block text-xs font-medium text-amber-700">
                    Open {toOpen(x.id).length === 1 ? "the file" : `all ${toOpen(x.id).length} files`} to choose this one.
                  </span>
                ) : null}
                {x.vendor || x.modelNumber ? (
                  <span className="mt-1 block text-xs text-slate-500">{[x.vendor, x.modelNumber && `Model ${x.modelNumber}`].filter(Boolean).join(" · ")}</span>
                ) : null}
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-semibold tabular-nums text-slate-900">{money(x.price)}</span>
                <Diff value={diff(x.price)} />
              </span>
            </label>
          ))}
          <label className={cn("flex items-center gap-3 px-4 py-3", final ? "cursor-default" : "cursor-pointer hover:bg-slate-50", c.status === "DECLINED" && "bg-emerald-50/60")}>
            <input
              type="radio"
              name={`pick-${c.selectionId}`}
              className="h-4 w-4"
              checked={pick === DECLINE}
              disabled={final}
              onChange={() => {}}
              onClick={() => toggle(DECLINE)}
            />
            <span className="w-7 shrink-0" />
            <span className="flex-1 text-sm font-semibold text-slate-900">I do not want this selection</span>
            <span className="shrink-0 text-right">
              <span className="block text-sm font-semibold tabular-nums text-slate-900">{money(0)}</span>
              <Diff value={diff(0)} />
            </span>
          </label>
        </div>
        <div className="mt-3 flex items-center justify-end gap-3">
          {pending.length && !final ? (
            <span className="text-xs text-amber-800">
              Please open {pending.map((f) => (f.name.startsWith("the picture") ? f.name : `“${f.name}”`)).join(", ")} before choosing this one.
            </span>
          ) : null}
          <span className="text-xs text-rose-700">{err}</span>
          {final ? (
            <span className="text-sm text-slate-500">This selection is final. Ask your builder if you need to change it.</span>
          ) : (
            <button
              type="button"
              className={buttonClasses("primary", "sm")}
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
              {busy ? "Saving…" : pick === null ? "Clear my choice" : current ? "Change my choice" : "Make choice"}
            </button>
          )}
        </div>
      </div>
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
  return <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset", className)}>{children}</span>;
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
      <p className="mb-1 font-semibold text-slate-900">{title}</p>
      {children}
    </div>
  );
}
