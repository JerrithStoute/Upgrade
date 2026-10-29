"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/link";
import { AlertTriangle, ArrowRightLeft, CalendarClock, ChevronDown, ChevronRight, Paperclip, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn, fmtDate, money } from "@/lib/utils";
import { daysUntil, deadlineState } from "@/lib/deadlines";
import { buttonClasses } from "@/components/ui";
import type { ViewerCard } from "@/lib/selections";

/** A card as the board gets it: without the original budget for someone who doesn't see costs. */
type SelectionCard = Omit<ViewerCard, "budget"> & { budget: ViewerCard["budget"] | null };
import { ChoiceFiles, ChoicePicture, CommentsBox, FilesBox } from "@/components/selections/extras";
import {
  addChoiceFiles,
  addSelectionFiles,
  commentOnSelection,
  makeChoice,
  moveChoice,
  removeChoice,
  removeSelectionFile,
  saveChoice,
  setAllowanceProfit,
  setChoicePicture,
  setDeadlines,
} from "../actions";

type Task = { id: string; name: string; startDate: Date };
type DeadlineDraft = { selectionId: string; mode: "none" | "date" | "task"; date: string; taskId: string | null; leadDays: number };

const ymd = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const draftOf = (c: SelectionCard): DeadlineDraft => ({
  selectionId: c.selectionId,
  mode: c.deadline.task ? "task" : c.deadline.date ? "date" : "none",
  date: c.deadline.task ? "" : ymd(c.deadline.date),
  taskId: c.deadline.task?.id ?? null,
  leadDays: c.deadline.leadDays,
});

const DECLINE = "DECLINED";

/**
 * Selections, one at a time: the list on the left (by division, like the estimate — each with its
 * cost codes, where it stands and when it's due), and only the one you open on the right. So a
 * choice always goes on the selection you meant. Each selection: the spec text and client notes,
 * the original budget (staff only), the allowance, and the numbered choices with "I do not want
 * this selection". Pick one and Make Choice; it shows how far over / under it is.
 */
export function SelectionsBoard({
  projectId,
  estimateHref,
  cards,
  profitDefault,
  tasks,
  showCosts = true,
  initialId,
}: {
  projectId: string;
  estimateHref: string;
  cards: SelectionCard[];
  /** The selection to open first (?s= in the address). */
  initialId?: string;
  profitDefault: boolean;
  /** The person sees costs and profit (their position): the original budget and each choice's cost. */
  showCosts?: boolean;
  /** The job's schedule items, for "Requested by". */
  tasks: Task[];
}) {
  const [bulk, setBulk] = useState(false);
  // The one that's open: from the address (?s=), else the first still waiting on a choice.
  const [openId, setOpenId] = useState<string>(() =>
    initialId && cards.some((c) => c.selectionId === initialId) ? initialId : ((cards.find((c) => c.status === "PENDING") ?? cards[0])?.selectionId ?? ""),
  );
  const open = (id: string) => {
    setOpenId(id);
    const u = new URL(window.location.href);
    u.searchParams.set("s", id);
    window.history.replaceState(null, "", u);
  };
  const divisions: [string, SelectionCard[]][] = [];
  for (const c of cards) {
    const g = divisions.find(([d]) => d === c.division);
    if (g) g[1].push(c);
    else divisions.push([c.division, [c]]);
  }
  const current = cards.find((c) => c.selectionId === openId) ?? cards[0];
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[17rem_1fr]">
      <aside className="space-y-2 rounded-xl border border-slate-300 bg-white p-2 shadow-sm lg:sticky lg:top-28 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
        <div className="flex items-center justify-between gap-2 px-1.5 pt-1">
          <p className="text-sm font-semibold text-slate-900">Selections · {cards.length}</p>
          <button type="button" className="tap inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline" onClick={() => setBulk(true)}>
            <CalendarClock className="h-3.5 w-3.5" /> Deadlines
          </button>
        </div>
        {divisions.map(([d, list]) => (
          <div key={d}>
            <p className="px-1.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-slate-600">{d}</p>
            <ul className="space-y-0.5">
              {list.map((c) => {
                const st = deadlineState(c.deadline.date ? new Date(c.deadline.date) : null, c.status);
                const on = c.selectionId === current?.selectionId;
                return (
                  <li key={c.selectionId}>
                    <button
                      type="button"
                      onClick={() => open(c.selectionId)}
                      className={cn("w-full rounded-lg px-2 py-1.5 text-left", on ? "bg-blue-600 text-white" : "text-slate-900 hover:bg-slate-100")}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", c.status === "PENDING" ? (st === "overdue" ? "bg-rose-500" : "bg-amber-400") : "bg-emerald-500")} />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                        {c.updated ? <span className={cn("rounded px-1 text-[10px] font-bold", on ? "bg-white/20" : "bg-emerald-600 text-white")}>NEW</span> : null}
                      </span>
                      <span className={cn("block truncate pl-3.5 text-xs", on ? "text-blue-100" : "text-slate-600")}>
                        {[c.costCodes.join(", "), st === "overdue" ? "Overdue" : c.deadline.date ? `Due ${fmtDate(c.deadline.date, "MMM d")}` : null].filter(Boolean).join(" · ") ||
                          statusWord(c.status)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </aside>
      <div className="min-w-0">
        {current ? (
          <Card
            key={current.selectionId}
            projectId={projectId}
            estimateHref={estimateHref}
            c={current}
            others={cards.filter((x) => x.selectionId !== current.selectionId)}
            profitDefault={profitDefault}
            tasks={tasks}
            showCosts={showCosts}
          />
        ) : null}
      </div>
      {bulk ? <BulkDeadlines projectId={projectId} cards={cards} tasks={tasks} onClose={() => setBulk(false)} /> : null}
    </div>
  );
}

const statusWord = (status: string) =>
  ({ PENDING: "Waiting on a choice", CHOSEN: "Chosen", DECLINED: "Not wanted", APPROVED: "Approved", ORDERED: "Ordered", INSTALLED: "Installed" })[status] ?? status;

function Card({
  projectId,
  estimateHref,
  c,
  others,
  profitDefault,
  tasks,
  showCosts,
}: {
  projectId: string;
  estimateHref: string;
  c: SelectionCard;
  /** The job's other selections — a choice can be moved to one. */
  others: SelectionCard[];
  profitDefault: boolean;
  tasks: Task[];
  showCosts: boolean;
}) {
  const [editDeadline, setEditDeadline] = useState(false);
  const state = deadlineState(c.deadline.date ? new Date(c.deadline.date) : null, c.status);
  const router = useRouter();
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const current = c.status === "DECLINED" ? DECLINE : c.chosenId;
  const [pick, setPick] = useState<string | null>(current);
  // Clicking the ticked choice again unticks it.
  const toggle = (id: string) => setPick((p) => (p === id ? null : id));
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  // Save the choice, then put the files from the form on it.
  const saveWithFiles = async (saving: ReturnType<typeof saveChoice>, files: File[]) => {
    const r = await saving;
    if (!r.ok || !files.length) return r;
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    return addChoiceFiles(projectId, c.selectionId, r.id, fd);
  };
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) =>
    start(async () => {
      setErr(null);
      const r = await fn();
      if (!r.ok) setErr(r.error);
      else {
        after?.();
        router.refresh();
      }
    });
  const chosen = c.choices.find((x) => x.id === c.chosenId) ?? null;
  const diff = (price: number) => (c.allowance === null ? null : price - c.allowance);
  const made = c.status === "DECLINED" ? diff(0) : chosen ? diff(chosen.price) : null;

  return (
    <article className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header
        className={cn(
          "flex flex-wrap items-start justify-between gap-3 rounded-t-xl border-b px-5 py-3",
          state === "overdue" ? "border-rose-200 bg-rose-50" : c.status === "PENDING" ? "border-slate-200" : "border-emerald-200 bg-emerald-50/50",
        )}
      >
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-slate-900">{c.name}</h3>
          {c.costCodes.length ? <p className="text-sm font-medium text-slate-700">{c.costCodes.join(" · ")}</p> : null}
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
            {c.kind === "SELECTION" ? <Tag className="bg-violet-50 text-violet-800 ring-violet-200">Selection</Tag> : null}
            {c.isAllowance ? <Tag className="bg-amber-50 text-amber-800 ring-amber-200">Allowance</Tag> : null}
            <StatusTag status={c.status} />
            {c.updated ? <Tag className="bg-emerald-600 text-white ring-emerald-600">Updated</Tag> : null}
            {state === "overdue" ? (
              <Tag className="bg-rose-600 text-white ring-rose-600">
                <AlertTriangle className="-mt-0.5 mr-0.5 inline h-3 w-3" /> Overdue
              </Tag>
            ) : state === "soon" && c.deadline.date ? (
              <Tag className="bg-amber-50 text-amber-800 ring-amber-200">{dueIn(new Date(c.deadline.date))}</Tag>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-slate-700">
            <RequestedBy c={c} />{" "}
            <button type="button" className="tap ml-1 font-medium text-blue-700 hover:underline" onClick={() => setEditDeadline((o) => !o)}>
              {c.deadline.date ? "Change" : "Set a deadline"}
            </button>
          </p>
          {editDeadline ? <DeadlineEditor projectId={projectId} tasks={tasks} initial={draftOf(c)} onDone={() => setEditDeadline(false)} /> : null}
        </div>
        <Link href={estimateHref} className="text-xs font-medium text-blue-700 hover:underline">
          Edit in the estimate
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-[1fr_20rem]">
        <div className="space-y-3">
          <Box title="Specification information">
            {c.specText ? <p className="whitespace-pre-line">{c.specText}</p> : <Empty>No spec text yet — add it in the estimate.</Empty>}
          </Box>
          {c.clientNotes ? (
            <Box title="Client notes">
              <p className="whitespace-pre-line">{c.clientNotes}</p>
            </Box>
          ) : null}
          <FilesBox
            files={c.files}
            onAdd={(fd) => addSelectionFiles(projectId, c.selectionId, fd)}
            onRemove={(id) => removeSelectionFile(projectId, id)}
            canRemove={() => true}
            showSeen
          />
        </div>
        <div>
          {showCosts && c.budget ? (
            <>
              <button
                type="button"
                onClick={() => setBudgetOpen((o) => !o)}
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="flex items-center gap-1.5 font-medium text-slate-800">
                  {budgetOpen ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                  Original budget
                </span>
                <span className="tabular-nums text-slate-600">{money(c.budget!.total)}</span>
              </button>
              {budgetOpen ? (
                <table className="mt-1 w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {c.budget!.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="py-1 pr-2 text-slate-700">{l.description || "—"}</td>
                        <td className="py-1 text-right tabular-nums text-slate-700">{money(l.cost)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="py-1 pr-2 text-slate-500">Profit</td>
                      <td className="py-1 text-right tabular-nums text-slate-500">{money(c.budget!.profit)}</td>
                    </tr>
                    <tr className="font-semibold">
                      <td className="py-1 pr-2">Total</td>
                      <td className="py-1 text-right tabular-nums">{money(c.budget!.total)}</td>
                    </tr>
                  </tbody>
                </table>
              ) : null}
              <p className="mt-1 text-[11px] text-slate-500">Only your team sees this.</p>
            </>
          ) : null}
          <div className="mt-3">
            <CommentsBox team comments={c.comments} log={c.log} onPost={(body, internal) => commentOnSelection(projectId, c.selectionId, body, internal)} />
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-slate-900">Choices</h4>
          {c.allowance !== null ? (
            // How the allowance is figured from the estimate, in dollars: what the items cost you, or that plus your markup.
            <span className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2 text-sm">
              <span className="font-medium text-slate-800">Allowance</span>
              <select
                className="input !h-8 !w-auto !py-0 text-sm font-semibold"
                aria-label="Allowance figured as"
                value={c.allowanceProfit === null ? "" : c.allowanceProfit ? "in" : "out"}
                disabled={busy}
                onChange={(e) => run(() => setAllowanceProfit(projectId, c.specId, e.target.value === "" ? null : e.target.value === "in"))}
              >
                <option value="out">{money(c.allowanceWays?.atCost ?? c.allowance)} — your cost, no markup</option>
                <option value="in">{money(c.allowanceWays?.withMarkup ?? c.allowance)} — with your markup</option>
                <option value="">
                  {money(profitDefault ? (c.allowanceWays?.withMarkup ?? c.allowance) : (c.allowanceWays?.atCost ?? c.allowance))} — company default ({profitDefault ? "with markup" : "your cost"})
                </option>
              </select>
              <span className="basis-full text-right text-xs text-slate-600">Over / under is measured against this amount.</span>
            </span>
          ) : null}
        </div>

        <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {c.choices.map((x, i) =>
            editing === x.id ? (
              <ChoiceForm
                key={x.id}
                initial={x}
                showCost={showCosts}
                busy={busy}
                onCancel={() => setEditing(null)}
                onSave={(v, files) =>
                  run(
                    () => saveWithFiles(saveChoice(projectId, c.selectionId, { ...v, id: x.id }), files),
                    () => setEditing(null),
                  )
                }
              />
            ) : (
              <label
                key={x.id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-slate-50",
                  c.chosenId === x.id && "bg-emerald-50/60",
                  dropOn === x.id && "bg-blue-50 ring-2 ring-inset ring-blue-300",
                )}
                // Drop a PDF (or a picture) right on the choice.
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes("Files")) return;
                  e.preventDefault();
                  setDropOn(x.id);
                }}
                onDragLeave={() => setDropOn((d) => (d === x.id ? null : d))}
                onDrop={(e) => {
                  if (!e.dataTransfer.files.length) return;
                  e.preventDefault();
                  setDropOn(null);
                  const fd = new FormData();
                  for (const f of Array.from(e.dataTransfer.files)) fd.append("files", f);
                  run(() => addChoiceFiles(projectId, c.selectionId, x.id, fd));
                }}
              >
                <input type="radio" name={`pick-${c.selectionId}`} className="mt-1 h-4 w-4" checked={pick === x.id} onChange={() => {}} onClick={() => toggle(x.id)} />
                <span className="w-7 shrink-0 pt-0.5 text-sm font-semibold text-slate-500">#{i + 1}</span>
                <ChoicePicture pictureId={x.pictureId} seen={x.pictureSeen} onUpload={(fd) => setChoicePicture(projectId, c.selectionId, x.id, fd)} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900">
                    {x.name}
                    {c.chosenId === x.id ? <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Chosen</span> : null}
                  </span>
                  {x.description ? <span className="mt-0.5 block whitespace-pre-line text-sm text-slate-700">{x.description}</span> : null}
                  {x.vendor || x.modelNumber || (showCosts && x.cost !== null) ? (
                    <span className="mt-1 block text-xs text-slate-600">
                      {[x.vendor, x.modelNumber && `Model ${x.modelNumber}`, showCosts && x.cost !== null && `Your cost ${money(x.cost)}`].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                  <ChoiceFiles files={x.files} showSeen onAdd={(fd) => addChoiceFiles(projectId, c.selectionId, x.id, fd)} onRemove={(id) => removeSelectionFile(projectId, id)} />
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold tabular-nums text-slate-900">{money(x.price)}</span>
                  <Diff value={diff(x.price)} />
                </span>
                <span className="flex shrink-0 items-start gap-0.5">
                  {moving === x.id ? (
                    <select
                      autoFocus
                      className="input !h-7 !w-44 !py-0 text-xs"
                      aria-label={`Move ${x.name} to`}
                      value=""
                      onClick={(e) => e.preventDefault()}
                      onBlur={() => setMoving(null)}
                      onChange={(e) => {
                        const to = e.target.value;
                        if (!to) return;
                        setMoving(null);
                        run(() => moveChoice(projectId, c.selectionId, x.id, to));
                      }}
                    >
                      <option value="">Move to…</option>
                      {others.map((o) => (
                        <option key={o.selectionId} value={o.selectionId}>
                          {o.name}
                          {o.costCodes.length ? ` (${o.costCodes[0]})` : ""}
                        </option>
                      ))}
                    </select>
                  ) : others.length ? (
                    <button
                      type="button"
                      className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      aria-label={`Move ${x.name} to another selection`}
                      title="Move to another selection"
                      onClick={(e) => {
                        e.preventDefault();
                        setMoving(x.id);
                      }}
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    aria-label={`Edit ${x.name}`}
                    onClick={(e) => {
                      e.preventDefault();
                      setEditing(x.id);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                    aria-label={`Delete ${x.name}`}
                    onClick={(e) => {
                      e.preventDefault();
                      if (window.confirm(`Delete the choice "${x.name}"?`)) run(() => removeChoice(projectId, c.selectionId, x.id));
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </label>
            ),
          )}
          {editing === "new" ? (
            <ChoiceForm
              forName={c.name}
              showCost={showCosts}
              busy={busy}
              onCancel={() => setEditing(null)}
              onSave={(v, files) =>
                run(
                  () => saveWithFiles(saveChoice(projectId, c.selectionId, { ...v, id: null }), files),
                  () => setEditing(null),
                )
              }
            />
          ) : null}
          <label className={cn("flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50", c.status === "DECLINED" && "bg-emerald-50/60")}>
            <input type="radio" name={`pick-${c.selectionId}`} className="h-4 w-4" checked={pick === DECLINE} onChange={() => {}} onClick={() => toggle(DECLINE)} />
            <span className="w-7 shrink-0" />
            <span className="flex-1 text-sm font-semibold text-slate-900">
              I do not want this selection
              {c.status === "DECLINED" ? <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Chosen</span> : null}
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-sm font-semibold tabular-nums text-slate-900">{money(0)}</span>
              <Diff value={diff(0)} />
            </span>
            <span className="w-[3.25rem] shrink-0" />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className={buttonClasses("secondary", "sm")} onClick={() => setEditing("new")} disabled={editing !== null}>
            <Plus className="h-3.5 w-3.5" /> Add choice
          </button>
          <span className="ml-auto text-xs text-rose-700">{err}</span>
          {made !== null || c.status !== "PENDING" ? (
            <span className="text-sm text-slate-600">
              {c.status === "DECLINED" ? "Declined" : `Chose #${c.choices.findIndex((x) => x.id === c.chosenId) + 1}`}
              {made !== null ? (
                <>
                  {" · "}
                  <Diff value={made} inline />
                </>
              ) : null}
            </span>
          ) : null}
          {/* Unticking the saved choice turns this into "Clear choice". */}
          <button
            type="button"
            className={buttonClasses("primary", "sm")}
            disabled={busy || pick === current || (pick === null && c.status === "PENDING")}
            onClick={() => run(() => makeChoice(projectId, c.selectionId, pick))}
          >
            {busy ? "Saving…" : pick === null && c.status !== "PENDING" ? "Clear choice" : "Make choice"}
          </button>
        </div>
      </div>
    </article>
  );
}

type ChoiceValues = { name: string; description: string; price: number; cost: number | null; vendor: string; modelNumber: string };

function ChoiceForm({
  initial,
  forName,
  showCost,
  busy,
  onSave,
  onCancel,
}: {
  initial?: { name: string; description: string | null; price: number; cost: number | null; vendor: string | null; modelNumber: string | null };
  /** A new choice: the selection it's going on, said at the top. */
  forName?: string;
  /** Their position sees costs (otherwise the choice keeps whatever cost it has). */
  showCost: boolean;
  busy: boolean;
  onSave: (v: ChoiceValues, files: File[]) => void;
  onCancel: () => void;
}) {
  // Files to put on the choice when it's saved (PDF spec sheets, quotes, a picture).
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const addFiles = (list: FileList | null) => list && setFiles((f) => [...f, ...Array.from(list)]);
  const [v, setV] = useState({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    price: initial ? String(initial.price) : "",
    cost: initial?.cost != null ? String(initial.cost) : "",
    vendor: initial?.vendor ?? "",
    modelNumber: initial?.modelNumber ?? "",
  });
  const num = (s: string) => Number(s.replace(/[$,\s]/g, ""));
  const ok = v.name.trim() && Number.isFinite(num(v.price || "0")) && (v.cost === "" || Number.isFinite(num(v.cost)));
  return (
    <div className="space-y-2 bg-blue-50 px-4 py-3">
      {forName ? (
        <p className="text-sm font-semibold text-blue-900">
          New choice for <span className="underline decoration-blue-300 underline-offset-2">{forName}</span>
        </p>
      ) : null}
      <div className={cn("grid gap-2", showCost ? "sm:grid-cols-[1fr_8rem_8rem]" : "sm:grid-cols-[1fr_8rem]")}>
        <input
          className="input"
          placeholder="Choice, e.g. Flooring with wood floors"
          value={v.name}
          autoFocus
          onChange={(e) => setV({ ...v, name: e.target.value })}
          aria-label="Choice name"
        />
        <input
          className="input text-right"
          inputMode="decimal"
          placeholder="Client price"
          value={v.price}
          onChange={(e) => setV({ ...v, price: e.target.value })}
          aria-label="Client price"
        />
        {showCost ? (
          <input
            className="input text-right"
            inputMode="decimal"
            placeholder="Your cost"
            value={v.cost}
            onChange={(e) => setV({ ...v, cost: e.target.value })}
            aria-label="Your cost"
          />
        ) : null}
      </div>
      <textarea
        className="input"
        rows={2}
        placeholder="Description the client sees"
        value={v.description}
        onChange={(e) => setV({ ...v, description: e.target.value })}
        aria-label="Description"
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input className="input" placeholder="Vendor" value={v.vendor} onChange={(e) => setV({ ...v, vendor: e.target.value })} aria-label="Vendor" />
        <input className="input" placeholder="Model #" value={v.modelNumber} onChange={(e) => setV({ ...v, modelNumber: e.target.value })} aria-label="Model number" />
      </div>
      <label
        className={cn(
          "flex cursor-pointer flex-wrap items-center gap-2 rounded-md border-2 border-dashed px-3 py-2 text-xs text-slate-500",
          over ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-blue-300",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <Paperclip className="h-3.5 w-3.5" />
        {files.length ? (
          files.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-slate-700 ring-1 ring-slate-200">
              {f.name}
              <button
                type="button"
                className="text-slate-400 hover:text-rose-600"
                aria-label={`Don't add ${f.name}`}
                onClick={(e) => {
                  e.preventDefault();
                  setFiles((all) => all.filter((_, j) => j !== i));
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        ) : (
          <span>
            Drop a PDF, spec sheet or picture here — or click to pick one. <span className="text-slate-400">(Any file up to 25 MB; PDFs and pictures open in the browser.)</span>
          </span>
        )}
        <input type="file" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className={buttonClasses("ghost", "sm")} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={buttonClasses("primary", "sm")}
          disabled={!ok || busy}
          onClick={() =>
            onSave(
              {
                name: v.name.trim(),
                description: v.description.trim(),
                price: num(v.price || "0"),
                cost: v.cost === "" ? null : num(v.cost),
                vendor: v.vendor,
                modelNumber: v.modelNumber,
              },
              files,
            )
          }
        >
          {initial ? "Save choice" : "Add choice"}
        </button>
      </div>
    </div>
  );
}

function Diff({ value, inline }: { value: number | null; inline?: boolean }) {
  if (value === null) return null;
  const txt = Math.abs(value) < 0.005 ? "On allowance" : value > 0 ? `${money(value)} over` : `${money(-value)} under`;
  return <span className={cn(inline ? "" : "block text-xs", "tabular-nums", value > 0.004 ? "text-rose-700" : value < -0.004 ? "text-emerald-700" : "text-slate-500")}>{txt}</span>;
}

function StatusTag({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    PENDING: ["Waiting on a choice", "bg-amber-50 text-amber-800 ring-amber-200"],
    CHOSEN: ["Chosen", "bg-emerald-50 text-emerald-800 ring-emerald-200"],
    DECLINED: ["Not wanted", "bg-slate-100 text-slate-700 ring-slate-200"],
    APPROVED: ["Approved", "bg-emerald-50 text-emerald-800 ring-emerald-200"],
    ORDERED: ["Ordered", "bg-violet-50 text-violet-800 ring-violet-200"],
    INSTALLED: ["Installed", "bg-emerald-50 text-emerald-800 ring-emerald-200"],
  };
  const [label, cls] = map[status] ?? [status, "bg-slate-100 text-slate-700 ring-slate-200"];
  return <Tag className={cls}>{label}</Tag>;
}

function Tag({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset", className)}>{children}</span>;
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-300 p-3 text-sm text-slate-800">
      <p className="mb-1 font-semibold text-slate-900">{title}</p>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-slate-500">{children}</p>;
}

function dueIn(d: Date) {
  const n = daysUntil(d);
  return n === 0 ? "Due today" : n === 1 ? "Due tomorrow" : `Due in ${n} days`;
}

/** "Requested by Rough-in Framing (Est. Thu, Jul 24, 2026)", "Requested by Jul 24, 2026", or no deadline. */
function RequestedBy({ c }: { c: SelectionCard }) {
  if (c.deadline.task)
    return (
      <>
        Requested by <span className="font-medium text-slate-800">{c.deadline.task.name}</span>
        {c.deadline.leadDays ? ` (${c.deadline.leadDays} day${c.deadline.leadDays === 1 ? "" : "s"} before)` : ""} · Est. {fmtDate(c.deadline.date, "EEE, MMM d, yyyy")}
      </>
    );
  if (c.deadline.date)
    return (
      <>
        Requested by <span className="font-medium text-slate-800">{fmtDate(c.deadline.date, "EEE, MMM d, yyyy")}</span>
      </>
    );
  return <span className="text-slate-500">No deadline</span>;
}

/** One selection's "Requested by": none, a date, or a schedule item (n days before it starts). */
function DeadlineFields({ v, tasks, onChange }: { v: DeadlineDraft; tasks: Task[]; onChange: (v: DeadlineDraft) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <select
        className="input !h-8 !w-auto !py-0 text-xs"
        value={v.mode}
        aria-label="Requested by"
        onChange={(e) => onChange({ ...v, mode: e.target.value as DeadlineDraft["mode"] })}
      >
        <option value="none">No deadline</option>
        <option value="date">A date</option>
        <option value="task" disabled={!tasks.length}>
          A schedule item{tasks.length ? "" : " (none on the schedule)"}
        </option>
      </select>
      {v.mode === "date" ? (
        <input type="date" className="input !h-8 !w-40 !py-0 text-xs" value={v.date} aria-label="Deadline date" onChange={(e) => onChange({ ...v, date: e.target.value })} />
      ) : null}
      {v.mode === "task" ? (
        <>
          <input
            type="number"
            min={0}
            max={365}
            className="input !h-8 !w-16 !py-0 text-right text-xs"
            value={v.leadDays}
            aria-label="Days before"
            onChange={(e) => onChange({ ...v, leadDays: Math.max(0, Math.min(365, Math.round(Number(e.target.value) || 0))) })}
          />
          <span className="text-xs text-slate-500">days before</span>
          <select className="input !h-8 !w-64 !py-0 text-xs" value={v.taskId ?? ""} aria-label="Schedule item" onChange={(e) => onChange({ ...v, taskId: e.target.value || null })}>
            <option value="">Pick a schedule item…</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {fmtDate(t.startDate, "MMM d, yyyy")}
              </option>
            ))}
          </select>
        </>
      ) : null}
    </div>
  );
}

function DeadlineEditor({ projectId, tasks, initial, onDone }: { projectId: string; tasks: Task[]; initial: DeadlineDraft; onDone: () => void }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-white p-3">
      <DeadlineFields v={v} tasks={tasks} onChange={setV} />
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={buttonClasses("primary", "sm")}
          disabled={busy}
          onClick={() =>
            start(async () => {
              const r = await setDeadlines(projectId, [v]);
              if (!r.ok) setErr(r.error);
              else {
                onDone();
                router.refresh();
              }
            })
          }
        >
          {busy ? "Saving…" : "Save deadline"}
        </button>
        <button type="button" className={buttonClasses("ghost", "sm")} onClick={onDone}>
          Cancel
        </button>
        <span className="text-xs text-rose-700">{err}</span>
      </div>
    </div>
  );
}

/** Change deadlines: every selection's "Requested by" in one list, saved together. */
function BulkDeadlines({ projectId, cards, tasks, onClose }: { projectId: string; cards: SelectionCard[]; tasks: Task[]; onClose: () => void }) {
  const router = useRouter();
  const [rows, setRows] = useState(() => cards.map(draftOf));
  const [all, setAll] = useState<DeadlineDraft>({ selectionId: "", mode: "task", date: "", taskId: null, leadDays: 0 });
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const name = new Map(cards.map((c) => [c.selectionId, c.name]));
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4" role="dialog" aria-modal="true" aria-label="Change deadlines">
      <div className="flex h-[85vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">Change deadlines</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-2.5">
          <span className="text-xs font-medium text-slate-600">For the ticked ones:</span>
          <DeadlineFields v={all} tasks={tasks} onChange={setAll} />
          <button
            type="button"
            className={buttonClasses("secondary", "sm")}
            disabled={!picked.size}
            onClick={() => setRows((rs) => rs.map((r) => (picked.has(r.selectionId) ? { ...all, selectionId: r.selectionId } : r)))}
          >
            Apply to {picked.size || ""} ticked
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-slate-100 px-5">
          {rows.map((r, i) => (
            <div key={r.selectionId} className="flex flex-wrap items-center gap-3 py-2.5">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                aria-label={`Pick ${name.get(r.selectionId)}`}
                checked={picked.has(r.selectionId)}
                onChange={(e) =>
                  setPicked((p) => {
                    const n = new Set(p);
                    if (e.target.checked) n.add(r.selectionId);
                    else n.delete(r.selectionId);
                    return n;
                  })
                }
              />
              <span className="w-56 truncate text-sm font-medium text-slate-800">{name.get(r.selectionId)}</span>
              <DeadlineFields v={r} tasks={tasks} onChange={(v) => setRows((rs) => rs.map((x, j) => (j === i ? v : x)))} />
            </div>
          ))}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <span className="mr-auto text-xs text-rose-700">{err}</span>
          <button type="button" className={buttonClasses("ghost", "sm")} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={buttonClasses("primary", "sm")}
            disabled={busy}
            onClick={() =>
              start(async () => {
                const r = await setDeadlines(projectId, rows);
                if (!r.ok) setErr(r.error);
                else {
                  onClose();
                  router.refresh();
                }
              })
            }
          >
            {busy ? "Saving…" : "Save deadlines"}
          </button>
        </footer>
      </div>
    </div>
  );
}
