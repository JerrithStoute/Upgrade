"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Replace, X } from "lucide-react";
import { Button } from "@/components/ui";
import { cn, money, num } from "@/lib/utils";
import { itemNameKey, lumberOf } from "@/lib/takeoff";
import { substituteChoices, substituteItem } from "../actions";

type Choice = Awaited<ReturnType<typeof substituteChoices>>[number];
type Mode = "length" | "item" | "new";

// Lengths a yard sells, to swap a board for.
const LENGTHS = Array.from({ length: 17 }, (_, i) => 8 + i * 2);

/**
 * "Substitute…" on a Material list line: order something else instead, on this job only —
 * the same lumber at another length (2x6 × 26' → 28'), another Item List item, or a new one.
 */
export function SubstituteButton({ projectId, line }: { projectId: string; line: { materialItemId: string; name: string; unit: string; quantity: number } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const lumber = lumberOf(line.name);
  const [mode, setMode] = useState<Mode>(lumber ? "length" : "item");
  const [length, setLength] = useState(() => (lumber ? (LENGTHS.find((l) => l > lumber.length) ?? lumber.length + 2) : 0));
  const [items, setItems] = useState<Choice[] | null>(null);
  const [find, setFind] = useState("");
  const [itemId, setItemId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState(line.unit);
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    if (!open || items) return;
    substituteChoices()
      .then(setItems)
      .catch(() => setItems([]));
  }, [open, items]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  const q = find.trim().toLowerCase();
  const matches = (items ?? []).filter((i) => i.id !== line.materialItemId && (!q || i.name.toLowerCase().includes(q))).slice(0, 8);
  const picked = items?.find((i) => i.id === itemId) ?? null;

  const submit = () => {
    setError(null);
    const p = price.trim() ? Number(price.replace(/[$,\s]/g, "")) : null;
    if (p != null && !(Number.isFinite(p) && p >= 0)) return setError("Enter a price, or leave it blank");
    const choice =
      mode === "length"
        ? { kind: "length" as const, length }
        : mode === "item"
          ? itemId
            ? { kind: "item" as const, itemId }
            : null
          : newName.trim()
            ? { kind: "new" as const, name: newName.trim(), unit: newUnit.trim() || line.unit }
            : null;
    if (!choice) return setError(mode === "item" ? "Pick an item from the list" : "Name what you'll order instead");
    start(async () => {
      const r = await substituteItem({ projectId, fromItemId: line.materialItemId, with: choice, unitCost: p });
      if (!r.ok) return setError(r.error);
      setOpen(false);
      router.refresh();
    });
  };

  const option = (m: Mode, label: string) => (
    <label className={cn("flex cursor-pointer items-center gap-2 text-sm font-medium", mode === m ? "text-slate-900" : "text-slate-600")}>
      <input type="radio" name={`sub-mode-${line.materialItemId}`} checked={mode === m} onChange={() => setMode(m)} className="h-4 w-4" />
      {label}
    </label>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="no-print ml-2 inline-flex items-center gap-1 rounded px-1 text-[11px] font-normal text-slate-400 hover:bg-blue-50 hover:text-blue-700"
        title="Order something else instead, on this job only"
      >
        <Replace className="h-3 w-3" /> Substitute…
      </button>
      {open ? (
        <div
          className="no-print fixed inset-0 z-50 flex items-start justify-center bg-slate-900/30 p-4 pt-[10vh]"
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl" role="dialog" aria-label={`Substitute ${line.name}`}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">Substitute on this job</p>
                <p className="text-sm text-slate-600">
                  Instead of <span className="font-medium text-slate-900">{line.name}</span> ({num(line.quantity)} {line.unit}), order:
                </p>
              </div>
              <button type="button" aria-label="Close" className="text-slate-400 hover:text-slate-700" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {lumber ? (
                <div className="space-y-1.5">
                  {option("length", `Another length of ${lumber.size}`)}
                  {mode === "length" ? (
                    <div className="ml-6 flex items-center gap-2 text-sm">
                      <select value={length} onChange={(e) => setLength(Number(e.target.value))} className="input !h-8 !w-auto !py-0" aria-label="Length">
                        {LENGTHS.filter((l) => l !== lumber.length).map((l) => (
                          <option key={l} value={l}>
                            {lumber.size} × {l}&apos;
                          </option>
                        ))}
                      </select>
                      <span className="text-xs text-slate-500">Pieces cut from {lumber.length}&apos; come from these instead — the plan, cut sheet and order all follow.</span>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-1.5">
                {option("item", "An item from the Item List")}
                {mode === "item" ? (
                  <div className="ml-6 space-y-1">
                    <input
                      value={find}
                      onChange={(e) => setFind(e.target.value)}
                      placeholder="Find an item…"
                      className="input !h-8 !py-0 text-sm"
                      aria-label="Find an item"
                      autoFocus
                    />
                    <ul className="max-h-48 overflow-y-auto rounded-md border border-slate-200 text-sm">
                      {items === null ? <li className="px-2.5 py-1.5 text-slate-400">Loading…</li> : null}
                      {items && matches.length === 0 ? <li className="px-2.5 py-1.5 text-slate-500">Nothing by that name — use “Something new”.</li> : null}
                      {matches.map((i) => (
                        <li key={i.id}>
                          <button
                            type="button"
                            onClick={() => setItemId(i.id)}
                            className={cn("flex w-full items-center gap-2 px-2.5 py-1.5 text-left", itemId === i.id ? "bg-blue-50 text-blue-900" : "hover:bg-slate-50")}
                          >
                            <span className="min-w-0 flex-1 truncate">{i.name}</span>
                            <span className="shrink-0 text-xs text-slate-500">{i.unitCost > 0 ? `${money(i.unitCost)}/${i.unit}` : i.unit}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    {picked && itemNameKey(picked.unit) !== itemNameKey(line.unit) ? (
                      <p className="text-xs text-amber-700">
                        It&apos;s sold by the {picked.unit}, this by the {line.unit} — the job orders the same number ({num(line.quantity)}).
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="space-y-1.5">
                {option("new", "Something new")}
                {mode === "new" ? (
                  <div className="ml-6 flex gap-2">
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="What you'll order"
                      className="input !h-8 !py-0 text-sm"
                      aria-label="New item name"
                    />
                    <input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} className="input !h-8 !w-16 !py-0 text-sm" aria-label="Unit" />
                  </div>
                ) : null}
              </div>

              <label className="flex items-center gap-2 border-t border-slate-100 pt-3 text-sm text-slate-700">
                Price on this job
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="$"
                  inputMode="decimal"
                  className="input !h-8 !w-24 !py-0 text-sm"
                  aria-label="Price on this job"
                />
                <span className="text-xs text-slate-500">blank = its Item List price</span>
              </label>
              {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
              <div className="flex items-center gap-2">
                <p className="flex-1 text-xs text-slate-500">This job only. Swap back any time.</p>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={submit} disabled={busy}>
                  {busy ? "Substituting…" : "Substitute"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
