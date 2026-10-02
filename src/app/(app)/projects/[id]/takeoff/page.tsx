import Link from "next/link";
import { Ruler, FileText, ClipboardList, RefreshCw, LayoutTemplate, Printer, Image as ImageIcon, Send, Plus, Pencil, Layers } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject, activeCostCodes } from "@/lib/projects";
import { cn, costCodeLabel, linePrice, money, num } from "@/lib/utils";
import { conditionEstimateLines, conditionTotals, loadConditions } from "@/lib/takeoff-data";
import { materialItemOptions } from "@/lib/material-items";
import { syncAutoItems } from "@/lib/walls";
import { templateOptions } from "@/lib/takeoff-templates";
import {
  CONDITION_COLORS,
  CONDITION_TYPE_LABELS,
  DEFAULT_OPENING_OPTIONS,
  DEFAULT_WALL_OPTIONS,
  METRICS_BY_TYPE,
  boardPatternText,
  feetInches,
  isLumberMetric,
  isMemberType,
  metricLabel,
  metricUnit,
  openingSummary,
  parseOptions,
  wallSummary,
  type ConditionType,
} from "@/lib/takeoff";
import { Badge, Card, CardBody, CardHeader, Collapsible, ConfirmForm, EmptyState, Stat, SubmitButton, Table, TBody, TFoot, THead, Td, Th, Tr, buttonClasses } from "@/components/ui";
import { ConditionForm } from "./_components/condition-form";
import { AssemblyForm } from "./_components/assembly-form";
import { PlanUpload } from "./_components/plan-upload";
import {
  renamePlan,
  deletePlan,
  createCondition,
  updateCondition,
  deleteCondition,
  createAssemblyItem,
  updateAssemblyItem,
  deleteAssemblyItem,
  sendToEstimate,
  applyTakeoffTemplate,
  saveTakeoffAsTemplate,
} from "./actions";

export default async function TakeoffPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; edit?: string; editItem?: string; renamePlan?: string; applied?: string; skipped?: string }>;
}) {
  const user = await requireStaff();
  const isAdmin = user.role === "ADMIN";
  const { id } = await params;
  const { tab: tabParam, edit, editItem, renamePlan: renamePlanId, applied, skipped } = await searchParams;
  const project = await getProject(id);
  // Joist / rafter lumber lines follow the layout (also covers layouts drawn before this existed).
  await syncAutoItems(project.id);
  const base = `/projects/${project.id}/takeoff`;

  const [plans, conditions, costCodes, drafts, company, items, memberSizes, templates] = await Promise.all([
    db.takeoffPlan.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "asc" },
      include: {
        file: { select: { size: true } },
        sheets: { orderBy: { pageNumber: "asc" }, include: { _count: { select: { measurements: true } } } },
      },
    }),
    loadConditions(project.id),
    activeCostCodes(),
    db.estimate.findMany({ where: { projectId: project.id, status: "DRAFT" }, orderBy: { version: "desc" }, select: { id: true, name: true, version: true } }),
    db.company.findFirst({ select: { defaultMarkup: true } }),
    materialItemOptions(),
    db.memberSize.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, kind: true, soldAs: true, stockLengths: true } }),
    templateOptions(),
  ]);
  const defaultMarkup = company?.defaultMarkup ?? 20;
  const rows = conditions.map((c) => {
    const totals = conditionTotals(c);
    const lines = conditionEstimateLines(c, totals);
    return { c, totals, lines, price: lines.reduce((s, l) => s + linePrice(l), 0) };
  });
  const allLines = rows.flatMap((r) => r.lines.map((l) => ({ ...l, condition: r.c })));
  const sheetCount = plans.reduce((s, p) => s + p.sheets.length, 0);
  const scaledCount = plans.reduce((s, p) => s + p.sheets.filter((sh) => sh.unitsPerFoot).length, 0);
  const shapeCount = conditions.reduce((s, c) => s + c.measurements.length, 0);
  const totalPrice = rows.reduce((s, r) => s + r.price, 0);
  // Plans | Conditions | Estimate — one section at a time.
  const tab: "plans" | "conditions" | "estimate" =
    tabParam === "plans" || tabParam === "conditions" || tabParam === "estimate"
      ? tabParam
      : edit || editItem || applied !== undefined
        ? "conditions"
        : renamePlanId
          ? "plans"
          : plans.length === 0
            ? "plans"
            : "conditions";
  const condHref = `${base}?tab=conditions`;
  const tabLink = (key: typeof tab, label: string, count?: number) => (
    <Link
      href={`${base}?tab=${key}`}
      className={cn(
        "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium",
        tab === key ? "border-blue-700 text-blue-800" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
      )}
    >
      {label}
      {typeof count === "number" ? <span className="rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-600">{count}</span> : null}
    </Link>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link href={`${base}/materials`} className={buttonClasses("secondary")}>
          <ClipboardList className="h-4 w-4" /> Material list
        </Link>
        <Link href={`${base}/rebid`} className={buttonClasses("secondary")}>
          <RefreshCw className="h-4 w-4" /> Rebid at current prices
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Plans" value={plans.length} hint={`${sheetCount} sheet${sheetCount === 1 ? "" : "s"}`} />
        <Stat label="Sheets scaled" value={`${scaledCount} / ${sheetCount}`} tone={sheetCount > 0 && scaledCount < sheetCount ? "warn" : "default"} />
        <Stat label="Conditions" value={conditions.length} hint={`${shapeCount} measurement${shapeCount === 1 ? "" : "s"}`} />
        <Stat label="Takeoff price" value={money(totalPrice, true)} hint="Incl. markup, before sending to an estimate" />
      </div>

      <nav className="-mb-2 flex gap-1 border-b border-slate-200">
        {tabLink("plans", "Plans", plans.length)}
        {tabLink("conditions", "Conditions", conditions.length)}
        {tabLink("estimate", "Estimate")}
      </nav>

      {/* Plans ------------------------------------------------------------- */}
      {tab === "plans" ? (
      <Card>
        <CardHeader title="Plans" description="Upload plan sets, set each sheet's scale, then measure on them." />
        <CardBody className="space-y-4">
          <PlanUpload projectId={project.id} />

          {plans.length === 0 ? (
            <EmptyState icon={Ruler} title="No plans yet" description="Drop a PDF plan set above to start your takeoff." />
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {plans.map((plan) => (
                <li key={plan.id} className="space-y-3 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {plan.kind === "PDF" ? <FileText className="h-5 w-5 text-rose-500" /> : <ImageIcon className="h-5 w-5 text-violet-600" />}
                    {renamePlanId === plan.id ? (
                      <form action={renamePlan} className="flex items-center gap-2">
                        <input type="hidden" name="projectId" value={project.id} />
                        <input type="hidden" name="id" value={plan.id} />
                        <input name="name" defaultValue={plan.name} required className="input !w-72" aria-label="Plan name" autoFocus />
                        <SubmitButton size="sm">Save</SubmitButton>
                        <Link href={`${base}?tab=plans`} className={buttonClasses("ghost", "sm")}>
                          Cancel
                        </Link>
                      </form>
                    ) : (
                      <Link href={`${base}/${plan.id}`} className="font-medium text-slate-900 hover:text-blue-700">
                        {plan.name}
                      </Link>
                    )}
                    <span className="text-xs text-slate-500">
                      {plan.pageCount ? `${plan.pageCount} sheet${plan.pageCount === 1 ? "" : "s"}` : "Pages counted when first opened"} · {(plan.file.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      <Link href={`${base}/${plan.id}`} className={buttonClasses("primary", "sm")}>
                        <Ruler className="h-3.5 w-3.5" /> Measure
                      </Link>
                      <Link href={`${base}/${plan.id}/print?pages=all`} className={buttonClasses("ghost", "sm")} title="Print or save the measured sheets with the takeoff drawn on them">
                        <Printer className="h-3.5 w-3.5" /> Print
                      </Link>
                      <Link href={`${base}?tab=plans&renamePlan=${plan.id}`} className={buttonClasses("ghost", "sm")}>
                        Rename
                      </Link>
                      <ConfirmForm
                        action={deletePlan}
                        hidden={{ projectId: project.id, id: plan.id }}
                        message={`Delete "${plan.name}"? Every measurement on it is removed and the file is deleted from Files and storage.`}
                        variant="ghost"
                      >
                        <span className="text-xs text-rose-600">Delete</span>
                      </ConfirmForm>
                    </div>
                  </div>
                  {plan.sheets.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {plan.sheets.map((sh) => (
                        <Link
                          key={sh.id}
                          href={`${base}/${plan.id}?page=${sh.pageNumber}`}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:border-blue-300 hover:bg-blue-50"
                        >
                          <span className="font-medium">{sh.name}</span>
                          <span className={cn("ml-1.5", sh.unitsPerFoot ? "text-slate-500" : "text-amber-700")}>{sh.unitsPerFoot ? sh.scaleLabel : "no scale"}</span>
                          {sh._count.measurements ? <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-600">{sh._count.measurements}</span> : null}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      ) : null}

      {/* Conditions -------------------------------------------------------- */}
      {tab === "conditions" ? (
      <Card>
        <CardHeader
          title={<span id="conditions" className="scroll-mt-24">Conditions</span>}
          description="What you measure. A condition with assembly items sends those items to the estimate; otherwise it sends itself."
        />
        <CardBody className="space-y-4">
          {applied !== undefined ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Added {applied} condition{applied === "1" ? "" : "s"} from the template
              {skipped && skipped !== "0" ? ` · ${skipped} skipped (already on this job)` : ""}.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <LayoutTemplate className="h-4 w-4 text-slate-400" />
            {templates.length === 0 ? (
              <span className="text-sm text-slate-500">
                No takeoff templates yet.{isAdmin ? " Save this job's conditions as one below, or build one in Settings → Takeoff templates." : " An admin can create them in Settings."}
              </span>
            ) : (
              <form action={applyTakeoffTemplate} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="projectId" value={project.id} />
                <select name="templateId" aria-label="Takeoff template" className="input !h-8 !w-64 !py-0 text-sm" defaultValue="">
                  <option value="" disabled>
                    Add conditions from a template…
                  </option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t._count.conditions})
                    </option>
                  ))}
                </select>
                <SubmitButton size="sm" pendingText="Adding…">
                  Add
                </SubmitButton>
              </form>
            )}
            {isAdmin && conditions.length > 0 ? (
              <details className="ml-auto">
                <summary className="cursor-pointer text-xs font-medium text-blue-700 [&::-webkit-details-marker]:hidden">Save as template…</summary>
                <form action={saveTakeoffAsTemplate} className="mt-2 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="projectId" value={project.id} />
                  <input name="name" placeholder="New template name" className="input !h-8 !w-56 !py-0 text-sm" aria-label="New template name" />
                  {templates.length ? (
                    <select name="replaceId" aria-label="Or replace a template" className="input !h-8 !w-56 !py-0 text-sm" defaultValue="">
                      <option value="">…or replace an existing one</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          Replace “{t.name}”
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <SubmitButton size="sm" variant="secondary" pendingText="Saving…">
                    Save {conditions.length} condition{conditions.length === 1 ? "" : "s"}
                  </SubmitButton>
                </form>
              </details>
            ) : null}
          </div>
          {rows.length === 0 ? (
            <EmptyState icon={Layers} title="No conditions yet" description="Add a condition below (e.g. “LVP Flooring”, “Exterior Walls”, “2x10 Floor Joists”), then measure it on a plan." />
          ) : (
            <div className="space-y-3">
              {rows.map(({ c, totals, lines, price }) => {
                const editing = edit === c.id;
                return (
                  <div key={c.id} id={`condition-${c.id}`} className="scroll-mt-24 rounded-xl border border-slate-200">
                    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span className="h-3.5 w-3.5 shrink-0 rounded-sm" style={{ background: c.color }} />
                      <span className="font-medium text-slate-900">{c.name}</span>
                      <Badge>{CONDITION_TYPE_LABELS[c.type as ConditionType] ?? c.type}</Badge>
                      {c.pitch > 0 ? (
                        <Badge>
                          {num(c.pitch, 2)}/12
                          {c.type === "HIP_VALLEY" && c.pitch2 != null && c.pitch2 !== c.pitch ? ` & ${num(c.pitch2, 2)}/12` : ""} pitch
                        </Badge>
                      ) : null}
                      {(isMemberType(c.type) || c.type === "WALL") && c.memberSize ? <Badge>{c.memberSize}</Badge> : null}
                      {c.type === "FRAMING" ? <Badge>{num(c.spacing, 2)}&quot; o.c.</Badge> : null}
                      <span className="ml-auto text-right">
                        <span className="block text-sm font-semibold tabular-nums text-slate-900">
                          {num(totals.quantity)} {totals.unit}
                          {c.wastePct > 0 ? <span className="font-normal text-slate-500"> → {num(totals.quantityWithWaste)} w/ {num(c.wastePct, 1)}% waste</span> : null}
                        </span>
                        <span className="block text-xs text-slate-500">{metricLabel(c.metric)} · {money(price)}</span>
                      </span>
                      <Link href={editing ? `${condHref}#condition-${c.id}` : `${condHref}&edit=${c.id}#condition-${c.id}`} className={buttonClasses("ghost", "sm")}>
                        <Pencil className="h-3.5 w-3.5" /> {editing ? "Close" : "Edit"}
                      </Link>
                      {c.type === "WALL" || c.type === "OPENING" ? (
                        <p className="basis-full pl-6 text-xs text-slate-500">
                          {c.type === "WALL"
                            ? wallSummary({ studSize: c.memberSize, spacing: c.spacing, heightFt: c.height }, parseOptions(c.options, DEFAULT_WALL_OPTIONS))
                            : openingSummary(c.memberSize, parseOptions(c.options, DEFAULT_OPENING_OPTIONS))}
                        </p>
                      ) : null}
                    </div>
                    {totals.unscaledShapes > 0 ? (
                      <p className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                        {totals.unscaledShapes} measurement{totals.unscaledShapes === 1 ? " is" : "s are"} on sheets without a scale and count as zero until the scale is set.
                      </p>
                    ) : null}
                    {editing ? (
                      <div className="space-y-5 border-t border-slate-100 bg-slate-50/50 px-4 py-4">
                        <ConditionForm
                          action={updateCondition}
                          hidden={{ projectId: project.id }}
                          costCodes={costCodes}
                          memberSizes={memberSizes}
                          itemOptions={items}
                          defaultMarkup={defaultMarkup}
                          values={{
                            id: c.id,
                            name: c.name,
                            type: c.type,
                            metric: c.metric,
                            color: c.color,
                            group: c.group,
                            costCodeId: c.costCodeId,
                            unitCost: c.unitCost,
                            markupPct: c.markupPct,
                            wastePct: c.wastePct,
                            pitch: c.pitch,
                            pitchMode: c.pitchMode,
                            pitch2: c.pitch2,
                            height: c.height,
                            depth: c.depth,
                            spacing: c.spacing,
                            overhang: c.overhang,
                            memberSize: c.memberSize,
                            memberSizeId: c.memberSizeId,
                            options: c.options,
                            stockLengths: c.stockLengths,
                          }}
                          hasMeasurements={c.measurements.length > 0}
                          cancelHref={`${condHref}#condition-${c.id}`}
                        />

                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <p className="label">All quantities</p>
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                              {METRICS_BY_TYPE[c.type as ConditionType]?.map((m) => (
                                <div key={m} className="contents">
                                  <dt className="text-slate-500">{metricLabel(m)}</dt>
                                  <dd className="text-right tabular-nums text-slate-900">{num(totals.metrics[m])}</dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                          <div>
                            <p className="label">By sheet</p>
                            {totals.bySheet.length === 0 ? (
                              <p className="text-sm text-slate-500">Not measured yet.</p>
                            ) : (
                              <ul className="space-y-1 text-sm">
                                {totals.bySheet.map((s) => (
                                  <li key={s.sheetId} className="flex justify-between gap-3">
                                    <Link href={`${base}/${s.planId}?page=${s.pageNumber}`} className="truncate text-blue-700 hover:underline">
                                      {s.label}
                                    </Link>
                                    <span className={cn("tabular-nums", s.unscaled ? "text-amber-700" : "text-slate-900")}>
                                      {s.unscaled ? "no scale" : `${num(s.metrics[c.metric as keyof typeof s.metrics])} ${totals.unit}`}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {totals.cutList.length > 0 ? (
                              <>
                                <p className="label mt-3">{totals.boards.length ? "Cut sheet" : "Cut list"}</p>
                                {totals.boards.length ? (
                                  <ul className="space-y-0.5 text-sm text-slate-700">
                                    {totals.boards.map((b, i) => (
                                      <li key={i} className="tabular-nums">
                                        {b.count} × {boardPatternText(b)}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-sm text-slate-700">{totals.cutList.map(([len, n]) => `${n} × ${c.memberSize ? `${c.memberSize} ` : ""}@ ${c.memberSizeRef?.soldAs === "EXACT_LF" ? feetInches(len) : `${num(len)}'`}`).join(" · ")}</p>
                                )}
                              </>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <ConfirmForm
                            action={deleteCondition}
                            hidden={{ projectId: project.id, id: c.id }}
                            message={`Delete "${c.name}" and its ${c.measurements.length} measurement${c.measurements.length === 1 ? "" : "s"}? Lines already on an estimate stay there.`}
                          >
                            Delete condition
                          </ConfirmForm>
                        </div>
                      </div>
                    ) : null}

                    {/* Assembly items */}
                    <div className="border-t border-slate-100 px-4 py-3">
                      {c.items.length > 0 ? (
                        <table className="mb-3 w-full text-sm">
                          <thead className="text-xs uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="py-1 text-left font-medium">Assembly item</th>
                              <th className="py-1 text-left font-medium">Formula</th>
                              <th className="py-1 text-right font-medium">Qty</th>
                              <th className="py-1 text-right font-medium">Price</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {c.items.map((item) => {
                              const line = lines.find((l) => l.itemId === item.id);
                              if (editItem === item.id) {
                                return (
                                  <tr key={item.id}>
                                    <td colSpan={5} className="py-3">
                                      <AssemblyForm action={updateAssemblyItem} hidden={{ projectId: project.id }} condition={c} costCodes={costCodes} items={items} values={item} cancelHref={`${condHref}#condition-${c.id}`} />
                                    </td>
                                  </tr>
                                );
                              }
                              return (
                                <tr key={item.id}>
                                  <td className="py-1.5 text-slate-900">
                                    {item.description}
                                    {item.costCode ? <span className="block text-xs text-slate-500">{costCodeLabel(item.costCode)}</span> : null}
                                  </td>
                                  <td className="py-1.5 text-xs text-slate-600">
                                    {isLumberMetric(item.metric) ? (
                                      <>
                                        {c.type === "WALL" ? "From the walls" : c.type === "OPENING" ? "From the openings" : c.type === "HIP_VALLEY" ? "From the traced lines" : `From the ${c.name.toLowerCase().includes("rafter") ? "rafter" : "joist"} layout`}
                                        {item.wastePct > 0 ? ` + ${num(item.wastePct, 1)}% waste` : ""}
                                        {item.unitCost === 0 ? <span className="block text-amber-700">No price yet — set it in Settings → Item List</span> : null}
                                      </>
                                    ) : (
                                      <>
                                        {num(item.qty, 4)} {item.unit} per {num(item.per, 4)} {metricUnit(item.metric)} of {metricLabel(item.metric).replace(/ \(.*\)$/, "").toLowerCase()}
                                        {item.wastePct > 0 ? ` + ${num(item.wastePct, 1)}%` : ""}
                                        {item.roundUp ? " · round up" : ""}
                                      </>
                                    )}
                                  </td>
                                  <td className="py-1.5 text-right tabular-nums text-slate-900">
                                    {num(line?.quantity ?? 0)} {item.unit}
                                  </td>
                                  <td className="py-1.5 text-right tabular-nums text-slate-900">{money(line ? linePrice(line) : 0)}</td>
                                  <td className="py-1.5 text-right">
                                    {isLumberMetric(item.metric) ? (
                                      <span className="text-xs text-slate-400">Auto</span>
                                    ) : (
                                    <div className="flex justify-end gap-1">
                                      <Link href={`${condHref}&editItem=${item.id}#condition-${c.id}`} className={buttonClasses("ghost", "sm")}>
                                        Edit
                                      </Link>
                                      <ConfirmForm action={deleteAssemblyItem} hidden={{ projectId: project.id, id: item.id }} message={`Remove "${item.description}"?`} variant="ghost">
                                        <span className="text-xs text-rose-600">Remove</span>
                                      </ConfirmForm>
                                    </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : null}
                      <details>
                        <summary className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-blue-700 [&::-webkit-details-marker]:hidden">
                          <Plus className="h-3.5 w-3.5" /> {isMemberType(c.type) || c.type === "WALL" || c.type === "OPENING" ? "Add an add-on item (hangers, ties, blocking, sheathing…)" : "Add assembly item"}
                        </summary>
                        <div className="mt-3">
                          <AssemblyForm action={createAssemblyItem} hidden={{ projectId: project.id }} condition={c} costCodes={costCodes} items={items} />
                        </div>
                      </details>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Collapsible
            defaultOpen={conditions.length === 0}
            summary={
              <span className="flex items-center gap-2">
                <Plus className="h-4 w-4" /> New condition
              </span>
            }
          >
            <ConditionForm
              action={createCondition}
              hidden={{ projectId: project.id }}
              costCodes={costCodes}
              memberSizes={memberSizes}
              itemOptions={items}
              defaultMarkup={defaultMarkup}
              nextColor={CONDITION_COLORS[conditions.length % CONDITION_COLORS.length]}
            />
          </Collapsible>
        </CardBody>
      </Card>
      ) : null}

      {/* Send to estimate -------------------------------------------------------- */}
      {tab === "estimate" ? (
      <Card>
        <CardHeader
          title="Send to estimate"
          description="Adds these lines to a draft estimate. Sending again updates the lines that came from the takeoff (quantities, pricing, cost codes) and removes ones that no longer apply."
        />
        <CardBody className="space-y-4">
          {allLines.length === 0 ? (
            <p className="text-sm text-slate-500">Add conditions to build estimate lines.</p>
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Line</Th>
                  <Th>Cost code</Th>
                  <Th right>Qty</Th>
                  <Th right>Unit cost</Th>
                  <Th right>Markup</Th>
                  <Th right>Price</Th>
                </tr>
              </THead>
              <TBody>
                {allLines.map((l) => {
                  const cc = l.itemId ? l.condition.items.find((i) => i.id === l.itemId)?.costCode : l.condition.costCode;
                  return (
                    <Tr key={`${l.conditionId}:${l.itemId}`}>
                      <Td>
                        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: l.condition.color }} />
                        {l.description}
                      </Td>
                      <Td className="text-xs text-slate-500">{cc ? costCodeLabel(cc) : "—"}</Td>
                      <Td right>
                        {num(l.quantity)} {l.unit}
                      </Td>
                      <Td right>{money(l.unitCost)}</Td>
                      <Td right>{num(l.markupPct, 1)}%</Td>
                      <Td right>{money(linePrice(l))}</Td>
                    </Tr>
                  );
                })}
              </TBody>
              <TFoot>
                <tr>
                  <td colSpan={5} className="px-4 py-2.5">
                    Total
                  </td>
                  <Td right>{money(totalPrice)}</Td>
                </tr>
              </TFoot>
            </Table>
          )}
          {drafts.length === 0 ? (
            <p className="text-sm text-slate-500">
              No draft estimate to send to.{" "}
              <Link href={`/projects/${project.id}/estimate`} className="text-blue-700 underline">
                Create one on the Estimate tab
              </Link>
              .
            </p>
          ) : (
            <form action={sendToEstimate} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="projectId" value={project.id} />
              <select name="estimateId" aria-label="Draft estimate" className="input !w-72" defaultValue={drafts[0].id}>
                {drafts.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} v{e.version} (draft)
                  </option>
                ))}
              </select>
              <SubmitButton disabled={allLines.length === 0} pendingText="Sending…">
                <Send className="h-4 w-4" /> Send to estimate
              </SubmitButton>
            </form>
          )}
        </CardBody>
      </Card>
      ) : null}
    </div>
  );
}
