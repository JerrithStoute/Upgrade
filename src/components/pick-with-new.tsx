"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { FileWarning, X } from "lucide-react";
import { actionMessage } from "@/lib/action-message";

export type PickOption = { id: string; label: string; /** A note shown under the list when this one's picked (paperwork they owe). */ warn?: string };
export type NewField = { name: string; label: string; type?: string; required?: boolean; placeholder?: string; wide?: boolean };
type Created = { ok: true; option: PickOption } | { ok: false; error: string };

const NEW = "__new__";

/**
 * A pick list whose last choice is "+ New client…" / "+ New vendor…": a small window asks the few things it needs,
 * saves it, and picks it — everything else on the page stays as you typed it. Sent with the form as `name`.
 */
export function PickWithNew({
  name,
  id,
  options: initial,
  defaultValue = "",
  emptyLabel,
  newLabel,
  title,
  fields,
  create,
  className = "input",
}: {
  name: string;
  id?: string;
  options: PickOption[];
  defaultValue?: string;
  /** The "nothing picked" choice ("— No client —"); none: there isn't one. */
  emptyLabel?: string;
  newLabel: string;
  title: string;
  fields: NewField[];
  create: (values: Record<string, string>) => Promise<Created>;
  className?: string;
}) {
  const router = useRouter();
  const [options, setOptions] = useState(initial);
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const first = useRef<HTMLInputElement>(null);
  const picked = options.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const save = () =>
    start(async () => {
      setError(null);
      const missing = fields.find((f) => f.required && !(values[f.name] ?? "").trim());
      if (missing) return setError(`${missing.label}, please`);
      try {
        const r = await create(values);
        if (!r.ok) return setError(r.error);
        setOptions((cur) => (cur.some((o) => o.id === r.option.id) ? cur : [...cur, r.option].sort((a, b) => a.label.localeCompare(b.label))));
        setValue(r.option.id);
        setOpen(false);
        setValues({});
        router.refresh(); // other lists on the page see it too
      } catch (e) {
        setError(actionMessage(e, "It wasn't saved — try again"));
      }
    });

  return (
    <>
      <select
        id={id}
        name={name}
        className={className}
        value={value}
        onChange={(e) => {
          if (e.target.value === NEW) {
            setError(null);
            setOpen(true);
          } else setValue(e.target.value);
        }}
      >
        {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : null}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
        <option value={NEW}>{newLabel}</option>
      </select>
      {picked?.warn ? (
        <p className="mt-1 flex items-start gap-1 text-xs text-amber-800">
          <FileWarning className="mt-px h-3.5 w-3.5 shrink-0" /> {picked.warn}
        </p>
      ) : null}
      {open
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:pt-24" role="dialog" aria-modal="true" aria-label={title}>
              <button type="button" className="fixed inset-0 cursor-default bg-slate-900/30" aria-label="Close" onClick={() => setOpen(false)} />
              <div className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center border-b border-slate-200 px-4 py-3">
                  <p className="flex-1 text-sm font-semibold text-slate-900">{title}</p>
                  <button type="button" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Close (Esc)" onClick={() => setOpen(false)}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div
                  className="grid grid-cols-2 gap-3 px-4 py-4"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      save();
                    }
                  }}
                >
                  {fields.map((f, i) => (
                    <label key={f.name} className={f.wide ? "col-span-2 space-y-1" : "space-y-1"}>
                      <span className="label">
                        {f.label}
                        {f.required ? "" : <span className="font-normal text-slate-400"> (optional)</span>}
                      </span>
                      <input
                        ref={i === 0 ? first : undefined}
                        type={f.type ?? "text"}
                        className="input"
                        placeholder={f.placeholder}
                        value={values[f.name] ?? ""}
                        onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                      />
                    </label>
                  ))}
                  {error ? <p className="col-span-2 text-sm text-rose-700">{error}</p> : null}
                </div>
                <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
                  <button type="button" className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100" onClick={() => setOpen(false)}>
                    Cancel
                  </button>
                  <button type="button" disabled={busy} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50" onClick={save}>
                    {busy ? "Saving…" : "Save and pick"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
