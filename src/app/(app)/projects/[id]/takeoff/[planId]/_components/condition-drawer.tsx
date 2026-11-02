"use client";

import { useState } from "react";
import { Copy, Plus } from "lucide-react";
import { ConfirmForm, SubmitButton, buttonClasses } from "@/components/ui";
import { costCodeLabel, money, num } from "@/lib/utils";
import type { CodeRules } from "@/lib/code-groups";
import { isLumberMetric, metricLabel, metricUnit, type ConditionType } from "@/lib/takeoff";
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
  pricesLocked,
  nextColor,
  toolbox,
  spanTables,
  closeHref,
  stayHref,
  newType,
}: {
  projectId: string;
  condition: DrawerCondition | null; // null = new condition
  costCodes: { id: string; code: string | null; name: string }[];
  codeRules: CodeRules;
  memberSizes: MemberSizeOption[];
  items: ItemOption[];
  /** This job's prices are locked. */
  pricesLocked?: boolean;
  nextColor: string;
  toolbox?: { id: string; name: string }[];
  spanTables?: { id: string; name: string; use: string }[];
  closeHref: string; // the viewer without the panel
  stayHref: string; // the viewer with this panel open
  /** A new takeoff: the type picked from New takeoff ▾. */
  newType?: ConditionType;
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
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4">
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
          nextColor={nextColor}
        />

        {condition ? (
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-800">{isMember ? "Lumber and add-on items" : "What it orders"}</p>
            {condition.items.length === 0 ? (
              <p className="text-xs text-slate-500">{isMember ? "None yet." : "None yet — until it has one, this takeoff is a measurement only (not on the estimate)."}</p>
            ) : null}
            <ul className="divide-y divide-slate-100 border-y border-slate-100">
              {condition.items.map((item) =>
                editItem === item.id ? (
                  <li key={item.id} className="py-3">
                    <AssemblyForm
                      action={updateAssemblyItem}
                      hidden={{ projectId, returnTo: stayHref }}
                      condition={{ id: condition.id, type: condition.type, metric: condition.metric }}
                      costCodes={costCodes}
                      items={items}
                      values={item}
                      pricesLocked={pricesLocked}
                      onCancel={() => setEditItem(null)}
                    />
                  </li>
                ) : (
                  <li key={item.id} className="flex items-start gap-2 py-1.5 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-slate-900">{item.description}</span>
                      <span className="block text-xs text-slate-500">
                        {isLumberMetric(item.metric)
                          ? `From the layout · price in Catalog → Item List${item.metric.startsWith("pieces:") ? " · extra boards from the takeoff's waste %" : item.wastePct > 0 ? ` · ${num(item.wastePct, 1)}% waste from the takeoff` : ""}`
                          : `${num(item.qty, 4)} ${item.unit} per ${num(item.per, 4)} ${metricUnit(item.metric)} of ${metricLabel(item.metric)
                              .replace(/ \(.*\)$/, "")
                              .toLowerCase()}`}
                        {" · "}
                        {money(item.unitCost)}/{item.unit}
                        {item.pricePinned ? " · this job only" : ""}
                        {item.costCode ? ` · ${costCodeLabel(item.costCode)}` : ""}
                      </span>
                    </span>
                    {isLumberMetric(item.metric) ? (
                      <span className="pt-0.5 text-xs text-slate-400">Auto</span>
                    ) : (
                      <span className="flex shrink-0 items-center gap-1">
                        <button type="button" className={buttonClasses("ghost", "sm")} onClick={() => setEditItem(item.id)}>
                          Edit
                        </button>
                        <ConfirmForm action={deleteAssemblyItem} hidden={{ projectId, id: item.id, returnTo: stayHref }} message={`Remove "${item.description}"?`} variant="ghost">
                          <span className="text-xs text-rose-600">Remove</span>
                        </ConfirmForm>
                      </span>
                    )}
                  </li>
                ),
              )}
            </ul>
            {adding ? (
              <div className="rounded-md bg-slate-50 p-3">
                <AssemblyForm
                  action={createAssemblyItem}
                  hidden={{ projectId, returnTo: stayHref }}
                  condition={{ id: condition.id, type: condition.type, metric: condition.metric }}
                  costCodes={costCodes}
                  items={items}
                  pricesLocked={pricesLocked}
                  onCancel={() => setAdding(false)}
                />
              </div>
            ) : (
              <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-xs font-medium text-blue-700">
                <Plus className="h-3.5 w-3.5" /> {isMember ? "Add an add-on item (hangers, ties, blocking…)" : "Add an item"}
              </button>
            )}
          </div>
        ) : null}

        {condition ? (
          <div className="flex justify-end border-t border-slate-100 pt-4">
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
