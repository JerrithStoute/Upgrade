"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/link";
import { Pencil } from "lucide-react";
import { PROJECT_STATUSES } from "@/lib/constants";
import { dateInput, fmtDate, titleCase } from "@/lib/utils";
import { ClientPick } from "@/components/client-pick";
import { saveJobDetails } from "@/app/(app)/projects/actions";

export type JobDetailsValues = {
  id: string;
  name: string;
  type: string;
  isSpec: boolean;
  status: string;
  clientId: string | null;
  managerId: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  startDate: Date | null;
  actualEndDate: Date | null;
  description: string | null;
};

type Kind = "SPEC" | "CUSTOM" | "REMODEL" | "OTHER";
const KIND_LABEL: Record<Kind, string> = { SPEC: "Spec home", CUSTOM: "Custom home", REMODEL: "Remodel", OTHER: "" };
const kindOf = (j: { isSpec: boolean; type: string }): Kind => (j.isSpec ? "SPEC" : j.type === "NEW_HOME" ? "CUSTOM" : j.type === "REMODEL" ? "REMODEL" : "OTHER");

const box = "input !h-8 !py-0 text-sm";

/**
 * A job's details on its Overview — and, with Edit, the same box as fields: saved right here, you stay on the job.
 * (An addition or commercial job keeps its type unless you pick another kind.)
 */
export function JobDetails({
  job: j,
  client,
  clients,
  managers,
  teamIds,
  startEditing,
}: {
  job: JobDetailsValues;
  client: { id: string; name: string; company: string | null; phone: string | null; email: string | null } | null;
  clients: { id: string; label: string }[];
  managers: { id: string; name: string }[];
  teamIds: string[];
  startEditing?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!!startEditing);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [kind, setKind] = useState<Kind>(kindOf(j));
  const [status, setStatus] = useState(j.status);
  const was = kindOf(j);
  const kindLabel = KIND_LABEL[was] || titleCase(j.type);
  const typeFor = (k: Kind) => (k === "OTHER" ? j.type : k === "REMODEL" ? "REMODEL" : "NEW_HOME");
  const address = [j.address, [[j.city, j.state].filter(Boolean).join(", "), j.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const manager = managers.find((m) => m.id === j.managerId)?.name;
  const team = managers.filter((m) => teamIds.includes(m.id)).map((m) => m.name.split(" ")[0]);

  const row = (name: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 border-t border-slate-100 py-1.5 text-sm first:border-t-0">
      <span className="text-slate-500">{name}</span>
      <span className="min-w-0 break-words text-slate-900">{value || <span className="text-slate-300">—</span>}</span>
    </div>
  );
  const field = (name: string, children: React.ReactNode) => (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 border-t border-slate-100 py-1 text-sm first:border-t-0">
      <span className="text-slate-500">{name}</span>
      {children}
    </div>
  );
  const close = () => {
    setError(null);
    setKind(kindOf(j));
    setStatus(j.status);
    setEditing(false);
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-slate-900">Details</h2>
        {!editing ? (
          <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline" onClick={() => setEditing(true)}>
            <Pencil className="h-3 w-3" /> Edit
          </button>
        ) : null}
      </header>
      {editing ? (
        <form
          className="px-4 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("id", j.id);
            start(async () => {
              setError(null);
              const r = await saveJobDetails(fd);
              if (!r.ok) return setError(r.error);
              setEditing(false);
              // Opened from an old Edit link (?edit=1): saved, so a reload shouldn't open the fields again.
              if (window.location.search.includes("edit=1")) router.replace(window.location.pathname);
              else router.refresh();
            });
          }}
        >
          <input type="hidden" name="type" value={typeFor(kind)} />
          <input type="hidden" name="isSpec" value={kind === "SPEC" ? "on" : ""} />
          {field("Job name", <input name="name" required defaultValue={j.name} aria-label="Job name" className={box} />)}
          {field(
            "Kind",
            <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="Kind of job" className={box}>
              <option value="SPEC">Spec home</option>
              <option value="CUSTOM">Custom home</option>
              <option value="REMODEL">Remodel</option>
              {was === "OTHER" ? <option value="OTHER">{titleCase(j.type)}</option> : null}
            </select>,
          )}
          {field(
            "Status",
            <select name="status" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className={box}>
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </select>,
          )}
          {field(
            "Client",
            <span className="[&_select]:!h-8 [&_select]:!py-0 [&_select]:text-sm">
              <ClientPick id={`job-${j.id}-client`} clients={clients} defaultValue={j.clientId} />
            </span>,
          )}
          {field(
            "Manager",
            <select name="managerId" defaultValue={j.managerId ?? ""} aria-label="Project manager" className={box}>
              <option value="">— Unassigned —</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>,
          )}
          <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 border-t border-slate-100 py-1.5 text-sm">
            <span className="text-slate-500">Team</span>
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              {managers.map((m) => (
                <label key={m.id} className="flex items-center gap-1.5 text-slate-700">
                  <input type="checkbox" name="teamIds" value={m.id} defaultChecked={teamIds.includes(m.id)} className="h-3.5 w-3.5 rounded border-slate-300" />
                  {m.name}
                </label>
              ))}
            </span>
          </div>
          {field("Street", <input name="address" defaultValue={j.address ?? ""} aria-label="Street" className={box} />)}
          {field(
            "City, state, ZIP",
            <span className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-1.5 [&>*:first-child]:col-span-2 sm:grid-cols-[minmax(0,1fr)_3.5rem_5.5rem] sm:[&>*:first-child]:col-span-1">
              <input name="city" defaultValue={j.city ?? ""} placeholder="City" aria-label="City" className={box} />
              <input name="state" defaultValue={j.state ?? ""} placeholder="ST" maxLength={2} aria-label="State" className={box} />
              <input name="zip" defaultValue={j.zip ?? ""} placeholder="ZIP" aria-label="ZIP" className={box} />
            </span>,
          )}
          {field("Start", <input name="startDate" type="date" defaultValue={dateInput(j.startDate)} aria-label="Start date" className={`${box} !w-40`} />)}
          {status === "COMPLETED" || j.actualEndDate
            ? field("Completed", <input name="actualEndDate" type="date" defaultValue={dateInput(j.actualEndDate)} aria-label="Completed on" className={`${box} !w-40`} />)
            : null}
          <label className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 border-t border-slate-100 py-1 text-sm">
            <span className="pt-1 text-slate-500">Description</span>
            <textarea name="description" rows={2} defaultValue={j.description ?? ""} className="input text-sm" />
          </label>
          {error ? (
            <p role="alert" className="py-1 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
          <div className="flex gap-1.5 border-t border-slate-100 pt-2">
            <button type="submit" disabled={busy} className="inline-flex h-7 items-center rounded-md bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" className="inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50" onClick={close}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="px-4 py-2">
          {row("Kind", kindLabel)}
          {row("Status", titleCase(j.status))}
          {row(
            "Client",
            client ? (
              <>
                <Link href={`/clients/${client.id}`} className="font-medium text-blue-700 hover:underline">
                  {client.name}
                </Link>
                {client.company ? <span className="text-slate-500"> · {client.company}</span> : null}
                {client.phone || client.email ? <span className="block text-xs text-slate-500">{[client.phone, client.email].filter(Boolean).join(" · ")}</span> : null}
              </>
            ) : j.isSpec ? (
              <span className="text-slate-500">None — a spec home</span>
            ) : null,
          )}
          {row("Manager", manager ?? "Unassigned")}
          {row("Team", team.join(", "))}
          {row("Address", address)}
          {row("Start", j.startDate ? fmtDate(j.startDate) : null)}
          {j.actualEndDate ? row("Completed", fmtDate(j.actualEndDate)) : null}
          {row("Description", j.description ? <span className="whitespace-pre-line">{j.description}</span> : null)}
        </div>
      )}
    </section>
  );
}
