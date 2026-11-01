"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { actionMessage } from "@/lib/action-message";
import {
  MAX_CHOICES,
  MAX_OWN_PARTS,
  lockedAsk,
  lockedChoices,
  ownPart,
  readSizeCode,
  tidy,
  unitName,
  usualValues,
  type UnitKind,
  type UnitPart,
} from "@/lib/unit-parts";
import { saveParts } from "@/app/(app)/catalog/parts-actions";

const box = "input !h-7 !w-auto !py-0 text-xs";
const link = "text-xs font-medium text-blue-700 hover:underline";
const plainBtn = "inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
// A long list of choices shows this many until "+N more".
const FIRST = 5;

/**
 * Catalog → Doors / Windows: the parts a door or window is described by, one row each — asked or not, the usual
 * one, whether it's in the name always or only when it isn't the usual, and its choices. A part of your own
 * (Material: Wood / Metal) for the odd one. The name a usual one gets shows at the top, by Save.
 */
export function PartsEditor({ kind, initial }: { kind: UnitKind; initial: UnitPart[] }) {
  const noun = kind === "window" ? "window" : "door";
  const Noun = noun[0].toUpperCase() + noun.slice(1);
  const [parts, setParts] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [newChoice, setNewChoice] = useState<Record<string, string>>({});
  // The row whose "+ Add" box is open, and the rows showing every choice.
  const [adding, setAdding] = useState<string | null>(null);
  const [showAll, setShowAll] = useState<Set<string>>(new Set());
  const [partOpen, setPartOpen] = useState(false);
  const [newPart, setNewPart] = useState<{ name: string; as: "pick" | "yesno" }>({ name: "", as: "pick" });
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const changed = JSON.stringify(parts) !== JSON.stringify(saved);

  const change = (key: string, patch: Partial<UnitPart>) => {
    setNote(null);
    setParts((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  };
  const addChoice = (p: UnitPart) => {
    const v = tidy(newChoice[p.key]);
    if (!v) return;
    const had = p.choices.find((c) => c.toLowerCase() === v.toLowerCase());
    if (had) return setError(`${p.name} already has ${had}`);
    if (p.choices.length >= MAX_CHOICES) return setError(`${p.name} has ${MAX_CHOICES} choices — take one off first`);
    setError(null);
    change(p.key, { choices: [...p.choices, v], usual: p.usual || v });
    setNewChoice((x) => ({ ...x, [p.key]: "" }));
  };
  const removeChoice = (p: UnitPart, c: string) => {
    const choices = p.choices.filter((x) => x !== c);
    change(p.key, { choices, usual: p.usual === c ? (choices[0] ?? "") : p.usual });
  };
  const addPart = () => {
    const name = tidy(newPart.name);
    if (!name) return;
    if (parts.some((p) => p.name.toLowerCase() === name.toLowerCase() || p.key.toLowerCase() === name.toLowerCase()) || ["size", "int", "ext"].includes(name.toLowerCase()))
      return setError(`Every ${noun} already has ${name.toLowerCase()}`);
    setError(null);
    setNote(null);
    const p = ownPart(name, newPart.as);
    setParts((list) => [...list, newPart.as === "pick" ? { ...p, inName: "unusual" } : p]);
    setNewPart({ name: "", as: "pick" });
    setPartOpen(false);
    // A new part with choices to pick from: its "+ Add" box is open, ready for the first one.
    if (newPart.as === "pick") setAdding(p.key);
  };
  const save = () =>
    start(async () => {
      setError(null);
      try {
        const r = await saveParts({ kind, parts });
        if (!r.ok) return setError(r.error);
        setParts(r.parts);
        setSaved(r.parts);
        setNote("Saved");
      } catch (e) {
        setError(actionMessage(e, "The changes weren't saved"));
      }
    });

  const own = parts.filter((p) => !p.builtIn);
  const sizeCode = kind === "window" ? "3050" : "2868";
  const usualName = unitName(kind, parts, readSizeCode(sizeCode)!, usualValues(parts));
  const cell = "px-3 py-2 align-top";

  return (
    <section className="max-w-5xl rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <span className="text-sm text-slate-700">
          A usual {noun} is named <strong className="font-semibold text-slate-900">{usualName}</strong>
        </span>
        <span className="flex items-center gap-2 text-xs">
          {error ? <span className="text-rose-700">{error}</span> : null}
          {note && !changed ? <span className="font-medium text-emerald-700">{note}</span> : null}
          {changed ? <span className="text-amber-700">Not saved yet</span> : null}
          <button
            type="button"
            onClick={save}
            disabled={busy || !changed}
            className="inline-flex h-7 items-center rounded-md bg-blue-700 px-2.5 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </span>
      </header>
      <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
        Picks, never typing, so the same {noun} gets the same name and is the same Item List item on every job. Changes are for {noun}s added from now on; {noun}s already on jobs
        keep their names. Choices can also be added from a job&apos;s {noun} list on the takeoff.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-100 text-xs text-slate-500">
            <tr>
              <th className="w-28 px-3 py-2 pl-4 font-normal">Part</th>
              <th className="w-12 px-3 py-2 font-normal">Ask</th>
              <th className="w-36 px-3 py-2 font-normal">Usual</th>
              <th className="w-52 px-3 py-2 font-normal">In the name</th>
              <th className="px-3 py-2 pr-4 font-normal">Choices</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className={cn(cell, "pl-4 font-medium text-slate-900")}>Size</td>
              <td className={cell}>
                <input type="checkbox" checked disabled aria-label="Ask for Size" className="h-4 w-4 rounded border-slate-300" />
              </td>
              <td colSpan={3} className={cn(cell, "pr-4 text-xs text-slate-500")}>
                Always asked, typed the usual way ({sizeCode})
              </td>
            </tr>
            {parts.map((p) => {
              const all = showAll.has(p.key) || p.choices.length <= FIRST + 1;
              const listed = all ? p.choices : p.choices.slice(0, FIRST);
              return (
                <tr key={p.key} className={cn(!p.ask && "bg-slate-50/70")}>
                  <td className={cn(cell, "pl-4 font-medium", p.ask ? "text-slate-900" : "text-slate-500")}>{p.name}</td>
                  <td className={cell}>
                    <input
                      type="checkbox"
                      aria-label={`Ask for ${p.name}`}
                      className="h-4 w-4 rounded border-slate-300"
                      checked={p.ask}
                      disabled={lockedAsk(p)}
                      onChange={(e) => change(p.key, { ask: e.target.checked })}
                    />
                  </td>
                  {!p.ask ? (
                    <td colSpan={2} className={cn(cell, "text-xs text-slate-500")}>
                      Not asked, never in the name
                    </td>
                  ) : p.kind === "yesno" ? (
                    <td colSpan={2} className={cn(cell, "text-xs text-slate-600")}>
                      <label className="inline-flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-slate-300"
                          checked={p.usual === "Yes"}
                          onChange={(e) => change(p.key, { usual: e.target.checked ? "Yes" : "No" })}
                        />
                        Ticked to start
                      </label>
                      <span className="block text-slate-500">A tick box: &ldquo;{p.name}&rdquo; is in the name when it&apos;s ticked</span>
                    </td>
                  ) : (
                    <>
                      <td className={cell}>
                        <select aria-label={`Usual ${p.name}`} className={box} value={p.usual} onChange={(e) => change(p.key, { usual: e.target.value })}>
                          {p.usual === "" || !p.choices.length ? <option value="">—</option> : null}
                          {p.choices.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={cell}>
                        <select
                          aria-label={`${p.name} in the name`}
                          className={box}
                          value={p.inName}
                          onChange={(e) => change(p.key, { inName: e.target.value === "unusual" ? "unusual" : "always" })}
                        >
                          <option value="always">Always</option>
                          <option value="unusual">Only when it isn&apos;t the usual</option>
                        </select>
                      </td>
                    </>
                  )}
                  <td className={cn(cell, "pr-4")}>
                    {lockedAsk(p) ? (
                      <span className="text-xs text-slate-500">{p.choices.join(", ")} · always asked, it files the door for its cost code and the bid list</span>
                    ) : p.ask && !lockedChoices(p) ? (
                      <div className="flex flex-wrap items-center gap-1">
                        {listed.map((c) => (
                          <span
                            key={c}
                            className={cn("inline-flex items-center gap-0.5 rounded-full py-0.5 pl-2.5 pr-1 text-xs", c === p.usual ? "bg-blue-100 text-blue-900" : "bg-slate-100 text-slate-700")}
                          >
                            {c}
                            <button type="button" className="rounded-full p-0.5 text-slate-400 hover:text-rose-600" aria-label={`Take ${c} off ${p.name}`} onClick={() => removeChoice(p, c)}>
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                        {!all ? (
                          <button type="button" className="text-xs text-slate-500 hover:text-slate-800" onClick={() => setShowAll((s) => new Set(s).add(p.key))}>
                            +{p.choices.length - FIRST} more
                          </button>
                        ) : null}
                        {adding === p.key ? (
                          <span className="inline-flex items-center gap-1.5">
                            <input
                              autoFocus
                              className="input !h-7 !w-32 !px-2 !py-0 text-xs"
                              placeholder="New choice"
                              aria-label={`Add a ${p.name.toLowerCase()} choice`}
                              maxLength={40}
                              value={newChoice[p.key] ?? ""}
                              onChange={(e) => setNewChoice((x) => ({ ...x, [p.key]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  addChoice(p);
                                }
                                if (e.key === "Escape") setAdding(null);
                              }}
                            />
                            <button type="button" className={plainBtn} disabled={!tidy(newChoice[p.key])} onClick={() => addChoice(p)}>
                              Add
                            </button>
                            <button type="button" className={link} onClick={() => setAdding(null)}>
                              Done
                            </button>
                          </span>
                        ) : (
                          <button type="button" className={cn(link, "ml-1")} onClick={() => setAdding(p.key)}>
                            + Add
                          </button>
                        )}
                      </div>
                    ) : null}
                    {!p.builtIn ? (
                      <button
                        type="button"
                        className="mt-1 block text-xs text-slate-500 hover:text-rose-600"
                        onClick={() => {
                          if (window.confirm(`Take ${p.name} off? ${Noun}s already on the Item List keep it in their name.`)) setParts((list) => list.filter((x) => x.key !== p.key));
                        }}
                      >
                        Remove…
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {own.length < MAX_OWN_PARTS ? (
        <div className="border-t border-slate-100 px-4 py-2">
          {partOpen ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                autoFocus
                className="input !h-7 !w-40 !py-0 text-xs"
                placeholder={kind === "window" ? "Glass" : "Material"}
                aria-label="Name of your part"
                maxLength={40}
                value={newPart.name}
                onChange={(e) => setNewPart({ ...newPart, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPart();
                  }
                  if (e.key === "Escape") setPartOpen(false);
                }}
              />
              <select aria-label="Answered with" className={box} value={newPart.as} onChange={(e) => setNewPart({ ...newPart, as: e.target.value === "yesno" ? "yesno" : "pick" })}>
                <option value="pick">Choices you pick from</option>
                <option value="yesno">A tick box (yes / no)</option>
              </select>
              <button type="button" className={plainBtn} onClick={addPart} disabled={!tidy(newPart.name)}>
                Add part
              </button>
              <button type="button" className={cn(link, "ml-auto")} onClick={() => setPartOpen(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button type="button" className={link} onClick={() => setPartOpen(true)}>
                + Add a part of your own…
              </button>{" "}
              <span className="text-xs text-slate-500">
                {kind === "window"
                  ? "for something only some windows have, like Glass: Clear, Low-E, Obscure"
                  : "for the door that isn't normal, like Material: Wood, Metal, Fiberglass"}
              </span>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
