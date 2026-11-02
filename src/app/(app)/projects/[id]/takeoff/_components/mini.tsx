import { cn } from "@/lib/utils";

/**
 * The takeoff form's small pieces. Settings read like a sentence — "[2x6] @ [16" o.c.]
 * [9] ft high" — in a Section (a short label on the left, its lines on the right).
 */
export function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-[76px_minmax(0,1fr)] gap-2 border-t border-slate-100 py-2", className)}>
      <p className="pt-1.5 text-xs font-medium text-slate-800">{title}</p>
      <div className="min-w-0 space-y-1.5">{children}</div>
    </div>
  );
}

/** One line of a Section: boxes with the words between them. */
export function Line({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex min-h-7 flex-wrap items-center gap-1.5 text-xs text-slate-500", className)}>{children}</div>;
}

/** A box with a short gray label over it (for the few places that aren't a sentence). */
export function Field({ label, htmlFor, hint, className, children }: { label: string; htmlFor?: string; hint?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn(className)}>
      <label className="mb-0.5 block text-[11px] text-slate-500" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

/** A few choices as one small switch (None / 1 side / Both, Precut / From stock). */
export function Switch<T extends string | number | boolean>({
  label,
  value,
  options,
  onChange,
}: {
  /** Read out for screen readers (the switch shows no label). */
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-7 shrink-0 overflow-hidden rounded-md border border-slate-300 pointer-coarse:h-9">
      {options.map(([v, text]) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn("px-2 text-xs font-medium", value === v ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50")}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/**
 * The takeoff form's boxes: small (28px, 12px text), a little taller on a touchscreen.
 * Number boxes have no up/down arrows — they'd crowd out a second digit.
 */
export const SMALL_BOXES =
  "[&_.input]:h-7! [&_.input]:px-2! [&_.input]:py-0.5! [&_.input]:text-xs! pointer-coarse:[&_.input]:h-9! [&_input[type=number]]:[appearance:textfield] [&_input[type=number]::-webkit-inner-spin-button]:appearance-none [&_input[type=number]::-webkit-outer-spin-button]:appearance-none";
