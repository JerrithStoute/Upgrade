"use client";

import { Trash2 } from "lucide-react";

/** Erases a schedule task — asks first. Small, for the row's hover tools. */
export function EraseTaskButton({ action, hidden, name }: { action: (fd: FormData) => void | Promise<void>; hidden: Record<string, string>; name: string }) {
  return (
    <form
      action={action}
      className="inline-flex"
      onSubmit={(e) => {
        if (!window.confirm(`Erase "${name}" from the schedule? Tasks waiting on it stop waiting (their dates stay).`)) e.preventDefault();
      }}
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" className="rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700" title="Erase this task" aria-label={`Erase ${name}`}>
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}
