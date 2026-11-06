"use client";

import { useState } from "react";
import { ChevronRight, Copy, Plus } from "lucide-react";
import { ConfirmForm, SubmitButton } from "@/components/ui";
import { cn, costCodeLabel, money, num } from "@/lib/utils";
import type { CodeRules } from "@/lib/code-groups";
import { isLumberMetric, metricUnit, type ConditionType } from "@/lib/takeoff";
import { Section } from "../../_components/mini";
import { ConditionForm, type ConditionFormValues, type MemberSizeOption } from "../../_components/condition-form";
import { AssemblyForm, type AssemblyFormValues, type ItemOption } from "../../_components/assembly-form";
import {
  copyCondition,
  createAssemblyItem,
  createCondition,
  deleteAssemblyItem,
  deleteCondition,
  updateAssemblyItem,
  updateCondition,
} from "../../actions";

export type DrawerCondition = ConditionFormValues & {
  hasMeasurements: boolean;
  items: (AssemblyFormValues & { costCode: { code: string | null; name: string } | null })[];
};

/**
 * Edit a condition (settings + assembly / add-on items) without leaving the plan.
 * Saving changes keeps the panel open ("Saved" shows); adding a new one closes it. The viewer
 * re-keys this panel when the items change, which closes any open item form.
 */
export function ConditionDrawer({
  projectId,
  condition,
  costCodes,
  codeRules,
  memberSizes,
  items,
  nextColor,
  toolbox,
  spanTables,
  closeHref,
  stayHref,
  newType,
  onCancel,
}: {
  projectId: string;
  condition: DrawerCondition | null; // null = new condition
  costCodes: { id: string; code: string | null; name: string }[];
  codeRules: CodeRules;
  memberSizes: MemberSizeOption[];
  items: ItemOption[];
  nextColor: string;
  toolbox?: { id: string; name: string }[];
  spanTables?: { id: string; name: string; use: string }[];
  closeHref: string; // the viewer without the panel
  stayHref: string; // the viewer with this panel open
  /** A new takeoff: the type picked from New takeoff ▾. */
  newType?: ConditionType;
  /** Cancel does this instead of just closing (Change items' copy, not saved yet). */
  onCancel?: () => void;
}) {
  const [editItem, setEditItem] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const isMember =
    condition?.type === "FRAMING" ||
    condition?.type === "HIP_VALLEY" ||
    condition?.type === "BEAM" ||
    condition?.type === "WALL" ||
    condition?.type === "OPENING" ||
    condition?.type === "DOOR" ||
    condition?.type === "WINDOW";

  return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-[min(100%,32rem)] flex-col border-l border-slate-200 bg-white shadow-2xl">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <ConditionForm
          title={condition ? `Edit ${condition.name}` : "New takeoff"}
          initialType={newType}
          headExtra={
            condition ? (
              // A roof with several pitches: copy it (items and all, as last saved), change the pitch, measure.
              <SubmitButton
                formAction={copyCondition}
                formNoValidate
                variant="secondary"
                size="xs"
                pendingText="Copying…"
                title="A new takeoff with the same settings and items (none of the shapes), as last saved — e.g. for another pitch"
              >
                <Copy className="h-3.5 w-3.5" /> Make a copy
              </SubmitButton>
            ) : null
          }
          action={condition ? updateCondition : createCondition}
          // Saving changes keeps the panel open (Save to Library is right below); a new takeoff closes it, to measure.
          hidden={condition ? { projectId, returnTo: stayHref, stay: "1" } : { projectId, returnTo: closeHref }}
          costCodes={costCodes}
          codeRules={codeRules}
          memberSizes={memberSizes}
          itemOptions={items}
          assemblyItems={items}
          toolbox={toolbox}
          spanTables={spanTables}
          values={condition ?? undefined}
          hasMeasurements={condition?.hasMeasurements}
          cancelHref={closeHref}
          onCancel={onCancel}
          nextColor={nextColor}
        />

        {condition ? (
          <Section title={isMember ? "Add-ons" : "Orders"} className="mt-3">
            {condition.items.length === 0 && !adding ? (
              <p className="pt-1.5 text-xs text-slate-500">{isMember ? "None — hangers, ties, blocking…" : "Nothing yet — until it has an item, it's a measurement only (not on the estimate)."}</p>
            ) : null}
            {condition.items.length ? (
              <ul className="border-t border-slate-100">
                {condition.items.map((item) => {
                  const auto = isLumberMetric(item.metric);
                  const recipe = auto
                    ? "from the drawing"
                    : `${num(item.qty, 4)} ${item.unit} per ${num(item.per, 4)} ${metricUnit(item.metric)}${item.roundUp ? " · round up" : ""}${item.wastePct > 0 ? ` · ${num(item.wastePct, 1)}% waste` : ""}`;
                  const line = (
                    <>
                      <span className="min-w-0 flex-1 truncate text-slate-900">{item.description}</span>
                      <span className="shrink-0 text-slate-500">{recipe}</span>
                      <span className="w-20 shrink-0 text-right tabular-nums text-slate-700">
                        {money(item.unitCost)}/{item.unit}
                      </span>
                    </>
                  );
                  const facts = [item.costCode ? costCodeLabel(item.costCode) : "No cost code", item.pricePinned ? "this job only" : null].filter(Boolean).join(" · ");
                  return (
                    <li key={item.id} className="border-b border-slate-100">
                      {auto ? (
                        <div className="flex min-h-8 items-center gap-2 text-xs" title={`Added from the drawing; priced from Catalog → Item List · ${facts}`}>
                          {line}
                          <span className="w-8 shrink-0 text-right text-slate-400">Auto</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          aria-expanded={editItem === item.id}
                          title={facts}
                          className="flex min-h-8 w-full items-center gap-2 text-left text-xs hover:bg-slate-50"
                          onClick={() => {
                            setAdding(false);
                            setEditItem(editItem === item.id ? null : item.id);
                          }}
                        >
                          {line}
                          <ChevronRight className={cn("h-3.5 w-8 shrink-0 text-slate-400 transition-transform", editItem === item.id && "rotate-90")} />
                        </button>
                      )}
                      {editItem === item.id ? (
                        <div className="pb-2">
                          <AssemblyForm
                            action={updateAssemblyItem}
                            removeAction={deleteAssemblyItem}
                            hidden={{ projectId, returnTo: stayHref }}
                            condition={{ id: condition.id, type: condition.type, metric: condition.metric }}
                            costCodes={costCodes}
                            items={items}
                            values={item}
                            onCancel={() => setEditItem(null)}
                          />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {adding ? (
              <AssemblyForm
                action={createAssemblyItem}
                hidden={{ projectId, returnTo: stayHref }}
                condition={{ id: condition.id, type: condition.type, metric: condition.metric }}
                costCodes={costCodes}
                items={items}
                onCancel={() => setAdding(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditItem(null);
                  setAdding(true);
                }}
                className="inline-flex h-7 items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Add an item
              </button>
            )}
          </Section>
        ) : null}

        {condition ? (
          <div className="flex justify-end border-t border-slate-100 pt-3">
            <ConfirmForm
              action={deleteCondition}
              hidden={{ projectId, id: condition.id, returnTo: closeHref }}
              message={`Delete "${condition.name}" and all of its measurements? Lines already on an estimate stay there.`}
            >
              Delete takeoff…
            </ConfirmForm>
          </div>
        ) : null}
      </div>
    </div>
  );
}
