"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Pencil, Phone } from "lucide-react";
import { cn, money } from "@/lib/utils";
import { AREAS, JOBS_LABEL, SWITCHES, withCostRule, type Access } from "@/lib/access";
import { AccessFields } from "@/components/settings/access-fields";
import { saveMemberAccess, saveMemberInfo } from "@/app/(app)/(directory)/team/actions";

const btn = "inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium disabled:opacity-50";
const primary = cn(btn, "bg-blue-600 text-white hover:bg-blue-700");
const plain = cn(btn, "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50");
const box = "input !h-8 !py-0 text-sm";
const card = "rounded-xl border border-slate-200 bg-white shadow-sm";
const head = "flex items-center justify-between border-b border-slate-100 px-4 py-2.5";

export type MemberValues = {
  id: string;
  name: string;
  title: string | null;
  phone: string | null;
  email: string | null;
  role: string;
  positionId: string | null;
  vacationDays: number | null;
  vacationUsed: number | null;
  /** Only ever sent for an admin looking. */
  pay?: { rate: number | null; salaried: boolean };
};

function useSave() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const save = (f: () => Promise<{ ok: true } | { ok: false; error: string }>, done: () => void) =>
    start(async () => {
      setError(null);
      const r = await f();
      if (!r.ok) return setError(r.error);
      done();
      router.refresh();
    });
  return { error, busy, save, setError };
}

const Row = ({ name, children }: { name: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 border-t border-slate-100 py-1.5 text-sm first:border-t-0">
    <span className="text-slate-500">{name}</span>
    <span className="min-w-0 break-words text-slate-900">{children || <span className="text-slate-300">—</span>}</span>
  </div>
);

/** A person's info — with Edit, the same card as fields, saved right here. */
export function MemberInfo({
  member: m,
  positions,
  canEdit,
  isSelf,
}: {
  member: MemberValues;
  positions: { id: string; name: string }[];
  canEdit: boolean;
  isSelf: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const { error, busy, save, setError } = useSave();
  const positionName = m.role === "ADMIN" ? "Admin" : m.role === "SUB" ? "No sign-in (crew)" : (positions.find((p) => p.id === m.positionId)?.name ?? "Staff");
  const field = (label: string, name: string, value: string | number | null | undefined, opts: { type?: string; placeholder?: string; step?: string } = {}) => (
    <label className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 border-t border-slate-100 py-1 text-sm first:border-t-0">
      <span className="text-slate-500">{label}</span>
      <input name={name} type={opts.type ?? "text"} step={opts.step} defaultValue={value ?? ""} placeholder={opts.placeholder} className={box} required={name === "name"} />
    </label>
  );

  return (
    <section className={card}>
      <header className={head}>
        <h2 className="text-sm font-semibold text-slate-900">Info</h2>
        {canEdit && !editing ? (
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
            fd.set("id", m.id);
            save(() => saveMemberInfo(fd), () => setEditing(false));
          }}
        >
          {field("Name", "name", m.name)}
          {field("Title", "title", m.title, { placeholder: "Office manager, Framer…" })}
          {field("Phone", "phone", m.phone, { type: "tel" })}
          <label className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 border-t border-slate-100 py-1 text-sm">
            <span className="text-slate-500">Position</span>
            {m.role === "SUB" || isSelf ? (
              <span className="text-slate-500">{isSelf ? `${positionName} (you can't change your own)` : positionName}</span>
            ) : (
              <select name="position" defaultValue={m.role === "ADMIN" ? "ADMIN" : `pos:${m.positionId ?? ""}`} className={box} title="A new position clears changes made for just this person">
                <option value="ADMIN">Admin (everything, including Settings)</option>
                {positions.map((p) => (
                  <option key={p.id} value={`pos:${p.id}`}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </label>
          {field("Vacation", "vacationDays", m.vacationDays, { type: "number", step: "0.5", placeholder: "Days a year" })}
          {m.pay ? (
            <>
              {field("Pay rate", "payRate", m.pay.rate, { type: "number", step: "0.01", placeholder: "Per hour" })}
              <label className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 border-t border-slate-100 py-1 text-sm">
                <span className="text-slate-500">Salaried</span>
                <span className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" name="salaried" defaultChecked={m.pay.salaried} className="h-3.5 w-3.5 rounded border-slate-300" /> No overtime
                </span>
              </label>
            </>
          ) : null}
          {error ? <p className="py-1 text-sm text-rose-700">{error}</p> : null}
          <div className="flex gap-1.5 border-t border-slate-100 pt-2">
            <button type="submit" disabled={busy} className={primary}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className={plain}
              onClick={() => {
                setError(null);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="px-4 py-2">
          <Row name="Title">{m.title}</Row>
          <Row name="Phone">
            {m.phone ? (
              <a href={`tel:${m.phone}`} className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                <Phone className="h-3.5 w-3.5" /> {m.phone}
              </a>
            ) : null}
          </Row>
          <Row name="Email">
            {m.email ? (
              <a href={`mailto:${m.email}`} className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                <Mail className="h-3.5 w-3.5" /> {m.email}
              </a>
            ) : null}
          </Row>
          <Row name="Position">{positionName}</Row>
          <Row name="Vacation">
            {m.vacationDays != null ? `${m.vacationDays} days a year${m.vacationUsed != null ? ` · ${m.vacationUsed} used` : ""}` : null}
          </Row>
          {m.pay ? (
            <Row name="Pay rate">{m.pay.rate != null ? `${money(m.pay.rate)} / hr${m.pay.salaried ? " · salaried" : ""}` : m.pay.salaried ? "Salaried" : null}</Row>
          ) : null}
        </div>
      )}
    </section>
  );
}

const LEVEL_PILL = ["bg-slate-50 text-slate-400 ring-slate-200", "bg-slate-50 text-slate-700 ring-slate-200", "bg-blue-50 text-blue-800 ring-blue-200"];
const LEVEL_WORD = ["Hidden", "Sees", "Changes"];

/** What a person can see and change, area by area — with "Change just for them", the same grid, saved right here. */
export function MemberAccess({
  memberId,
  name,
  role,
  value,
  base,
  changed,
  canEdit,
}: {
  memberId: string;
  name: string;
  role: string;
  value: Access;
  base: Access;
  changed: boolean;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const { error, busy, save } = useSave();
  const first = name.split(" ")[0];
  const shown = withCostRule(value);

  return (
    <section className={card}>
      <header className={head}>
        <h2 className="text-sm font-semibold text-slate-900">What {first} can see and change</h2>
        {canEdit && role === "STAFF" && !editing ? (
          <button type="button" className="text-xs font-medium text-blue-700 hover:underline" onClick={() => setEditing(true)}>
            Change just for {first}
          </button>
        ) : null}
      </header>
      {role === "ADMIN" ? (
        <p className="px-4 py-3 text-sm text-slate-600">Admin: everything, including Settings and everyone&apos;s pay.</p>
      ) : role === "SUB" ? (
        <p className="px-4 py-3 text-sm text-slate-600">Doesn&apos;t sign in — on the schedule and time clock only.</p>
      ) : editing ? (
        <form
          className="space-y-3 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("id", memberId);
            const reset = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "reset";
            if (reset) fd.set("reset", "on");
            save(() => saveMemberAccess(fd), () => setEditing(false));
          }}
        >
          <p className="text-xs text-slate-500">Anything set differently here is for {first} only — the rest follows the position.</p>
          <AccessFields value={value} base={base} />
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          <div className="flex flex-wrap gap-1.5">
            <button type="submit" disabled={busy} className={primary}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="submit" value="reset" disabled={busy} className={plain} title="Clear the changes: same access as the position">
              Use the position&apos;s access
            </button>
            <button type="button" className={plain} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="divide-y divide-slate-100">
          {changed ? <p className="bg-amber-50 px-4 py-1.5 text-xs text-amber-800">Changed for {first} — not the same as the position.</p> : null}
          {AREAS.map((a) => (
            <div key={a.key} className="flex items-center justify-between gap-3 px-4 py-1.5 text-sm">
              <span className={cn(shown[a.key] === 0 ? "text-slate-400" : "text-slate-800")}>{a.label}</span>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium ring-1", LEVEL_PILL[shown[a.key]])}>{LEVEL_WORD[shown[a.key]]}</span>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 px-4 py-1.5 text-sm">
            <span className="text-slate-800">Which jobs</span>
            <span className="text-xs text-slate-600">{shown.jobs === "ALL" ? "Every job" : JOBS_LABEL[shown.jobs]}</span>
          </div>
          {SWITCHES.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-3 px-4 py-1.5 text-sm">
              <span className={cn(shown[s.key] ? "text-slate-800" : "text-slate-400")}>{s.label}</span>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium ring-1", shown[s.key] ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-slate-50 text-slate-400 ring-slate-200")}>
                {shown[s.key] ? "Yes" : "No"}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
