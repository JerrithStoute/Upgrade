"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { ConfirmForm, buttonClasses } from "@/components/ui";
import { costCodeLabel, money, num } from "@/lib/utils";
import { isLumberMetric, metricLabel, metricUnit } from "@/lib/takeoff";
import { ConditionForm, type ConditionFormValues, type MemberSizeOption } from "../../_components/condition-form";
import { AssemblyForm, type AssemblyFormValues, type ItemOption } from "../../_components/assembly-form";
import { createAssemblyItem, createCondition, deleteAssemblyItem, deleteCondition, updateAssemblyItem, updateCondition } from "../../actions";

export type DrawerCondition = ConditionFormValues & {
  markupPct: number;
  hasMeasurements: boolean;
  items: (AssemblyFormValues & { costCode: { code: string | null; name: string } | null })[];
};

/**
 * Edit a condition (settings + assembly / add-on items) without leaving the plan.
 * Saving the condition closes the panel; item changes keep it open. The viewer
 * re-keys this panel when the items change, which closes any open item form.
 */
export function ConditionDrawer({
  projectId,
  condition,
  costCodes,
  memberSizes,
  items,
  defaultMarkup,
  nextColor,
  closeHref,
  stayHref,
}: {
  projectId: string;
  condition: DrawerCondition | null; // null = new condition
  costCodes: { id: string; code: string | null; name: string }[];
  memberSizes: MemberSizeOption[];
  items: ItemOption[];
  defaultMarkup: number;
  nextColor: string;
  closeHref: string; // the viewer without the panel
  stayHref: string; // the viewer with this panel open
}) {
  const [editItem, setEditItem] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const isMember = condition?.type === "FRAMING" || condition?.type === "HIP_VALLEY" || condition?.type === "WALL" || condition?.type === "OPENING";

  return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-[min(100%,34rem)] flex-col border-l border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        {condition ? <span className="h-3.5 w-3.5 rounded-sm" style={{ background: condition.color }} /> : null}
        <p className="flex-1 truncate font-semibold text-slate-900">{condition ? `Edit ${condition.name}` : "New condition"}</p>
        <Link href={closeHref} scroll={false} className={buttonClasses("ghost", "sm")} aria-label="Close">
          <X className="h-4 w-4" />
        </Link>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <ConditionForm
          action={condition ? updateCondition : createCondition}
          hidden={{ projectId, returnTo: closeHref }}
          costCodes={costCodes}
          memberSizes={memberSizes}
          itemOptions={items}
          defaultMarkup={defaultMarkup}
          values={condition ?? undefined}
          hasMeasurements={condition?.hasMeasurements}
          cancelHref={closeHref}
          nextColor={nextColor}
        />

        {condition ? (
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <p className="label">{isMember ? "Lumber & add-on items" : "Assembly items"}</p>
            {condition.items.length === 0 ? <p className="text-xs text-slate-500">None yet.</p> : null}
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {condition.items.map((item) =>
                editItem === item.id ? (
                  <li key={item.id} className="p-3">
                    <AssemblyForm
                      action={updateAssemblyItem}
                      hidden={{ projectId, returnTo: stayHref }}
                      condition={{ id: condition.id, type: condition.type, metric: condition.metric, markupPct: condition.markupPct }}
                      costCodes={costCodes}
                      items={items}
                      values={item}
                      onCancel={() => setEditItem(null)}
                    />
                  </li>
                ) : (
                  <li key={item.id} className="flex items-start gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-slate-900">{item.description}</span>
                      <span className="block text-xs text-slate-500">
                        {isLumberMetric(item.metric)
                          ? "From the layout · price in Settings → Item List"
                          : `${num(item.qty, 4)} ${item.unit} per ${num(item.per, 4)} ${metricUnit(item.metric)} of ${metricLabel(item.metric).replace(/ \(.*\)$/, "").toLowerCase()}`}
                        {" · "}
                        {money(item.unitCost)}/{item.unit}
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
              <div className="rounded-lg border border-slate-200 p-3">
                <AssemblyForm
                  action={createAssemblyItem}
                  hidden={{ projectId, returnTo: stayHref }}
                  condition={{ id: condition.id, type: condition.type, metric: condition.metric, markupPct: condition.markupPct }}
                  costCodes={costCodes}
                  items={items}
                  onCancel={() => setAdding(false)}
                />
              </div>
            ) : (
              <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-xs font-medium text-blue-700">
                <Plus className="h-3.5 w-3.5" /> {isMember ? "Add an add-on item (hangers, ties, blocking, sheathing…)" : "Add assembly item"}
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
              Delete condition
            </ConfirmForm>
          </div>
        ) : null}
      </div>
    </div>
  );
}
