import type { Selection, SelectionOption } from "@prisma/client";

export const PRICED_STATUSES = ["CHOSEN", "APPROVED", "ORDERED", "INSTALLED"];

export function chosenOption(sel: Selection & { options: SelectionOption[] }) {
  return sel.chosenOptionId ? (sel.options.find((o) => o.id === sel.chosenOptionId) ?? null) : null;
}

/** Positive = over allowance, negative = under. Null when nothing is chosen. */
export function variance(sel: Selection & { options: SelectionOption[] }) {
  const opt = chosenOption(sel);
  if (!opt) return null;
  return opt.price - sel.allowance;
}

export function isSelectionOverdue(sel: { dueDate: Date | null; status: string }, today = new Date()) {
  return !!sel.dueDate && sel.status === "PENDING" && sel.dueDate < today;
}
