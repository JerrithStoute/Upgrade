import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, differenceInCalendarDays } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const currencyWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function money(value: number | null | undefined, whole = false) {
  const v = value ?? 0;
  return whole ? currencyWhole.format(v) : currency.format(v);
}

export function num(value: number | null | undefined, digits = 2) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value ?? 0);
}

export function pct(value: number | null | undefined, digits = 0) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value ?? 0)}%`;
}

export function fmtDate(d: Date | string | null | undefined, pattern = "MMM d, yyyy") {
  if (!d) return "—";
  return format(typeof d === "string" ? new Date(d) : d, pattern);
}

export function fmtDateTime(d: Date | string | null | undefined) {
  return fmtDate(d, "MMM d, yyyy h:mm a");
}

export function timeAgo(d: Date | string | null | undefined) {
  if (!d) return "";
  return formatDistanceToNow(typeof d === "string" ? new Date(d) : d, { addSuffix: true });
}

/** yyyy-MM-dd for <input type="date"> */
export function dateInput(d: Date | string | null | undefined) {
  if (!d) return "";
  return format(typeof d === "string" ? new Date(d) : d, "yyyy-MM-dd");
}

/** Parse an <input type="date"> value as a local date (noon to avoid TZ rollover). */
export function parseDateInput(value: FormDataEntryValue | null | undefined): Date | null {
  if (!value || typeof value !== "string" || !value.trim()) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function daysBetween(a: Date, b: Date) {
  return differenceInCalendarDays(b, a);
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function strOrNull(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v ? v : null;
}

export function numField(fd: FormData, key: string, fallback = 0): number {
  const v = str(fd, key).replace(/[$,%\s]/g, "");
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function intField(fd: FormData, key: string, fallback = 0): number {
  return Math.round(numField(fd, key, fallback));
}

export function boolField(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

/** Line total with markup applied: qty * unitCost * (1 + markup%). */
export function lineCost(item: { quantity: number; unitCost: number }) {
  return item.quantity * item.unitCost;
}

export function linePrice(item: { quantity: number; unitCost: number; markupPct: number }) {
  return item.quantity * item.unitCost * (1 + item.markupPct / 100);
}

export function sum(values: number[]) {
  return values.reduce((a, b) => a + b, 0);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function titleCase(s: string) {
  return s
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
