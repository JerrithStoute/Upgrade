import { notFound } from "next/navigation";
import { Check, Star, Lock } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPortalProject, portalHref } from "@/lib/portal";
import { cn, fmtDate, fmtDateTime, money } from "@/lib/utils";
import { Badge, Card, CardBody, CardHeader, PageHeader, SubmitButton, EmptyState } from "@/components/ui";
import { chooseOption, approveSelection } from "../../actions";

export const metadata = { title: "Selection" };

export default async function PortalSelectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireClient();
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

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Selections", href: portalHref("/portal/selections", project.id) }, { label: selection.category }]}
        title={selection.title}
        meta={<Badge status={selection.status} />}
        description={[selection.location, `Allowance ${money(selection.allowance)}`, selection.dueDate ? `Due ${fmtDate(selection.dueDate)}` : null].filter(Boolean).join(" · ")}
      />

      <div className="space-y-6">
        {selection.description ? (
          <Card>
            <CardBody>
              <p className="whitespace-pre-line text-sm text-slate-700">{selection.description}</p>
            </CardBody>
          </Card>
        ) : null}

        {/* Status banner */}
        {selection.status === "PENDING" ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
            Pick the option you&apos;d like below. You&apos;ll be able to review and approve it before it&apos;s final.
          </div>
        ) : null}
        {selection.status === "CHOSEN" && chosen ? (
          <Card className="border-sky-200">
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  You chose <span className="font-semibold">{chosen.name}</span> · {money(chosen.price)}
                </p>
                <p className="text-xs text-slate-500">
                  Chosen {fmtDateTime(selection.chosenAt)}.
                  {diff !== null && Math.abs(diff) > 0.005
                    ? diff > 0
                      ? ` This is ${money(diff)} over your allowance and will be billed as a change.`
                      : ` This is ${money(Math.abs(diff))} under your allowance.`
                    : " This is within your allowance."}{" "}
                  You can still change your choice below before approving.
                </p>
              </div>
              <form action={approveSelection}>
                <input type="hidden" name="selectionId" value={selection.id} />
                <SubmitButton variant="success" pendingText="Approving…">
                  <Check className="h-4 w-4" /> Approve selection
                </SubmitButton>
              </form>
            </CardBody>
          </Card>
        ) : null}
        {locked ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-900">
            <Lock className="h-4 w-4" />
            This selection is {selection.status.toLowerCase()}
            {selection.approvedAt ? ` (approved ${fmtDate(selection.approvedAt)})` : ""} and can no longer be changed. Contact your project manager if you need to revisit it.
          </div>
        ) : null}

        <Card>
          <CardHeader title="Options" description={`${selection.options.length} option${selection.options.length === 1 ? "" : "s"} prepared by your team`} />
          <CardBody>
            {selection.options.length === 0 ? (
              <EmptyState title="No options yet" description="Your team is still putting options together for this item." />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {selection.options.map((o) => {
                  const isChosen = o.id === selection.chosenOptionId;
                  const delta = o.price - selection.allowance;
                  return (
                    <div
                      key={o.id}
                      className={cn(
                        "flex flex-col overflow-hidden rounded-xl border bg-white",
                        isChosen ? "border-blue-600 ring-2 ring-blue-600/20" : "border-slate-200",
                        locked && !isChosen && "opacity-60",
                      )}
                    >
                      {o.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={o.imageUrl} alt={o.name} className="h-40 w-full object-cover" />
                      ) : (
                        <div className="grid h-24 place-items-center bg-slate-50 text-xs text-slate-400">No image</div>
                      )}
                      <div className="flex flex-1 flex-col p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{o.name}</p>
                          {o.isRecommended ? (
                            <Badge className="bg-violet-50 text-violet-800 ring-violet-200">
                              <Star className="mr-1 h-3 w-3" /> Recommended
                            </Badge>
                          ) : null}
                          {isChosen ? (
                            <Badge className="bg-blue-50 text-blue-800 ring-blue-200">
                              <Check className="mr-1 h-3 w-3" /> {selection.status === "CHOSEN" ? "Your choice" : "Selected"}
                            </Badge>
                          ) : null}
                        </div>
                        {o.vendor || o.modelNumber ? (
                          <p className="mt-0.5 text-xs text-slate-500">{[o.vendor, o.modelNumber ? `Model ${o.modelNumber}` : null].filter(Boolean).join(" · ")}</p>
                        ) : null}
                        {o.description ? <p className="mt-2 text-sm text-slate-600">{o.description}</p> : null}
                        <div className="mt-3 flex items-baseline justify-between">
                          <p className="text-lg font-semibold tabular-nums text-slate-900">{money(o.price)}</p>
                          <p className={cn("text-xs font-medium tabular-nums", Math.abs(delta) <= 0.005 ? "text-slate-500" : delta > 0 ? "text-rose-700" : "text-emerald-700")}>
                            {Math.abs(delta) <= 0.005 ? "At allowance" : delta > 0 ? `+${money(delta)} over allowance` : `${money(Math.abs(delta))} under allowance`}
                          </p>
                        </div>
                        {canChoose ? (
                          <form action={chooseOption} className="mt-4">
                            <input type="hidden" name="selectionId" value={selection.id} />
                            <input type="hidden" name="optionId" value={o.id} />
                            <SubmitButton variant={isChosen ? "secondary" : "primary"} size="sm" className="w-full" disabled={isChosen} pendingText="Saving…">
                              {isChosen ? "Currently chosen" : "Select this option"}
                            </SubmitButton>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
