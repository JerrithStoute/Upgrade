"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Paperclip, Upload, X } from "lucide-react";
import { cn, dateInput, fmtDate } from "@/lib/utils";
import { addVendorDoc, confirmVendorDoc, deleteVendorDoc, setVendorDocDate, setVendorNeeds } from "@/app/(app)/(directory)/vendors/actions";
import type { LineStatus } from "@/lib/paperwork";

export type PaperLineView = {
  typeId: string;
  name: string;
  expires: boolean;
  needed: boolean;
  status: LineStatus;
  expiresAt: string | null;
  daysOpen: number;
  daysLeft: number | null;
  docs: { id: string; fileName: string | null; hasFile: boolean; expiresAt: string | null; expired: boolean; confirmed: boolean }[];
};

const PILL: Record<LineStatus, string> = {
  ok: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  soon: "bg-amber-50 text-amber-800 ring-amber-200",
  noDate: "bg-amber-50 text-amber-800 ring-amber-200",
  missing: "bg-rose-50 text-rose-800 ring-rose-200",
  expired: "bg-rose-50 text-rose-800 ring-rose-200",
  notNeeded: "bg-slate-50 text-slate-500 ring-slate-200",
};

function pillText(l: PaperLineView) {
  const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  switch (l.status) {
    case "ok":
      return l.expires && l.expiresAt ? `Good till ${fmtDate(l.expiresAt, "MMM d, yyyy")}` : "On file";
    case "soon":
      return l.daysLeft === 0 ? "Expires today" : `${days(l.daysLeft ?? 0)} left`;
    case "expired":
      return `Expired ${fmtDate(l.expiresAt, "MMM d")}`;
    case "missing":
      return l.daysOpen ? `Missing · ${days(l.daysOpen)}` : "Missing";
    case "noDate":
      return "Add the expiry date";
    default:
      return "Not needed";
  }
}

/**
 * A vendor's paperwork, one line per kind: drag a file onto its line (or click Add file). A kind that expires
 * asks for one thing more — the date — right on the line. "What they need" ticks which kinds count for this vendor.
 */
export function PaperworkList({ vendorId, lines, allTypes, canEdit }: { vendorId: string; lines: PaperLineView[]; allTypes: { id: string; name: string }[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [ticked, setTicked] = useState(() => new Set(lines.filter((l) => l.needed).map((l) => l.typeId)));
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const shown = lines.filter((l) => l.needed || l.docs.length);

  const run = (f: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      setError(null);
      const r = await f();
      if (!r.ok) setError(r.error);
      else router.refresh();
    });

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-slate-900">Paperwork</h2>
        {canEdit ? (
          editing ? (
            <span className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={() =>
                  run(async () => {
                    const r = await setVendorNeeds({ vendorId, typeIds: [...ticked] });
                    if (r.ok) setEditing(false);
                    return r;
                  })
                }
              >
                {busy ? "Saving…" : "Save"}
              </button>
              <button type="button" className="text-xs text-slate-500 hover:text-slate-800" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" className="text-xs font-medium text-blue-700 hover:underline" onClick={() => setEditing(true)}>
              What they need
            </button>
          )
        ) : null}
      </header>

      {editing ? (
        <div className="space-y-2 px-4 py-3">
          <p className="text-xs text-slate-500">Tick what you need from this vendor. Nothing ticked (a one-time small job) — nothing about them is ever flagged.</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {allTypes.map((t) => (
              <label key={t.id} className="flex items-center gap-1.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={ticked.has(t.id)}
                  onChange={(e) =>
                    setTicked((cur) => {
                      const next = new Set(cur);
                      if (e.target.checked) next.add(t.id);
                      else next.delete(t.id);
                      return next;
                    })
                  }
                />
                {t.name}
              </label>
            ))}
          </div>
        </div>
      ) : shown.length === 0 ? (
        <p className="px-4 py-3 text-sm text-slate-500">Nothing needed from this vendor.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {shown.map((l) => (
            <PaperRow key={l.typeId} vendorId={vendorId} line={l} canEdit={canEdit} busy={busy} run={run} />
          ))}
        </ul>
      )}
      {error ? <p className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</p> : null}
    </section>
  );
}

function PaperRow({
  vendorId,
  line: l,
  canEdit,
  busy,
  run,
}: {
  vendorId: string;
  line: PaperLineView;
  canEdit: boolean;
  busy: boolean;
  run: (f: () => Promise<{ ok: true } | { ok: false; error: string }>) => void;
}) {
  const [over, setOver] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const add = (file: File | undefined) => {
    if (!file || !canEdit) return;
    const fd = new FormData();
    fd.set("vendorId", vendorId);
    fd.set("typeId", l.typeId);
    fd.set("file", file);
    run(() => addVendorDoc(fd));
  };

  return (
    <li
      className={cn(
        // Phone: name and where it stands on top, the files under. Wider: name · files · where it stands.
        "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1.5 px-4 py-2.5 text-sm sm:grid-cols-[10rem_minmax(0,1fr)_auto]",
        over && "bg-blue-50 ring-2 ring-inset ring-blue-300",
        !l.needed && "opacity-70",
      )}
      onDragOver={(e) => {
        if (!canEdit || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        add(e.dataTransfer.files[0]);
      }}
    >
      <span className="pt-0.5 font-medium text-slate-900">{l.name}</span>
      <div className="col-span-2 min-w-0 space-y-1 sm:order-none sm:col-span-1 max-sm:order-last">
        {l.docs.map((d) => (
          <div key={d.id} className={cn("flex flex-wrap items-center gap-2", d.expired && "text-slate-400 line-through decoration-slate-300")}>
            {d.hasFile ? (
              <a href={`/api/vendor-files/${d.id}`} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 text-blue-700 hover:underline">
                <FileText className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{d.fileName ?? "Open"}</span>
              </a>
            ) : (
              <span className="text-slate-500">(no file)</span>
            )}
            {l.expires ? (
              canEdit ? (
                <label className={cn("inline-flex items-center gap-1 text-xs", d.expiresAt ? "text-slate-500" : "font-medium text-amber-800")}>
                  {d.expiresAt ? "expires" : "When does it expire?"}
                  <input
                    type="date"
                    aria-label={`${l.name} expires`}
                    className={cn("input !h-7 !w-auto !px-1.5 !py-0 text-xs", !d.expiresAt && "!border-amber-400 !bg-amber-50")}
                    defaultValue={dateInput(d.expiresAt)}
                    autoFocus={!d.expiresAt}
                    onBlur={(e) => {
                      const v = e.currentTarget.value;
                      if (v && v !== dateInput(d.expiresAt)) run(() => setVendorDocDate({ id: d.id, expiresAt: v }));
                    }}
                  />
                </label>
              ) : d.expiresAt ? (
                <span className="text-xs text-slate-500">expires {fmtDate(d.expiresAt)}</span>
              ) : null
            ) : null}
            {d.expired ? <span className="text-xs no-underline">expired</span> : null}
            {!d.confirmed ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-800 ring-1 ring-sky-200">
                They sent it — look it over
                {canEdit ? (
                  <button type="button" disabled={busy} className="font-semibold text-sky-900 hover:underline" onClick={() => run(() => confirmVendorDoc({ id: d.id }))}>
                    <Check className="inline h-3 w-3" /> It&apos;s good
                  </button>
                ) : null}
              </span>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                disabled={busy}
                aria-label={`Take ${d.fileName ?? "this file"} off`}
                className="rounded p-0.5 text-slate-400 hover:text-rose-600"
                onClick={() => {
                  if (window.confirm(`Take ${d.fileName ?? "this file"} off ${l.name}?`)) run(() => deleteVendorDoc({ id: d.id }));
                }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ))}
        {canEdit ? (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <button type="button" disabled={busy} className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline disabled:opacity-50" onClick={() => pick.current?.click()}>
              {l.docs.length ? <Paperclip className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />} {l.docs.length ? "Add another" : "Add file"}
            </button>
            <span className="hidden sm:inline">or drag it onto this line</span>
            <input
              ref={pick}
              type="file"
              accept=".pdf,image/*,.doc,.docx"
              className="hidden"
              aria-label={`Add a file to ${l.name}`}
              onChange={(e) => {
                add(e.currentTarget.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
          </div>
        ) : null}
      </div>
      <span className={cn("justify-self-end whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1", PILL[l.status])}>{pillText(l)}</span>
    </li>
  );
}
