"use client";

import { useState } from "react";
import { cn, money, num } from "@/lib/utils";
import { SubmitButton } from "@/components/ui";

export type ReviewGroup = {
  name: string;
  /** `id` is the Item List item (what gets updated — all its lines on this job); `key` is the row. */
  items: { key: string; id: string; name: string; unit: string; qty: number; jobPrice: number; listPrice: number; pinned: boolean; uses: string[] }[];
};

/** Tick items — or a whole group — to take today's Item List price on this job. */
export function PriceReviewForm({ projectId, groups, action, locked }: { projectId: string; groups: ReviewGroup[]; action: (fd: FormData) => Promise<void>; locked: boolean }) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const toggle = (ids: string[], on: boolean) =>
    setPicked((p) => {
      const n = new Set(p);
      for (const id of ids) {
        if (on) n.add(id);
        else n.delete(id);
      }
      return n;
    });
  const all = groups.flatMap((g) => g.items);
  const change = all.filter((i) => picked.has(i.id)).reduce((n, i) => n + i.qty * (i.listPrice - i.jobPrice), 0);
  const signed = (n: number) => `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      {Array.from(picked).map((id) => (
        <input key={id} type="hidden" name="item" value={id} />
      ))}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Pick every item"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={all.length > 0 && all.every((i) => picked.has(i.id))}
                  onChange={(e) =>
                    toggle(
                      all.map((i) => i.id),
                      e.target.checked,
                    )
                  }
                />
              </th>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 text-right font-medium">Qty on this job</th>
              <th className="px-3 py-2 text-right font-medium">Job price</th>
              <th className="px-3 py-2 text-right font-medium">Item List price</th>
              <th className="px-3 py-2 text-right font-medium">Change in cost</th>
            </tr>
          </thead>
          {groups.map((g) => {
            const ids = g.items.map((i) => i.id);
            const on = ids.every((id) => picked.has(id));
            const some = !on && ids.some((id) => picked.has(id));
            const gChange = g.items.reduce((n, i) => n + i.qty * (i.listPrice - i.jobPrice), 0);
            return (
              <tbody key={g.name} className="border-t border-slate-200">
                <tr className="bg-slate-50/70">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Pick all of ${g.name}`}
                      className="h-4 w-4 rounded border-slate-300"
                      checked={on}
                      ref={(el) => {
                        if (el) el.indeterminate = some;
                      }}
                      onChange={(e) => toggle(ids, e.target.checked)}
                    />
                  </td>
                  <td className="px-3 py-2 font-semibold text-slate-900" colSpan={4}>
                    {g.name}{" "}
                    <span className="text-xs font-normal text-slate-500">
                      · {g.items.length} item{g.items.length === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td className={cn("px-3 py-2 text-right text-xs tabular-nums", gChange > 0 ? "text-rose-700" : "text-emerald-700")}>{signed(gChange)}</td>
                </tr>
                {g.items.map((i) => {
                  const d = i.qty * (i.listPrice - i.jobPrice);
                  return (
                    <tr key={i.key} className={cn("border-t border-slate-100", picked.has(i.id) && "bg-blue-50/50")}>
                      <td className="px-3 py-1.5 pl-6">
                        <input
                          type="checkbox"
                          aria-label={`Pick ${i.name}`}
                          className="h-4 w-4 rounded border-slate-300"
                          checked={picked.has(i.id)}
                          onChange={(e) => toggle([i.id], e.target.checked)}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="text-slate-900">{i.name}</span>
                        {i.pinned ? (
                          <span className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-800 ring-1 ring-violet-200">this job only</span>
                        ) : null}
                        <span className="block text-xs text-slate-500">{i.uses.join(", ")}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {num(i.qty, 2)} {i.unit}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{money(i.jobPrice)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium">{money(i.listPrice)}</td>
                      <td className={cn("px-3 py-1.5 text-right tabular-nums", d > 0 ? "text-rose-700" : "text-emerald-700")}>{signed(d)}</td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton disabled={picked.size === 0} pendingText="Updating…">
          Update {picked.size || ""} selected to today&apos;s price
        </SubmitButton>
        <span className="text-sm text-slate-600">{picked.size ? `${signed(change)} in cost` : "Tick items, or a whole group."}</span>
        <span className="ml-auto text-xs text-slate-500">{locked ? "The job stays locked." : "Updated items follow the Item List again."}</span>
      </div>
    </form>
  );
}
