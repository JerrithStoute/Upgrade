import Link from "@/components/link";
import { Plus, Ruler } from "lucide-react";
import { db } from "@/lib/db";
import { groupBy } from "@/lib/finance";
import { cn, num } from "@/lib/utils";
import { MEMBER_KINDS, MEMBER_KIND_LABELS, SOLD_AS, SOLD_AS_LABELS } from "@/lib/takeoff";
import { ConfirmForm, EmptyState, SubmitButton } from "@/components/ui";
import { ListFind } from "@/components/list-find";
import { createMemberSize, deleteMemberSize, updateMemberSize } from "./actions";
import { requireView } from "@/lib/auth";

type SizeValues = {
  id: string;
  name: string;
  kind: string;
  widthIn: number;
  depthIn: number;
  soldAs: string;
  stockLengths: string | null;
  boardFeet: boolean;
  color: string | null;
};

const PATH = "/catalog/member-sizes";
const SOLD_AS_SHORT: Record<string, string> = { STOCK: "Stock lengths", EXACT_LF: "Made to order · even feet · per lf", LF: "Lineal feet" };
const box = "input !h-7 !py-0 text-xs";
const lbl = "mb-0.5 block text-[11px] text-slate-500";
const link = "text-xs font-medium text-blue-700 hover:underline";

/**
 * Adding or changing one size: two short lines of boxes (name, kind, sold as; then the actual size, stock lengths,
 * board feet and its color), Cancel at the top. Delete sits beside Save, in its own form.
 */
function SizeForm({ action, values }: { action: (fd: FormData) => Promise<void>; values?: SizeValues }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900">{values ? `Edit ${values.name}` : "Add a member size"}</span>
        <Link href={PATH} scroll={false} className={link}>
          Cancel
        </Link>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <form action={action} className="w-full space-y-2">
          {values ? <input type="hidden" name="id" value={values.id} /> : null}
          <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-[2fr_1.2fr_1.4fr]">
            <label>
              <span className={lbl}>Name</span>
              <input name="name" required autoFocus={!values} className={box} defaultValue={values?.name} placeholder='TJI 210 11-7/8"' />
            </label>
            <label>
              <span className={lbl}>Kind</span>
              <select name="kind" className={box} defaultValue={values?.kind ?? "I_JOIST"}>
                {MEMBER_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {MEMBER_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={lbl}>Sold as</span>
              <select name="soldAs" className={box} defaultValue={values?.soldAs ?? "STOCK"}>
                {SOLD_AS.map((k) => (
                  <option key={k} value={k}>
                    {SOLD_AS_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid items-end gap-2 sm:grid-cols-3 md:grid-cols-[1fr_1fr_1.2fr_auto_auto]">
            <label>
              <span className={lbl}>Width (in)</span>
              <input name="widthIn" type="number" step="0.0625" min="0.25" className={box} defaultValue={values?.widthIn ?? 2.0625} title="Actual flange / thickness" />
            </label>
            <label>
              <span className={lbl}>Depth (in)</span>
              <input name="depthIn" type="number" step="0.0625" min="0.25" className={box} defaultValue={values?.depthIn ?? 11.875} title="Actual depth" />
            </label>
            <label>
              <span className={lbl}>Stock lengths (ft)</span>
              <input name="stockLengths" className={box} defaultValue={values?.stockLengths ?? ""} placeholder="8-24" title="For stock-length sizes, e.g. 8-24 or 24-48" />
            </label>
            <label className="flex h-7 items-center gap-1.5 whitespace-nowrap text-xs text-slate-700" title="Shows board feet on the Material List">
              <input type="checkbox" name="boardFeet" defaultChecked={values?.boardFeet ?? false} className="h-4 w-4 rounded border-slate-300" />
              Board feet
            </label>
            <span className="flex h-7 items-center gap-1.5 whitespace-nowrap text-xs text-slate-700" title="Joist and rafter takeoffs of this size use it, on every job">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" name="useColor" defaultChecked={!!values?.color} className="h-4 w-4 rounded border-slate-300" />
                Color
              </label>
              <input aria-label="Color" type="color" name="color" defaultValue={values?.color ?? "#ea580c"} className="h-6 w-8 cursor-pointer rounded border border-slate-300 bg-white p-0.5" />
            </span>
          </div>
          <SubmitButton size="sm" className="!h-7 !px-2.5 !text-xs">
            {values ? "Save size" : "Add size"}
          </SubmitButton>
        </form>
        {values ? (
          // Its own form (no forms inside forms), on Save's line.
          <ConfirmForm
            action={deleteMemberSize}
            hidden={{ id: values.id }}
            message={`Delete "${values.name}"? Takeoffs using it keep the name but lose its settings.`}
            variant="ghost"
            className="-mt-9 ml-auto"
          >
            <span className="text-xs text-rose-600">Delete size…</span>
          </ConfirmForm>
        ) : null}
      </div>
    </div>
  );
}

export default async function MemberSizesPage({ searchParams }: { searchParams: Promise<{ edit?: string; add?: string }> }) {
  await requireView("lists");
  const { edit, add } = await searchParams;
  const sizes = await db.memberSize.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { conditions: true, templateConditions: true } } },
  });
  const order = MEMBER_KINDS as readonly string[];
  const groups = groupBy(
    [...sizes].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)),
    (s) => MEMBER_KIND_LABELS[s.kind as keyof typeof MEMBER_KIND_LABELS] ?? s.kind,
  );
  // Nothing on the list yet: the Add box is open to start.
  const adding = add === "1" || sizes.length === 0;
  const cell = "px-3 py-2 align-top";

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <ListFind listId="size-list" placeholder="Find a size…" />
        <Link
          href={`${PATH}?add=1`}
          scroll={false}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-blue-700 px-2.5 text-xs font-medium text-white hover:bg-blue-800"
        >
          <Plus className="h-3.5 w-3.5" /> Add size
        </Link>
      </header>
      {adding ? (
        <div className="border-b border-slate-100 bg-blue-50/40 px-4 py-3">
          <SizeForm action={createMemberSize} />
        </div>
      ) : null}
      <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
        <strong className="font-medium text-slate-700">Sold as</strong> decides how they reach the Material List and estimate: stock pieces priced each (2x6 × 20&apos;),
        made to order per length rounded up to even feet and priced per lf (open-web trusses), or one lineal-foot total. Prices are on the Item List under Framing Lumber.
      </p>

      {sizes.length === 0 ? (
        <EmptyState icon={Ruler} title="No member sizes yet" description="Add the lumber, I-joists and trusses you frame with." />
      ) : (
        <div id="size-list">
          <div className="@container overflow-x-auto" data-find-group>
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-100 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 pl-4 font-normal">Size</th>
                  <th className="px-3 py-2 font-normal">Actual</th>
                  <th className="px-3 py-2 font-normal">Sold as</th>
                  <th className="px-3 py-2 font-normal">Stock lengths</th>
                  <th className="px-3 py-2 text-right font-normal" title="Takeoffs and templates using it">
                    Used
                  </th>
                  <th className="px-3 py-2 pr-4" />
                </tr>
              </thead>
              {groups.map(([kind, rows]) => (
                // One tbody per kind: it hides, heading and all, when the find box leaves nothing in it.
                <tbody key={kind} className="border-b border-slate-100 last:border-b-0 [&:not(:has([data-find]:not([hidden])))]:hidden">
                  <tr className="bg-slate-50/70">
                    <td colSpan={6} className="px-4 py-1.5 text-xs font-semibold text-slate-700">
                      {kind}
                    </td>
                  </tr>
                  {rows.map((s) =>
                    edit === s.id ? (
                      <tr key={s.id} id={`size-${s.id}`} data-find={`${s.name} ${kind}`.toLowerCase()} className="border-t border-slate-100">
                        <td colSpan={6} className="bg-blue-50/40 p-0">
                          <div className="sticky left-0 w-[100cqw] max-w-full px-4 py-3">
                            <SizeForm action={updateMemberSize} values={s} />
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={s.id} data-find={`${s.name} ${kind}`.toLowerCase()} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className={cn(cell, "pl-4")}>
                          <span id={`size-${s.id}`} className="flex scroll-mt-24 items-center gap-2 font-medium text-slate-900">
                            {s.color ? <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} title="Its color on the plan" /> : null}
                            {s.name}
                          </span>
                        </td>
                        <td className={cn(cell, "text-xs text-slate-500")}>
                          {num(s.widthIn, 4)}&quot; × {num(s.depthIn, 4)}&quot;{s.boardFeet ? " · board feet" : ""}
                        </td>
                        <td className={cn(cell, "text-xs text-slate-600")}>{SOLD_AS_SHORT[s.soldAs] ?? s.soldAs}</td>
                        <td className={cn(cell, "text-xs text-slate-600")}>{s.soldAs === "STOCK" ? s.stockLengths || "even lengths from 8'" : "—"}</td>
                        <td className={cn(cell, "text-right text-xs tabular-nums text-slate-500")}>{s._count.conditions + s._count.templateConditions}</td>
                        <td className={cn(cell, "pr-4 text-right")}>
                          <Link href={`${PATH}?edit=${s.id}#size-${s.id}`} scroll={false} className={link} aria-label={`Edit ${s.name}`}>
                            Edit
                          </Link>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              ))}
            </table>
            <p data-find-none hidden className="px-4 py-3 text-sm text-slate-500">
              None match.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
