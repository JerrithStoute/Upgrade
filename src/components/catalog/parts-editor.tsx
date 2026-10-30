"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button, Card, CardBody, CardHeader } from "@/components/ui";
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

/**
 * Catalog → Doors / Windows: the parts a door or window is described by. For each — asked or not, its
 * choices, the usual one, and whether it's in the name always or only when it isn't the usual. A part of
 * your own (Material: Wood / Metal) for the odd one. The name a usual one gets shows as you change things.
 */
export function PartsEditor({ kind, initial }: { kind: UnitKind; initial: UnitPart[] }) {
  const noun = kind === "window" ? "window" : "door";
  const [parts, setParts] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [newChoice, setNewChoice] = useState<Record<string, string>>({});
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
  const sample = readSizeCode(kind === "window" ? "3050" : "2868")!;
  const usualName = unitName(kind, parts, sample, usualValues(parts));

  return (
    <div className="max-w-4xl space-y-4">
      <Card>
        <CardHeader
          title={`What a ${noun} is described by`}
          description={`When you add a ${noun} to a job's list on the takeoff, you give its size and pick one of these for each part that's asked. Picks, never typing — so the same ${noun} gets the same name, and is the same Item List item, on every job.`}
        />
        <CardBody className="space-y-3">
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            A usual {noun} is named <strong className="font-semibold text-slate-900">{usualName}</strong>
          </p>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            <li className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <span className="w-28 shrink-0 font-medium text-slate-900">Size</span>
              <span className="text-slate-500">Always asked — typed the usual way ({kind === "window" ? "3050" : "2868"}).</span>
            </li>
            {parts.map((p) => (
              <li key={p.key} className={cn("space-y-2 px-3 py-3 text-sm", !p.ask && "bg-slate-50/60")}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="w-28 shrink-0 font-medium text-slate-900">{p.name}</span>
                  <label className={cn("flex items-center gap-1.5", lockedAsk(p) ? "text-slate-400" : "text-slate-700")}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={p.ask}
                      disabled={lockedAsk(p)}
                      onChange={(e) => change(p.key, { ask: e.target.checked })}
                    />
                    Ask for it
                  </label>
                  {p.ask && p.kind === "pick" ? (
                    <>
                      <label className="flex items-center gap-1.5 text-slate-700">
                        Usual
                        <select className="input !h-8 !w-auto !py-0 text-sm" value={p.usual} onChange={(e) => change(p.key, { usual: e.target.value })}>
                          {p.usual === "" || !p.choices.length ? <option value="">—</option> : null}
                          {p.choices.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-1.5 text-slate-700">
                        In the name
                        <select
                          className="input !h-8 !w-auto !py-0 text-sm"
                          value={p.inName}
                          onChange={(e) => change(p.key, { inName: e.target.value === "unusual" ? "unusual" : "always" })}
                        >
                          <option value="always">Always</option>
                          <option value="unusual">Only when it isn&apos;t the usual</option>
                        </select>
                      </label>
                    </>
                  ) : null}
                  {p.ask && p.kind === "yesno" ? (
                    <span className="text-xs text-slate-500">
                      A tick box — &ldquo;{p.name}&rdquo; is in the name when it&apos;s ticked.{" "}
                      <label className="ml-2 inline-flex items-center gap-1 text-slate-700">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-slate-300"
                          checked={p.usual === "Yes"}
                          onChange={(e) => change(p.key, { usual: e.target.checked ? "Yes" : "No" })}
                        />
                        Ticked to start
                      </label>
                    </span>
                  ) : null}
                  {!p.builtIn ? (
                    <button
                      type="button"
                      className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500 hover:text-rose-600"
                      onClick={() => {
                        if (window.confirm(`Take ${p.name} off? ${noun[0].toUpperCase()}${noun.slice(1)}s already on the Item List keep it in their name.`))
                          setParts((list) => list.filter((x) => x.key !== p.key));
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  ) : null}
                </div>
                {lockedAsk(p) ? <p className="text-xs text-slate-500">Always asked — it files the door as interior or exterior, for its cost code and the bid list.</p> : null}
                {p.ask && p.kind === "pick" && !lockedChoices(p) ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {p.choices.map((c) => (
                      <span key={c} className={cn("inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-xs", c === p.usual ? "bg-blue-100 text-blue-900" : "bg-slate-100 text-slate-700")}>
                        {c}
                        <button type="button" className="rounded-full p-0.5 text-slate-400 hover:text-rose-600" aria-label={`Take ${c} off ${p.name}`} onClick={() => removeChoice(p, c)}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <span className="inline-flex items-center gap-1">
                      <input
                        className="input !h-7 !w-36 !px-2 !py-0 text-xs"
                        placeholder="Add a choice"
                        aria-label={`Add a ${p.name.toLowerCase()} choice`}
                        maxLength={40}
                        value={newChoice[p.key] ?? ""}
                        onChange={(e) => setNewChoice((x) => ({ ...x, [p.key]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addChoice(p);
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="rounded-md p-1 text-blue-700 hover:bg-blue-50 disabled:opacity-40"
                        disabled={!tidy(newChoice[p.key])}
                        aria-label={`Add the ${p.name.toLowerCase()} choice`}
                        onClick={() => addChoice(p)}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </span>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>

          {own.length < MAX_OWN_PARTS ? (
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-slate-300 p-3">
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                A part of your own
                <input
                  className="input !w-48"
                  placeholder={kind === "window" ? "Grids" : "Material"}
                  maxLength={40}
                  value={newPart.name}
                  onChange={(e) => setNewPart({ ...newPart, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addPart();
                    }
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                Answered with
                <select className="input !w-auto" value={newPart.as} onChange={(e) => setNewPart({ ...newPart, as: e.target.value === "yesno" ? "yesno" : "pick" })}>
                  <option value="pick">Choices you pick from</option>
                  <option value="yesno">A tick box (yes / no)</option>
                </select>
              </label>
              <Button type="button" variant="secondary" onClick={addPart} disabled={!tidy(newPart.name)}>
                <Plus className="h-4 w-4" /> Add part
              </Button>
              <p className="w-full text-xs text-slate-500">
                {kind === "window"
                  ? "For something only some windows have: a part like Glass (Clear, Low-E, Obscure), with Clear as the usual and in the name only when it isn't."
                  : "For the door that isn't normal: a part like Material (Wood, Metal, Fiberglass), with Wood as the usual and in the name only when it isn't — every wood door keeps its name, the odd one says Metal."}
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
            <Button type="button" onClick={save} disabled={busy || !changed}>
              {busy ? "Saving…" : "Save"}
            </Button>
            {note && !changed ? <span className="text-sm font-medium text-emerald-700">{note}</span> : null}
            {changed ? <span className="text-sm text-amber-700">Not saved yet</span> : null}
            {error ? <span className="text-sm text-rose-700">{error}</span> : null}
          </div>
          <p className="text-xs text-slate-500">
            Changes are for {noun}s added from now on. {noun[0].toUpperCase()}
            {noun.slice(1)}s already on jobs and the Item List keep their names. New choices can also be added right from a job&apos;s {noun} list on the takeoff (+ Add a choice…).
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
