import { cn } from "@/lib/utils";

/**
 * A short number box sized to what it holds, with its $ or % inside — e.g. "$ 600", "8.5 %".
 * Give it `value` and `onChange` to have it update as you type (no `name` needed then).
 */
export function UnitInput({
  label,
  name,
  prefix,
  suffix,
  width,
  defaultValue,
  value,
  onChange,
  placeholder,
  required,
  autoFocus,
  big,
}: {
  label: string;
  name?: string;
  prefix?: string;
  suffix?: string;
  /** A Tailwind width, e.g. "w-28". */
  width: string;
  defaultValue?: string | number | null;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  /** The one number that matters most (the offer price): larger. */
  big?: boolean;
}) {
  const unit = cn("pointer-events-none absolute inset-y-0 flex items-center text-slate-400", big ? "text-lg" : "text-sm");
  return (
    <label className="space-y-1">
      <span className="label">{label}</span>
      <span className={cn("relative block", width)}>
        {prefix ? <span className={cn(unit, "left-2.5")}>{prefix}</span> : null}
        <input
          name={name}
          inputMode="decimal"
          required={required}
          autoFocus={autoFocus}
          placeholder={placeholder}
          className={cn("input text-right", prefix && (big ? "!pl-7" : "!pl-6"), suffix && "!pr-7", big && "!h-12 text-2xl font-semibold")}
          {...(value !== undefined ? { value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value) } : { defaultValue: defaultValue ?? "" })}
        />
        {suffix ? <span className={cn(unit, "right-2.5")}>{suffix}</span> : null}
      </span>
    </label>
  );
}
