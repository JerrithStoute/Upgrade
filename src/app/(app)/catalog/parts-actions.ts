"use server";

import { revalidatePath } from "next/cache";
import { requireEdit } from "@/lib/auth";
import { cleanParts, type UnitKind, type UnitPart } from "@/lib/unit-parts";
import { loadUnitParts, saveUnitParts } from "@/lib/unit-parts-server";

/** Catalog → Doors / Windows: the parts as set on the page (checked — built-in ones can't go, Int / Ext is always asked). */
export async function saveParts(input: { kind: UnitKind; parts: Partial<UnitPart>[] }): Promise<{ ok: true; parts: UnitPart[] } | { ok: false; error: string }> {
  await requireEdit("lists");
  const kind: UnitKind = input.kind === "window" ? "window" : "door";
  if (!Array.isArray(input.parts)) return { ok: false, error: "Nothing to save" };
  const current = await loadUnitParts(kind);
  const parts = cleanParts(kind, input.parts.slice(0, 40));
  const empty = parts.find((p) => p.ask && p.kind === "pick" && !p.choices.length);
  if (empty) return { ok: false, error: `Give ${empty.name} at least one choice, or turn it off` };
  await saveUnitParts(kind, { ...current, parts });
  revalidatePath(`/catalog/${kind}s`);
  return { ok: true, parts };
}
