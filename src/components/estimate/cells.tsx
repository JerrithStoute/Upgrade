"use client";

import { useEffect, useRef, useState } from "react";
import { cn, costCodeLabel, money as fmtMoney, num } from "@/lib/utils";
import { evaluateFormula, toDisplayFormula, toStoredFormula, type FormulaParam } from "@/lib/formula";

/** A sheet cell: looks like text until you point at it or click in. */
export const cellClass =
  "w-full min-w-0 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm text-slate-800 hover:border-slate-200 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20";

function parse(s: string) {
  const t = s.replace(/[$,%\s]/g, "");
  return t === "" ? 0 : Number(t);
}

/**
 * A number cell. Shows the formatted value; while you type it keeps exactly what
 * you typed ("1." stays "1.") and passes on each valid number, so totals follow
 * along. Something that isn't a number turns the cell red and isn't passed on.
 */
export function NumCell({
  value,
  onChange,
  ariaLabel,
  className,
  money,
  blankZero,
  placeholder,
  onClear,
}: {
  value: number;
  onChange: (v: number) => void;
  ariaLabel: string;
  className?: string;
  money?: boolean;
  /** Show 0 as an empty cell (sq. ft., base price). */
  blankZero?: boolean;
  placeholder?: string;
  /** An emptied cell means "no value" (instead of 0). */
  onClear?: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (blankZero && value === 0 ? "" : money ? fmtMoney(value) : num(value, 4));
  const bad = text !== null && !Number.isFinite(parse(text));
  return (
    <input
      inputMode="decimal"
      className={cn(cellClass, "tabular-nums", bad && "!border-rose-400 !bg-rose-50", className)}
      value={shown}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-invalid={bad || undefined}
      onFocus={(e) => {
        setText(blankZero && value === 0 ? "" : String(value));
        const el = e.currentTarget;
        requestAnimationFrame(() => el.select());
      }}
      onChange={(e) => {
        setText(e.target.value);
        if (onClear && e.target.value.trim() === "") return onClear();
        const n = parse(e.target.value);
        if (Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => setText(null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

/**
 * Cost code cell. A list of every cost code on every line would be thousands of
 * options, so it shows the code as text and becomes a dropdown when you click it.
 */
export function CostCodeCell({
  value,
  costCodes,
  onChange,
}: {
  value: string | null;
  costCodes: { id: string; code: string | null; name: string }[];
  onChange: (id: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const current = value ? costCodes.find((c) => c.id === value) : null;
  if (!editing)
    return (
      <button
        type="button"
        data-cell
        className={cn(cellClass, "truncate text-left", !current && "text-slate-400")}
        title={current ? costCodeLabel(current) : "Pick a cost code"}
        onClick={() => setEditing(true)}
        onFocus={() => setEditing(true)}
      >
        {current ? costCodeLabel(current) : "No cost code"}
      </button>
    );
  return (
    <select
      autoFocus
      className={cellClass}
      value={value ?? ""}
      aria-label="Cost code"
      ref={(el) => {
        // Open the list right away where the browser allows it.
        if (el)
          requestAnimationFrame(() => {
            try {
              el.showPicker();
            } catch {
              /* not supported: it's focused, a click or arrow keys open it */
            }
          });
      }}
      onChange={(e) => {
        onChange(e.target.value || null);
        setEditing(false);
      }}
      onBlur={() => setEditing(false)}
    >
      <option value="">No cost code</option>
      {costCodes.map((c) => (
        <option key={c.id} value={c.id}>
          {costCodeLabel(c)}
        </option>
      ))}
    </select>
  );
}

export type CellParam = FormulaParam & { unit: string };

/**
 * The Qty cell. Type a number, or a formula starting with "=" that uses your
 * parameters (=[Heated sq. ft.] * 1.1); the ƒ button picks a parameter for you.
 * A formula shows its result with ƒ in front (amber when a value is still missing).
 */
export function QtyCell({
  value,
  formula,
  params,
  values,
  onNumber,
  onFormula,
  money,
  ariaLabel = "Quantity",
}: {
  /** Unit cost: shown as money. */
  money?: boolean;
  ariaLabel?: string;
  value: number;
  formula: string | null;
  params: CellParam[];
  values: Record<string, number>;
  onNumber: (v: number) => void;
  onFormula: (stored: string) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [factor, setFactor] = useState("1");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!picking) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setPicking(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [picking]);
  const result = formula ? evaluateFormula(formula, values, params) : null;
  const missing = result?.missing.length ? `Fill in: ${result.missing.join(", ")}` : "";
  const shown = text ?? (money ? fmtMoney(value) : num(value, 4));
  const commit = (t: string) => {
    if (!t.trim().startsWith("=")) {
      setText(null);
      setErr(null);
      return;
    }
    const r = toStoredFormula(t, params);
    if ("error" in r) setErr(r.error);
    else {
      onFormula(r.formula);
      setText(null);
      setErr(null);
    }
  };
  return (
    <div ref={box} className="group/qty relative">
      {formula && text === null ? (
        <span className={cn("pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-xs font-semibold italic", missing ? "text-amber-600" : "text-blue-700")}>ƒ</span>
      ) : null}
      <input
        inputMode="decimal"
        className={cn(cellClass, "pl-4 text-right tabular-nums", err && "!border-rose-400 !bg-rose-50 text-left")}
        value={shown}
        aria-label={ariaLabel}
        aria-invalid={!!err || undefined}
        title={err ?? (formula ? `${toDisplayFormula(formula, params)}${missing ? ` — ${missing}` : ""}` : "Type a number, or = for a formula with your parameters")}
        onFocus={(e) => {
          setText(text ?? (formula ? toDisplayFormula(formula, params) : String(value)));
          const el = e.currentTarget;
          requestAnimationFrame(() => el.select());
        }}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          setErr(null);
          if (!t.trim().startsWith("=")) {
            const n = t.replace(/[,\s]/g, "") === "" ? 0 : Number(t.replace(/[,\s]/g, ""));
            if (Number.isFinite(n)) onNumber(n);
          }
        }}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setText(null);
            setErr(null);
            requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
          }
        }}
      />
      {params.length ? (
        <button
          type="button"
          tabIndex={-1}
          title="Use a parameter"
          aria-label="Use a parameter"
          onClick={() => setPicking((p) => !p)}
          className="absolute -left-1 top-1/2 hidden -translate-y-1/2 rounded bg-white px-0.5 text-[10px] font-semibold italic text-blue-700 shadow ring-1 ring-slate-200 group-hover/qty:block"
        >
          ƒ
        </button>
      ) : null}
      {picking ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-2 text-left shadow-lg">
          <label className="mb-1 flex items-center gap-1.5 px-1 text-xs text-slate-600">
            Times
            <input className="input !h-7 !w-16 !py-0 text-right text-xs" inputMode="decimal" value={factor} onChange={(e) => setFactor(e.target.value)} aria-label="Multiply by" />
            <span className="text-slate-400">(1.1 = add 10%)</span>
          </label>
          <ul className="max-h-56 overflow-y-auto">
            {params.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-blue-50"
                  onClick={() => {
                    const f = Number(factor);
                    onFormula(Number.isFinite(f) && f !== 1 ? `[#${p.id}] * ${f}` : `[#${p.id}]`);
                    setPicking(false);
                  }}
                >
                  <span className="truncate text-slate-800">{p.name}</span>
                  <span className="shrink-0 tabular-nums text-slate-500">{values[p.id] !== undefined ? `${num(values[p.id], 2)} ${p.unit}` : "no value yet"}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1 border-t border-slate-100 px-1 pt-1 text-[11px] text-slate-500">Or type = in the cell for any formula, e.g. =roundup([Wall area] / 32)</p>
        </div>
      ) : null}
    </div>
  );
}
