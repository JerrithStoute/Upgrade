"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Pencil, Plus, Upload, X } from "lucide-react";
import { cn, dateInput, fmtDate } from "@/lib/utils";
import { addPaperKindFor, addVendorDoc, confirmVendorDoc, deleteVendorDoc, setVendorNeed, updateVendorDoc } from "@/app/(app)/(directory)/vendors/actions";
import type { LineStatus } from "@/lib/paperwork";

export type PaperDocView = {
  id: string;
  fileName: string | null;
  hasFile: boolean;
  expiresAt: string | null;
  carrier: string | null;
  number: string | null;
  expired: boolean;
  confirmed: boolean;
};
export type PaperLineView = {
  typeId: string;
  name: string;
  kind: string | null;
  expires: boolean;
  needed: boolean;
  status: LineStatus;
  expiresAt: string | null;
  daysOpen: number;
  daysLeft: number | null;
  docs: PaperDocView[];
};
type Result = { ok: true } | { ok: false; error: string };
type Run = (f: () => Promise<Result>, after?: () => void) => void;

const PILL: Record<LineStatus, string> = {
  ok: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  soon: "bg-amber-50 text-amber-800 ring-amber-200",
  noDate: "bg-amber-50 text-amber-800 ring-amber-200",
  missing: "bg-rose-50 text-rose-800 ring-rose-200",
  expired: "bg-rose-50 text-rose-800 ring-rose-200",
  notNeeded: "bg-slate-50 text-slate-500 ring-slate-200",
};
const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

function pillText(l: PaperLineView) {
  if (!l.needed && l.status !== "ok" && l.status !== "soon") return "Not needed";
  switch (l.status) {
    case "ok":
      return l.expires && l.expiresAt ? `Good till ${fmtDate(l.expiresAt, "MMM d, yyyy")}` : "On file";
    case "soon":
      return l.daysLeft === 0 ? "Runs out today" : `${days(l.daysLeft ?? 0)} left`;
    case "expired":
      return `Expired ${fmtDate(l.expiresAt, "MMM d")}${l.daysOpen ? ` · ${days(l.daysOpen)}` : ""}`;
    case "missing":
      return l.daysOpen ? `Missing · ${days(l.daysOpen)}` : "Missing";
    case "noDate":
      return "Add its expiry date";
    default:
      return "Not needed";
  }
}

const btn = "inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium disabled:opacity-50";
const primary = cn(btn, "bg-blue-600 text-white hover:bg-blue-700");
const plain = cn(btn, "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50");
const box = "input !h-7 !px-2 !py-0 text-xs";

/**
 * A vendor's paperwork: one line per kind (the W-9, your own kinds) and, under Insurance, one per coverage. Each line
 * has "Need it" — what you need differs from sub to sub. A file goes on a line by dropping it there (or Add); a policy
 * or anything that expires gets its number (and carrier) and date typed in, and one certificate can be on several
 * lines. New kinds and coverages can be added right here.
 */
export function PaperworkList({ vendorId, lines, canEdit }: { vendorId: string; lines: PaperLineView[]; canEdit: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const run: Run = (f, after) =>
    start(async () => {
      setError(null);
      const r = await f();
      if (!r.ok) setError(r.error);
      else {
        after?.();
        router.refresh();
      }
    });
  const files = lines.flatMap((l) => l.docs.filter((d) => d.hasFile).map((d) => ({ id: d.id, name: d.fileName ?? "file" })));
  // One certificate on several lines: offered once, by name.
  const sameFiles = files.filter((f, i) => files.findIndex((g) => g.name === f.name) === i);
  const papers = lines.filter((l) => l.kind !== "INSURANCE");
  const coverages = lines.filter((l) => l.kind === "INSURANCE");
  const props = { vendorId, canEdit, busy, run, sameFiles };

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-slate-900">Paperwork</h2>
      </header>
      <ul className="divide-y divide-slate-100">
        {papers.map((l) => (
          <PaperRow key={l.typeId} line={l} {...props} />
        ))}
      </ul>
      {canEdit ? <AddKind vendorId={vendorId} coverage={false} busy={busy} run={run} /> : null}

      <div className="border-t border-slate-200 bg-slate-50/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Insurance</div>
      <ul className="divide-y divide-slate-100">
        {coverages.map((l) => (
          <PaperRow key={l.typeId} line={l} {...props} />
        ))}
      </ul>
      {canEdit ? <AddKind vendorId={vendorId} coverage busy={busy} run={run} /> : null}
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
  sameFiles,
}: {
  vendorId: string;
  line: PaperLineView;
  canEdit: boolean;
  busy: boolean;
  run: Run;
  sameFiles: { id: string; name: string }[];
}) {
  const [over, setOver] = useState(false);
  const [adding, setAdding] = useState<{ file: File | null } | null>(null);
  // "Need it" changes the moment it's clicked; the page catches up when it's saved.
  const [need, setNeed] = useState(l.needed);
  const [saved, setSaved] = useState(l.needed);
  if (saved !== l.needed) {
    setSaved(l.needed);
    setNeed(l.needed);
  }
  const pick = useRef<HTMLInputElement>(null);
  const coverage = l.kind === "INSURANCE";

  /** A file for this line: one that only needs the file goes on now; one with a date opens the boxes to type. */
  const got = (file: File | undefined) => {
    if (!file || !canEdit) return;
    if (l.expires) return setAdding({ file });
    const fd = new FormData();
    fd.set("vendorId", vendorId);
    fd.set("typeId", l.typeId);
    fd.set("file", file);
    run(() => addVendorDoc(fd));
  };

  return (
    <li
      className={cn("px-4 py-2 text-sm", over && "bg-blue-50 ring-2 ring-inset ring-blue-300")}
      onDragOver={(e) => {
        if (!canEdit || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        got(e.dataTransfer.files[0]);
      }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={cn("min-w-0 flex-1 font-medium", l.needed ? "text-slate-900" : "text-slate-400")}>{l.name}</span>
        <span className={cn("whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1", PILL[l.needed ? l.status : l.status === "ok" || l.status === "soon" ? l.status : "notNeeded"])}>
          {pillText(l)}
        </span>
        <label className={cn("flex items-center gap-1 whitespace-nowrap text-xs", canEdit ? "text-slate-600" : "text-slate-400")}>
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-slate-300"
            checked={need}
            disabled={!canEdit}
            onChange={(e) => {
              const on = e.target.checked;
              setNeed(on);
              run(() => setVendorNeed({ vendorId, typeId: l.typeId, on }));
            }}
          />
          Need it
        </label>
      </div>

      {l.docs.length ? (
        <div className="mt-1 space-y-1">
          {l.docs.map((d) => (
            <DocLine key={d.id} doc={d} line={l} canEdit={canEdit} busy={busy} run={run} />
          ))}
        </div>
      ) : null}

      {adding ? (
        <NewPaper vendorId={vendorId} line={l} file={adding.file} sameFiles={sameFiles} busy={busy} run={run} close={() => setAdding(null)} />
      ) : canEdit && (l.needed || l.docs.length) ? (
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
          <button
            type="button"
            disabled={busy}
            className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline disabled:opacity-50"
            onClick={() => (l.expires ? setAdding({ file: null }) : pick.current?.click())}
          >
            {l.expires ? <Plus className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
            {coverage ? (l.docs.length ? "Add a renewal" : "Add the policy") : l.docs.length ? "Add another" : l.expires ? "Add it" : "Add file"}
          </button>
          <span className="hidden sm:inline">or drop the file on this line</span>
          <input
            ref={pick}
            type="file"
            accept=".pdf,image/*,.doc,.docx"
            className="hidden"
            aria-label={`Add a file to ${l.name}`}
            onChange={(e) => {
              got(e.currentTarget.files?.[0]);
              e.currentTarget.value = "";
            }}
          />
        </div>
      ) : null}
    </li>
  );
}

/** One paper on a line: its file, what's typed for it (carrier · policy # · expires), and a pencil to fix that. */
function DocLine({ doc: d, line: l, canEdit, busy, run }: { doc: PaperDocView; line: PaperLineView; canEdit: boolean; busy: boolean; run: Run }) {
  const [editing, setEditing] = useState(false);
  const coverage = l.kind === "INSURANCE";
  if (editing)
    return (
      <form
        className="flex flex-wrap items-center gap-1.5 rounded-md bg-slate-50 p-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          fd.set("id", d.id);
          run(() => updateVendorDoc(fd), () => setEditing(false));
        }}
      >
        <TypedBoxes line={l} doc={d} />
        <button type="submit" disabled={busy} className={primary}>
          Save
        </button>
        <button type="button" className={plain} onClick={() => setEditing(false)}>
          Cancel
        </button>
      </form>
    );
  const typed = [coverage ? d.carrier : null, d.number ? (coverage ? `Policy ${d.number}` : `No. ${d.number}`) : null, d.expiresAt ? `expires ${fmtDate(d.expiresAt, "MMM d, yyyy")}` : null].filter(Boolean);
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs", d.expired ? "text-slate-400" : "text-slate-600")}>
      {d.hasFile ? (
        <a href={`/api/vendor-files/${d.id}`} target="_blank" rel="noreferrer" className="inline-flex min-w-0 max-w-56 items-center gap-1 text-blue-700 hover:underline">
          <FileText className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{d.fileName ?? "Open"}</span>
        </a>
      ) : (
        <span className="text-slate-400">(no file)</span>
      )}
      {typed.length ? <span className={cn(d.expired && "line-through")}>{typed.join(" · ")}</span> : null}
      {l.expires && !d.expiresAt ? <span className="font-medium text-amber-700">no expiry date yet</span> : null}
      {d.expired ? <span>(expired)</span> : null}
      {!d.confirmed ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-sky-800 ring-1 ring-sky-200">
          They sent it — look it over
          {canEdit ? (
            <button type="button" disabled={busy} className="font-semibold text-sky-900 hover:underline" onClick={() => run(() => confirmVendorDoc({ id: d.id }))}>
              <Check className="inline h-3 w-3" /> It&apos;s good
            </button>
          ) : null}
        </span>
      ) : null}
      {canEdit ? (
        <>
          {l.expires || d.number ? (
            <button type="button" aria-label={`Change ${l.name}'s details`} className="rounded p-0.5 text-slate-400 hover:text-blue-700" onClick={() => setEditing(true)}>
              <Pencil className="h-3 w-3" />
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            aria-label={`Take ${d.fileName ?? "this"} off ${l.name}`}
            className="rounded p-0.5 text-slate-400 hover:text-rose-600"
            onClick={() => {
              if (window.confirm(`Take ${d.fileName ?? "this"} off ${l.name}?`)) run(() => deleteVendorDoc({ id: d.id }));
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : null}
    </div>
  );
}

/** The boxes typed for a paper that expires: a policy's carrier and policy #, or a license's number — and the date. */
function TypedBoxes({ line: l, doc }: { line: PaperLineView; doc?: PaperDocView }) {
  const coverage = l.kind === "INSURANCE";
  return (
    <>
      {coverage ? <input name="carrier" defaultValue={doc?.carrier ?? ""} placeholder="Carrier" aria-label="Carrier" className={cn(box, "!w-32")} /> : null}
      <input name="number" defaultValue={doc?.number ?? ""} placeholder={coverage ? "Policy #" : "Number"} aria-label={coverage ? "Policy number" : "Number"} className={cn(box, "!w-28")} />
      {l.expires ? (
        <label className="inline-flex items-center gap-1 text-xs text-slate-500">
          Expires
          <input name="expiresAt" type="date" defaultValue={dateInput(doc?.expiresAt)} aria-label={`${l.name} expires`} className={cn(box, "!w-auto")} />
        </label>
      ) : null}
    </>
  );
}

/** Adding a paper that expires: its typed boxes, and the file — dropped, picked, or one already on this vendor. */
function NewPaper({
  vendorId,
  line: l,
  file: dropped,
  sameFiles,
  busy,
  run,
  close,
}: {
  vendorId: string;
  line: PaperLineView;
  file: File | null;
  sameFiles: { id: string; name: string }[];
  busy: boolean;
  run: Run;
  close: () => void;
}) {
  const [file, setFile] = useState<File | null>(dropped);
  return (
    <form
      className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-md bg-slate-50 p-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("vendorId", vendorId);
        fd.set("typeId", l.typeId);
        if (file) fd.set("file", file);
        else fd.delete("file");
        run(() => addVendorDoc(fd), close);
      }}
    >
      <TypedBoxes line={l} />
      {file ? (
        <span className="inline-flex items-center gap-1 text-xs text-slate-700">
          <FileText className="h-3.5 w-3.5 text-slate-400" /> <span className="max-w-40 truncate">{file.name}</span>
          <button type="button" aria-label="Not this file" className="text-slate-400 hover:text-rose-600" onClick={() => setFile(null)}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ) : (
        <>
          <input type="file" accept=".pdf,image/*,.doc,.docx" aria-label="Certificate or file" className="max-w-44 text-xs" onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)} />
          {sameFiles.length ? (
            <select name="sameAs" aria-label="Or a file already on this vendor" className={cn(box, "!w-auto")} defaultValue="">
              <option value="">or a file already here…</option>
              {sameFiles.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          ) : null}
        </>
      )}
      <button type="submit" disabled={busy} className={primary}>
        {busy ? "Saving…" : "Save"}
      </button>
      <button type="button" className={plain} onClick={close}>
        Cancel
      </button>
    </form>
  );
}

/** "+ Add paperwork" / "+ Add a coverage": a new kind on your list, needed from this vendor. */
function AddKind({ vendorId, coverage, busy, run }: { vendorId: string; coverage: boolean; busy: boolean; run: Run }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [expires, setExpires] = useState(false);
  const [usual, setUsual] = useState(false);
  const add = () =>
    run(
      () => addPaperKindFor({ vendorId, name, expires, usual, coverage }),
      () => {
        setOpen(false);
        setName("");
        setExpires(false);
        setUsual(false);
      },
    );
  if (!open)
    return (
      <div className="border-t border-slate-100 px-4 py-2">
        <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> {coverage ? "Add a coverage" : "Add paperwork"}
        </button>
      </div>
    );
  return (
    <div className="space-y-1.5 border-t border-slate-100 px-4 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder={coverage ? "Builder's risk" : "Contractor agreement"}
          aria-label={coverage ? "New coverage" : "New kind of paperwork"}
          maxLength={60}
          className={cn(box, "!w-56")}
        />
        <button type="button" disabled={busy || !name.trim()} className={primary} onClick={add}>
          Add
        </button>
        <button type="button" className={plain} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {coverage ? null : (
          <label className="flex items-center gap-1">
            <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300" checked={expires} onChange={(e) => setExpires(e.target.checked)} /> Has an expiry date
          </label>
        )}
        <label className="flex items-center gap-1">
          <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300" checked={usual} onChange={(e) => setUsual(e.target.checked)} /> Ask every new sub
        </label>
      </div>
    </div>
  );
}
