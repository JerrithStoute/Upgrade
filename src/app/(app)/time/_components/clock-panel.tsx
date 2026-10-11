"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, LogIn, LogOut } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { fmtClock } from "@/lib/time-math";
import { cn } from "@/lib/utils";
import { clockInAction, clockOutAction } from "../actions";

export type Job = { id: string; label: string; group: string };
export type Code = { id: string; label: string; division: string };

/**
 * The time clock: one big button. Off the clock — pick the job (and what you're doing on it)
 * and Clock in. On the clock — the running time, Clock out, or Switch to another job / task.
 */
export function ClockPanel({
  open,
  jobs,
  codes,
  jobCodes,
  lastCode,
}: {
  open: { projectId: string; job: string; code: string | null; since: string } | null;
  jobs: Job[];
  codes: Code[];
  jobCodes: Record<string, string[]>;
  lastCode: Record<string, string>;
}) {
  const [switching, setSwitching] = useState(false);
  const picking = !open || switching;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {open ? (
        <div className={cn("px-5 py-5 text-center", switching ? "border-b border-slate-100" : "")}>
          <p className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden /> On the clock
          </p>
          <Running since={open.since} />
          <p className="mt-1 font-medium text-slate-900">{open.job}</p>
          <p className="text-sm text-slate-500">{open.code ?? "No cost code"}</p>
          {!switching ? (
            <div className="mt-5 grid gap-2">
              <form action={clockOutAction}>
                <SubmitButton pendingText="Clocking out…" className="h-14 w-full bg-rose-600 text-base hover:bg-rose-700">
                  <LogOut className="h-5 w-5" /> Clock out
                </SubmitButton>
              </form>
              <button
                type="button"
                onClick={() => setSwitching(true)}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeftRight className="h-4 w-4" /> Switch job or task
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {picking ? (
        <Picker
          key={open ? "switch" : "in"}
          switching={!!open}
          startJob={open?.projectId ?? jobs[0]?.id ?? ""}
          jobs={jobs}
          codes={codes}
          jobCodes={jobCodes}
          lastCode={lastCode}
          onCancel={open ? () => setSwitching(false) : undefined}
        />
      ) : null}
    </div>
  );
}

function Running({ since }: { since: string }) {
  const start = new Date(since).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <p className="mt-2 text-5xl font-semibold tabular-nums tracking-tight text-slate-900" suppressHydrationWarning>
      {fmtClock(now - start)}
    </p>
  );
}

function Picker({
  switching,
  startJob,
  jobs,
  codes,
  jobCodes,
  lastCode,
  onCancel,
}: {
  switching: boolean;
  startJob: string;
  jobs: Job[];
  codes: Code[];
  jobCodes: Record<string, string[]>;
  lastCode: Record<string, string>;
  onCancel?: () => void;
}) {
  const [job, setJob] = useState(startJob);
  const [code, setCode] = useState(lastCode[startJob] ?? "");
  const onJob = jobCodes[job] ?? [];
  const groups = [...new Set(jobs.map((j) => j.group))];
  const divisions = [...new Set(codes.map((c) => c.division))];

  if (!jobs.length) return <p className="px-5 py-6 text-center text-sm text-slate-500">No jobs to clock in to yet — add a project first.</p>;

  return (
    <form action={clockInAction} className="space-y-4 px-5 py-5">
      {switching ? <p className="text-sm font-medium text-slate-900">Switch to</p> : null}
      <label className="block">
        <span className="label">Job</span>
        <select
          name="projectId"
          className="input h-12"
          value={job}
          onChange={(e) => {
            setJob(e.target.value);
            setCode(lastCode[e.target.value] ?? "");
          }}
          required
        >
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {jobs
                .filter((j) => j.group === g)
                .map((j) => (
                  <option key={`${g}-${j.id}`} value={j.id}>
                    {j.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">Working on (cost code)</span>
        <select name="costCodeId" className="input h-12" value={code} onChange={(e) => setCode(e.target.value)}>
          <option value="">— No cost code —</option>
          {onJob.length ? (
            <optgroup label="On this job's estimate">
              {onJob.map((id) => {
                const c = codes.find((x) => x.id === id);
                return c ? (
                  <option key={`job-${id}`} value={id}>
                    {c.label}
                  </option>
                ) : null;
              })}
            </optgroup>
          ) : null}
          {divisions.map((d) => (
            <optgroup key={d} label={d}>
              {codes
                .filter((c) => c.division === d && !onJob.includes(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">Note (optional)</span>
        <input name="notes" className="input" placeholder="e.g. Punch list, upstairs" />
      </label>
      <SubmitButton pendingText={switching ? "Switching…" : "Clocking in…"} className="h-14 w-full bg-emerald-600 text-base hover:bg-emerald-700">
        {switching ? <ArrowLeftRight className="h-5 w-5" /> : <LogIn className="h-5 w-5" />} {switching ? "Switch" : "Clock in"}
      </SubmitButton>
      {onCancel ? (
        <button type="button" onClick={onCancel} className="block w-full py-1 text-center text-sm text-slate-500 hover:text-slate-800">
          Cancel
        </button>
      ) : null}
    </form>
  );
}
