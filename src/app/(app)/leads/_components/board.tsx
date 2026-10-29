"use client";

import { useState, useTransition } from "react";
import Link from "@/components/link";
import { useRouter } from "next/navigation";
import { Bell, Briefcase, X } from "lucide-react";
import { Button } from "@/components/ui";
import { cn, money } from "@/lib/utils";
import { LEAD_STAGES, LOST_REASONS } from "@/lib/leads-math";
import { moveLead } from "../actions";

export type BoardCard = {
  id: string;
  stage: string;
  name: string;
  title: string | null;
  value: number | null;
  source: string | null;
  days: number;
  job: number | null;
  owner: string | null;
  followUp: { label: string; overdue: boolean } | null;
};

/**
 * The pipeline: a column per stage, a card per lead. Drag a card to another column to move
 * it (dropped on Lost, it asks why). Moving to Estimate makes it a job.
 */
export function LeadBoard({ cards, lostCount }: { cards: BoardCard[]; lostCount: number }) {
  const router = useRouter();
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [lost, setLost] = useState<string | null>(null);
  const [other, setOther] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, start] = useTransition();
  const [local, setLocal] = useState<Record<string, string>>({});
  const stageOf = (c: BoardCard) => local[c.id] ?? c.stage;

  const move = (id: string, stage: string, reason?: string) =>
    start(async () => {
      setLocal((m) => ({ ...m, [id]: stage }));
      const r = await moveLead(id, stage, reason);
      if (!r.ok) {
        setLocal((m) => {
          const n = { ...m };
          delete n[id];
          return n;
        });
        setMsg({ text: r.error, bad: true });
      } else setMsg(r.note ? { text: r.note } : null);
      router.refresh();
      setLocal((m) => {
        const n = { ...m };
        delete n[id];
        return n;
      });
    });

  const dropOn = (stage: string) => {
    const id = drag;
    setDrag(null);
    setOver(null);
    if (!id) return;
    const card = cards.find((c) => c.id === id);
    if (!card || stageOf(card) === stage) return;
    if (stage === "LOST") {
      setOther("");
      setLost(id);
    } else move(id, stage);
  };
  const zone = (stage: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!drag) return;
      e.preventDefault();
      if (over !== stage) setOver(stage);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o === stage ? null : o));
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      dropOn(stage);
    },
  });
  const lostCard = cards.find((c) => c.id === lost);

  return (
    <div className="space-y-2">
      {/* One line for messages, always there — nothing below jumps. */}
      <p className={cn("min-h-5 text-sm", msg?.bad ? "text-rose-700" : "text-blue-800")}>{busy ? "Moving…" : (msg?.text ?? "")}</p>
      <div className="grid grid-cols-1 gap-3 overflow-x-auto pb-2 md:grid-cols-[repeat(5,minmax(10rem,1fr))_7rem]">
        {LEAD_STAGES.map((s) => {
          const here = cards.filter((c) => stageOf(c) === s.key);
          const total = here.reduce((n, c) => n + (c.value ?? 0), 0);
          return (
            <section
              key={s.key}
              {...zone(s.key)}
              className={cn("flex min-h-[16rem] flex-col rounded-xl border bg-slate-50/80 p-2", over === s.key ? "border-blue-500 ring-1 ring-blue-500" : "border-slate-200")}
              aria-label={s.label}
            >
              <header className="mb-2 flex items-baseline justify-between px-1">
                <h3 className="text-sm font-semibold text-slate-800">
                  {s.label} <span className="font-normal text-slate-500">{here.length}</span>
                </h3>
                {total ? <span className="text-xs tabular-nums text-slate-500">{money(total, true)}</span> : null}
              </header>
              <div className="flex flex-1 flex-col gap-2">
                {here.map((c) => (
                  <article
                    key={c.id}
                    draggable
                    onDragStart={(e) => {
                      setDrag(c.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => (setDrag(null), setOver(null))}
                    className={cn("cursor-grab rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm active:cursor-grabbing", drag === c.id && "opacity-40")}
                  >
                    <Link href={`/leads/${c.id}`} className="block text-sm font-medium text-slate-900 hover:text-blue-700">
                      {c.name}
                    </Link>
                    {c.title ? <p className="truncate text-xs text-slate-600">{c.title}</p> : null}
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                      {c.value ? <span className="font-medium tabular-nums text-slate-700">{money(c.value, true)}</span> : null}
                      {c.source ? <span>{c.source}</span> : null}
                      {c.job ? (
                        <span className="flex items-center gap-0.5">
                          <Briefcase className="h-3 w-3" />#{c.job}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 flex items-center justify-between gap-2 text-xs">
                      {c.followUp ? (
                        <span className={cn("flex items-center gap-1", c.followUp.overdue ? "font-semibold text-rose-700" : "text-slate-600")}>
                          <Bell className="h-3 w-3" /> {c.followUp.label}
                        </span>
                      ) : s.key !== "WON" ? (
                        <span className="text-amber-700">No follow-up</span>
                      ) : (
                        <span />
                      )}
                      <span className="text-slate-400" title="Days in this stage">
                        {c.days}d{c.owner ? ` · ${c.owner}` : ""}
                      </span>
                    </p>
                  </article>
                ))}
                {here.length === 0 ? <p className="px-1 py-6 text-center text-xs text-slate-400">Drag a lead here</p> : null}
              </div>
            </section>
          );
        })}
        <section
          {...zone("LOST")}
          className={cn(
            "flex min-h-[16rem] flex-col items-center justify-center rounded-xl border border-dashed p-2 text-center",
            over === "LOST" ? "border-rose-500 bg-rose-50 ring-1 ring-rose-500" : "border-slate-300",
          )}
          aria-label="Lost"
        >
          <p className="text-sm font-semibold text-slate-700">Lost</p>
          <p className="text-xs text-slate-500">Drop a lead here</p>
          <Link href="/leads?view=list&stage=LOST" className="mt-2 text-xs font-medium text-blue-700 hover:underline">
            {lostCount} lost
          </Link>
        </section>
      </div>

      {lostCard ? (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/20" onClick={() => setLost(null)} aria-hidden />
          <div role="dialog" aria-label="Why was it lost?" className="fixed left-1/2 top-1/3 z-50 w-[22rem] -translate-x-1/2 rounded-xl bg-white p-4 shadow-2xl">
            <div className="mb-2 flex items-start justify-between">
              <p className="text-sm font-semibold text-slate-900">Why did you lose {lostCard.name}?</p>
              <button type="button" onClick={() => setLost(null)} className="rounded p-0.5 text-slate-400 hover:bg-slate-100" aria-label="Cancel">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {LOST_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => (setLost(null), move(lostCard.id, "LOST", r))}
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-rose-100 hover:text-rose-800"
                >
                  {r}
                </button>
              ))}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!other.trim()) return;
                setLost(null);
                move(lostCard.id, "LOST", other.trim());
              }}
            >
              <input value={other} onChange={(e) => setOther(e.target.value)} className="input !h-8 text-sm" placeholder="Or type the reason" aria-label="Other reason" />
              <Button type="submit" size="sm" variant="danger">
                Lost
              </Button>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}
