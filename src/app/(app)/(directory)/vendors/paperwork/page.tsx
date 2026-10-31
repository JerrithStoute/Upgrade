import Link from "@/components/link";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { requireView } from "@/lib/auth";
import { allows } from "@/lib/access";
import { db } from "@/lib/db";
import { companyPositions } from "@/lib/positions";
import { readWho } from "@/lib/paperwork";
import { paperTypes } from "@/lib/paperwork-server";
import { ConfirmForm, PageHeader, SubmitButton } from "@/components/ui";
import { WhoPicker } from "@/components/who-picker";
import { addPaperType, deletePaperType, savePaperType, setPaperworkOwner } from "./actions";

export const metadata = { title: "Paperwork settings" };

/**
 * Directory → Subs & vendors → Paperwork settings: the kinds of paper you track (W-9 and Insurance built in, your
 * own besides), which ones a new vendor starts needing, and who on your team handles it.
 */
export default async function PaperworkSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireView("lists");
  const canEdit = user.role === "ADMIN" || allows(user.access, "lists", 2);
  const { saved } = await searchParams;
  const [types, positions, people, company, counts] = await Promise.all([
    paperTypes(),
    companyPositions(),
    db.user.findMany({ where: { active: true, role: { in: ["ADMIN", "STAFF"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.company.findFirst({ select: { paperworkOwner: true } }),
    db.vendorDoc.groupBy({ by: ["typeId"], _count: { _all: true } }),
  ]);
  const filesOn = new Map(counts.map((c) => [c.typeId, c._count._all]));

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <Link href="/vendors" className="text-xs text-slate-500 hover:text-slate-800">
          ← Subs & vendors
        </Link>
        <PageHeader
          title="Paperwork settings"
          description="The papers you want from subs and vendors. Each vendor's page shows a line for each one they need — drop the file on it."
        />
      </div>
      {saved ? (
        <p className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> {saved}.
        </p>
      ) : null}

      <KindList
        title="Paperwork you ask for"
        note="“New subs need it” ticks it for every vendor you add from now on. On each vendor's page, “Need it” on each line sets what you need from them."
        types={types.filter((t) => t.kind !== "INSURANCE")}
        coverage={false}
        canEdit={canEdit}
        filesOn={filesOn}
      />
      <KindList
        title="Insurance coverages you track"
        note="Each coverage is its own line on a sub's page, with its carrier, policy # and expiry. Tick only what most of your subs carry — then tick it on the subs who do."
        types={types.filter((t) => t.kind === "INSURANCE")}
        coverage
        canEdit={canEdit}
        filesOn={filesOn}
      />

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-100 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-900">Who handles it</h2>
          <p className="text-xs text-slate-500">
            Shown beside each sub on the dashboard&apos;s Paperwork list, so you know who to ask when one sits there. The weekly paperwork email is in{" "}
            <Link href="/settings/notifications#paperworkWeekly" className="text-blue-700 hover:underline">
              Settings → Email notifications
            </Link>{" "}
            (off until you turn it on).
          </p>
        </header>
        <form action={setPaperworkOwner} className="space-y-3 px-4 py-3">
          <WhoPicker idPrefix="owner" positions={positions} people={people} value={readWho(company?.paperworkOwner)} />
          {canEdit ? (
            <SubmitButton size="sm" variant="secondary">
              Save
            </SubmitButton>
          ) : null}
        </form>
      </section>
    </div>
  );
}

/** One list on this page — your paperwork kinds, or your coverages — each editable, with a way to add one. */
function KindList({
  title,
  note,
  types,
  coverage,
  canEdit,
  filesOn,
}: {
  title: string;
  note: string;
  types: { id: string; name: string; kind: string | null; expires: boolean; usual: boolean }[];
  coverage: boolean;
  canEdit: boolean;
  filesOn: Map<string, number>;
}) {
  const small = "!h-7 !px-2.5 !text-xs";
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500">{note}</p>
      </header>
      <ul className="divide-y divide-slate-100">
        {types.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm">
            <form action={savePaperType} className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2">
              <input type="hidden" name="id" value={t.id} />
              <input name="name" defaultValue={t.name} aria-label="Name" maxLength={60} disabled={!canEdit} className="input !h-7 !w-56 !py-0 text-sm" />
              {coverage ? null : (
                <label className={`flex items-center gap-1.5 text-xs ${t.kind ? "text-slate-400" : "text-slate-700"}`}>
                  <input type="checkbox" name="expires" defaultChecked={t.expires} disabled={!canEdit || !!t.kind} className="h-3.5 w-3.5 rounded border-slate-300" />
                  Has an expiry date
                </label>
              )}
              <label className="flex items-center gap-1.5 text-xs text-slate-700">
                <input type="checkbox" name="usual" defaultChecked={t.usual} disabled={!canEdit} className="h-3.5 w-3.5 rounded border-slate-300" />
                New subs need it
              </label>
              {canEdit ? (
                <SubmitButton size="sm" variant="secondary" className={small}>
                  Save
                </SubmitButton>
              ) : null}
            </form>
            {canEdit && t.kind !== "W9" ? (
              <ConfirmForm
                action={deletePaperType}
                hidden={{ id: t.id }}
                message={`Take ${t.name} off?${filesOn.get(t.id) ? ` The ${filesOn.get(t.id)} paper(s) vendors have on it go too.` : ""}`}
                variant="ghost"
              >
                <Trash2 className="h-3.5 w-3.5 text-rose-600" aria-label={`Remove ${t.name}`} />
              </ConfirmForm>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <form action={addPaperType} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-dashed border-slate-200 px-4 py-2.5 text-sm">
          {coverage ? <input type="hidden" name="coverage" value="1" /> : null}
          <input
            name="name"
            required
            maxLength={60}
            placeholder={coverage ? "Builder's risk" : "Contractor agreement"}
            aria-label={coverage ? "New coverage" : "New kind of paper"}
            className="input !h-7 !w-56 !py-0 text-sm"
          />
          {coverage ? null : (
            <label className="flex items-center gap-1.5 text-xs text-slate-700">
              <input type="checkbox" name="expires" className="h-3.5 w-3.5 rounded border-slate-300" />
              Has an expiry date
            </label>
          )}
          <label className="flex items-center gap-1.5 text-xs text-slate-700">
            <input type="checkbox" name="usual" className="h-3.5 w-3.5 rounded border-slate-300" />
            New subs need it
          </label>
          <SubmitButton size="sm" className={small}>
            <Plus className="h-3.5 w-3.5" /> Add
          </SubmitButton>
        </form>
      ) : null}
    </section>
  );
}
