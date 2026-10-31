import Link from "@/components/link";
import { CheckCircle2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { companyPositions } from "@/lib/positions";
import { summarizeAccess } from "@/lib/access";
import { cn } from "@/lib/utils";
import { ConfirmForm, PageHeader, SubmitButton } from "@/components/ui";
import { AccessFields } from "@/components/settings/access-fields";
import { createPosition, deletePosition, savePosition } from "../actions";

export const metadata = { title: "Positions" };

const small = "!h-7 !px-2.5 !text-xs";

/**
 * Directory → Team → Positions: what each position sees and changes. Change a position and everyone in it changes;
 * one person is changed on their own page ("Change just for them"). Admins always have everything.
 */
export default async function PositionsPage({ searchParams }: { searchParams: Promise<{ position?: string; saved?: string }> }) {
  await requireAdmin();
  const { position: openId, saved } = await searchParams;
  const positions = await companyPositions();
  const open = positions.find((p) => p.id === openId);
  const staffPos = positions.find((p) => p.key === "STAFF") ?? positions[0];

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <Link href="/team" className="text-xs text-slate-500 hover:text-slate-800">
          ← Team
        </Link>
        <PageHeader
          title="Positions"
          description="What each position sees and changes. Change a position and everyone in it changes; change one person on their own page. Admins always have everything, and only admins see pay or change Settings."
        />
      </div>
      {saved ? (
        <p className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> Saved.
        </p>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <ul className="divide-y divide-slate-100">
          {positions.map((p) => (
            <li key={p.id} className={cn("px-4 py-2.5", p.id === open?.id && "bg-blue-50/40")}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-slate-900">{p.name}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {p._count.users} {p._count.users === 1 ? "person" : "people"}
                  </span>
                  <span className="block text-xs text-slate-500">{summarizeAccess(p.accessOf)}</span>
                </span>
                {p.id !== open?.id ? (
                  <Link href={`/team/positions?position=${p.id}`} className="text-xs font-medium text-blue-700 hover:underline">
                    Edit
                  </Link>
                ) : null}
                <ConfirmForm action={deletePosition} hidden={{ id: p.id }} variant="ghost" message={`Remove the position "${p.name}"?`}>
                  <span className="text-xs text-rose-600">Remove</span>
                </ConfirmForm>
              </div>
              {p.id === open?.id ? (
                <form action={savePosition} className="mt-3 space-y-3">
                  <input type="hidden" name="id" value={p.id} />
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500">Name</span>
                    <input name="name" defaultValue={p.name} required className="input !h-8 !w-64 !py-0 text-sm" />
                  </label>
                  <AccessFields value={p.accessOf} />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <SubmitButton size="sm" className={small}>
                      Save
                    </SubmitButton>
                    <Link href="/team/positions" className="inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      Cancel
                    </Link>
                    <span className="text-xs text-slate-500">
                      {p._count.users === 1 ? "1 person is" : `${p._count.users} people are`} in this position — they all change.
                    </span>
                  </div>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        <form action={createPosition} className="flex flex-wrap items-center gap-1.5 border-t border-dashed border-slate-200 px-4 py-2.5">
          <input name="name" required placeholder="Superintendent" aria-label="New position" className="input !h-7 !w-56 !py-0 text-xs" />
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            starting as a copy of
            <select name="from" defaultValue={staffPos?.id} className="input !h-7 !w-auto !py-0 text-xs">
              {positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <SubmitButton size="sm" className={small}>
            Add position
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
