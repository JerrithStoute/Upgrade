import { notFound } from "next/navigation";
import Link from "@/components/link";
import { Check, Star } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPortalProject, portalHref } from "@/lib/portal";
import { cn, fmtDate, money } from "@/lib/utils";
import { SubmitButton, EmptyState } from "@/components/ui";
import { chooseOption, approveSelection } from "../../actions";
import { companyClock } from "@/lib/company-zone";

export const metadata = { title: "Selection" };

export default async function PortalSelectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireClient();
  const { dateTime } = await companyClock();
  const { id } = await params;
  const selection = await db.selection.findFirst({
    where: { id, project: { clientId: user.clientId } },
    include: { options: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
  });
  if (!selection) notFound();
  const project = await getPortalProject(user.clientId, selection.projectId);

  const chosen = selection.options.find((o) => o.id === selection.chosenOptionId) ?? null;
  const canChoose = selection.status === "PENDING" || selection.status === "CHOSEN";
  const locked = !canChoose;
  const diff = chosen ? chosen.price - selection.allowance : null;

  const pill =
    selection.status === "PENDING"
      ? { label: "Choose one", tone: "bg-amber-50 text-amber-800" }
      : selection.status === "CHOSEN"
        ? { label: "Approve your choice", tone: "bg-amber-50 text-amber-800" }
        : selection.status === "DECLINED"
          ? { label: "Not wanted", tone: "bg-slate-100 text-slate-600" }
          : { label: selection.status === "ORDERED" ? "Ordered" : selection.status === "INSTALLED" ? "Installed" : "Approved", tone: "bg-emerald-50 text-emerald-800" };
  const overUnder = (d: number, long: boolean) =>
    Math.abs(d) <= 0.005
      ? long
        ? "Within your allowance"
        : "At allowance"
      : d > 0
        ? long
          ? `+${money(d)} over your allowance, added as a change`
          : `+${money(d)} over`
        : long
          ? `${money(Math.abs(d))} under your allowance, a credit`
          : `${money(Math.abs(d))} under`;
  const tone = (d: number) => (Math.abs(d) <= 0.005 ? "text-slate-500" : d > 0 ? "text-rose-700" : "text-emerald-700");

  return (
    <div className="space-y-4">
      <Link href={portalHref("/portal/selections", project.id)} className="inline-block text-sm font-medium text-blue-700 hover:underline">
        ← Selections
      </Link>

      <div className="flex flex-col items-start gap-4 lg:flex-row">
        {/* The short version and the Approve: first on a phone, beside the choices on a computer. */}
        <aside className="w-full shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm lg:sticky lg:top-32 lg:w-80">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-slate-500">{[selection.category, selection.location].filter(Boolean).join(" · ")}</span>
            <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-xs font-medium", pill.tone)}>{pill.label}</span>
          </div>
          <h1 className="mt-0.5 text-lg font-semibold text-slate-900">{selection.title}</h1>
          {selection.description ? <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{selection.description}</p> : null}
          <div className="mt-2 flex gap-6">
            <div>
              <p className="text-xs text-slate-500">Allowance</p>
              <p className="text-lg font-semibold tabular-nums text-slate-900">{money(selection.allowance)}</p>
            </div>
            {selection.dueDate && canChoose ? (
              <div>
                <p className="text-xs text-slate-500">Due</p>
                <p className="text-lg font-semibold text-slate-900">{fmtDate(selection.dueDate, "MMM d")}</p>
              </div>
            ) : null}
          </div>

          <div className="mt-3 border-t border-slate-100 pt-3">
            {selection.status === "PENDING" ? (
              <p className="text-sm text-slate-600">{selection.options.length ? "Pick one of the choices below." : "Your builder is still putting the choices together."}</p>
            ) : chosen ? (
              <>
                <p className="text-xs text-slate-500">Your choice</p>
                <p className="flex items-baseline justify-between gap-2 text-sm text-slate-900">
                  <span className="min-w-0">{chosen.name}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{money(chosen.price)}</span>
                </p>
                {diff !== null ? <p className={cn("text-xs", tone(diff))}>{overUnder(diff, true)}</p> : null}
                {selection.status === "CHOSEN" ? (
                  <form action={approveSelection} className="mt-3">
                    <input type="hidden" name="selectionId" value={selection.id} />
                    <SubmitButton variant="success" pendingText="Approving…" className="w-full justify-center">
                      <Check className="h-4 w-4" /> Approve this choice
                    </SubmitButton>
                    <p className="mt-1.5 text-xs text-slate-500">
                      Chosen {dateTime(selection.chosenAt)}. Once approved it&apos;s final — until then you can pick a different one{selection.options.length > 1 ? " below" : ""}.
                    </p>
                  </form>
                ) : (
                  <p className="mt-2 flex items-start gap-1.5 text-sm text-emerald-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" /> You approved this{selection.approvedAt ? ` ${fmtDate(selection.approvedAt, "MMM d, yyyy")}` : ""}.
                  </p>
                )}
              </>
            ) : selection.status === "DECLINED" ? (
              <p className="text-sm text-slate-600">You chose not to have this.</p>
            ) : null}
            {locked ? <p className="mt-1 text-xs text-slate-500">To change it now, contact your project manager.</p> : null}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {selection.options.length ? (
            <>
              <p className="mb-2 text-xs text-slate-500">
                {selection.options.length} choice{selection.options.length === 1 ? "" : "s"} from your builder
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {selection.options.map((o) => {
                  const isChosen = o.id === selection.chosenOptionId;
                  const delta = o.price - selection.allowance;
                  return (
                    <div
                      key={o.id}
                      className={cn(
                        "flex flex-col overflow-hidden rounded-xl bg-white shadow-sm",
                        isChosen ? "border-2 border-blue-600" : "border border-slate-200",
                        locked && !isChosen && "opacity-60",
                      )}
                    >
                      {o.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={o.imageUrl} alt={o.name} className="h-40 w-full object-cover" />
                      ) : null}
                      <div className="flex flex-1 flex-col px-3.5 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">{o.name}</p>
                          {isChosen ? (
                            <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-800">Your choice</span>
                          ) : o.isRecommended ? (
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-violet-50 px-1.5 py-0.5 text-xs font-medium text-violet-800">
                              <Star className="h-3 w-3" /> Recommended
                            </span>
                          ) : null}
                        </div>
                        {o.vendor || o.modelNumber ? (
                          <p className="text-xs text-slate-500">{[o.vendor, o.modelNumber ? `Model ${o.modelNumber}` : null].filter(Boolean).join(" · ")}</p>
                        ) : null}
                        {o.description ? <p className="mt-1.5 text-sm text-slate-600">{o.description}</p> : null}
                        <div className="mt-auto flex items-baseline justify-between pt-2">
                          <p className="font-semibold tabular-nums text-slate-900">{money(o.price)}</p>
                          <p className={cn("text-xs font-medium tabular-nums", tone(delta))}>{overUnder(delta, false)}</p>
                        </div>
                        {canChoose && !isChosen ? (
                          <form action={chooseOption} className="mt-2.5">
                            <input type="hidden" name="selectionId" value={selection.id} />
                            <input type="hidden" name="optionId" value={o.id} />
                            <SubmitButton variant="secondary" className="w-full justify-center" pendingText="Saving…">
                              Choose this one
                            </SubmitButton>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <EmptyState title="No choices yet" description="Your team is still putting choices together for this item." />
          )}
        </div>
      </div>
    </div>
  );
}
