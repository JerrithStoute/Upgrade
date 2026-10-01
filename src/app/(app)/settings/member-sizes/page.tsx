import Link from "next/link";
import { Pencil, Plus, Ruler } from "lucide-react";
import { db } from "@/lib/db";
import { groupBy } from "@/lib/finance";
import { num } from "@/lib/utils";
import { MEMBER_KINDS, MEMBER_KIND_LABELS, SOLD_AS, SOLD_AS_LABELS } from "@/lib/takeoff";
import { Collapsible, ConfirmForm, EmptyState, Field, FormGrid, SubmitButton, TBody, THead, Table, Td, Th, Tr, buttonClasses } from "@/components/ui";
import { createMemberSize, deleteMemberSize, updateMemberSize } from "./actions";

type SizeValues = { id: string; name: string; kind: string; widthIn: number; depthIn: number; soldAs: string; stockLengths: string | null; boardFeet: boolean };

const SOLD_AS_SHORT: Record<string, string> = { STOCK: "Stock lengths", EXACT_LF: "Exact length · per lf", LF: "Lineal feet" };

function SizeForm({ action, values }: { action: (fd: FormData) => Promise<void>; values?: SizeValues }) {
  const p = (k: string) => `size-${values?.id ?? "new"}-${k}`;
  return (
    <form action={action} className="space-y-4">
      {values ? <input type="hidden" name="id" value={values.id} /> : null}
      <FormGrid className="md:grid-cols-4">
        <Field label="Name" htmlFor={p("name")} className="md:col-span-2" hint='Shown on conditions, labels and the Material List, e.g. TJI 210 11-7/8"'>
          <input id={p("name")} name="name" required className="input" defaultValue={values?.name} placeholder='TJI 210 11-7/8"' />
        </Field>
        <Field label="Kind" htmlFor={p("kind")}>
          <select id={p("kind")} name="kind" className="input" defaultValue={values?.kind ?? "I_JOIST"}>
            {MEMBER_KINDS.map((k) => (
              <option key={k} value={k}>
                {MEMBER_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sold as" htmlFor={p("soldAs")}>
          <select id={p("soldAs")} name="soldAs" className="input" defaultValue={values?.soldAs ?? "STOCK"}>
            {SOLD_AS.map((k) => (
              <option key={k} value={k}>
                {SOLD_AS_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
      </FormGrid>
      <FormGrid className="md:grid-cols-4">
        <Field label="Actual width (in)" htmlFor={p("widthIn")} hint="Flange / thickness">
          <input id={p("widthIn")} name="widthIn" type="number" step="0.0625" min="0.25" className="input" defaultValue={values?.widthIn ?? 2.0625} />
        </Field>
        <Field label="Actual depth (in)" htmlFor={p("depthIn")}>
          <input id={p("depthIn")} name="depthIn" type="number" step="0.0625" min="0.25" className="input" defaultValue={values?.depthIn ?? 11.875} />
        </Field>
        <Field label="Default stock lengths (ft)" htmlFor={p("stockLengths")} hint="For stock-length sizes, e.g. 8-24 or 24-48">
          <input id={p("stockLengths")} name="stockLengths" className="input" defaultValue={values?.stockLengths ?? ""} placeholder="8-24" />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
          <input type="checkbox" name="boardFeet" defaultChecked={values?.boardFeet ?? false} className="h-4 w-4 rounded border-slate-300" />
          Report board feet
        </label>
      </FormGrid>
      <div className="flex items-center gap-2">
        <SubmitButton>{values ? "Save size" : "Add size"}</SubmitButton>
        {values ? (
          <Link href="/settings/member-sizes" className={buttonClasses("ghost")}>
            Cancel
          </Link>
        ) : null}
      </div>
    </form>
  );
}

export default async function MemberSizesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const sizes = await db.memberSize.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { conditions: true, templateConditions: true } } },
  });
  const order = MEMBER_KINDS as readonly string[];
  const groups = groupBy(
    [...sizes].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)),
    (s) => MEMBER_KIND_LABELS[s.kind as keyof typeof MEMBER_KIND_LABELS] ?? s.kind,
  );

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        Joist and rafter members you can pick on a takeoff condition. <strong>Sold as</strong> decides how they reach the Material List and estimate: stock-length pieces priced each
        (&ldquo;2x6 × 20&apos;&rdquo;), made-to-order members listed per exact length and priced per lf (open-web trusses), or one lineal-foot total. Prices live in the Item List under
        Framing Lumber.
      </p>
      <Collapsible
        defaultOpen={sizes.length === 0}
        summary={
          <span className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add member size
          </span>
        }
      >
        <SizeForm action={createMemberSize} />
      </Collapsible>

      {sizes.length === 0 ? (
        <EmptyState icon={Ruler} title="No member sizes yet" description="Add the lumber, I-joists and trusses you frame with." />
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>Size</Th>
              <Th>Actual</Th>
              <Th>Sold as</Th>
              <Th>Stock lengths</Th>
              <Th right>Used</Th>
              <Th />
            </tr>
          </THead>
          {groups.map(([kind, rows]) => (
            <TBody key={kind}>
              <tr className="bg-slate-50/70">
                <td colSpan={6} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {kind}
                </td>
              </tr>
              {rows.map((s) =>
                edit === s.id ? (
                  <tr key={s.id} id={`size-${s.id}`}>
                    <td colSpan={6} className="bg-slate-50/50 px-4 py-4">
                      <SizeForm action={updateMemberSize} values={s} />
                    </td>
                  </tr>
                ) : (
                  <Tr key={s.id}>
                    <Td>
                      <span id={`size-${s.id}`} className="scroll-mt-24 font-medium text-slate-900">
                        {s.name}
                      </span>
                    </Td>
                    <Td className="text-xs text-slate-500">
                      {num(s.widthIn, 4)}&quot; × {num(s.depthIn, 4)}&quot;{s.boardFeet ? " · board feet" : ""}
                    </Td>
                    <Td className="text-xs text-slate-600">{SOLD_AS_SHORT[s.soldAs] ?? s.soldAs}</Td>
                    <Td className="text-xs text-slate-600">{s.soldAs === "STOCK" ? s.stockLengths || "even lengths from 8'" : "—"}</Td>
                    <Td right className="text-xs text-slate-500">
                      {s._count.conditions + s._count.templateConditions}
                    </Td>
                    <Td right>
                      <div className="flex justify-end gap-1">
                        <Link href={`/settings/member-sizes?edit=${s.id}#size-${s.id}`} className={buttonClasses("ghost", "sm")}>
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Link>
                        <ConfirmForm action={deleteMemberSize} hidden={{ id: s.id }} message={`Delete "${s.name}"? Conditions using it keep the name but lose its settings.`} variant="ghost">
                          <span className="text-xs text-rose-600">Delete</span>
                        </ConfirmForm>
                      </div>
                    </Td>
                  </Tr>
                ),
              )}
            </TBody>
          ))}
        </Table>
      )}
    </div>
  );
}
