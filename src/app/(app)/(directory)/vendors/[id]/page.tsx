import Link from "@/components/link";
import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { allows } from "@/lib/access";
import { cn, fmtDate, money } from "@/lib/utils";
import { PO_STATUS_LABEL, billTotal, poTotal } from "@/lib/purchasing";
import { lineView, problems } from "@/lib/paperwork";
import { vendorPaperwork } from "@/lib/paperwork-server";
import { codeLabelOf } from "@/lib/takeoff-materials";
import { vendorCodes } from "@/lib/vendors";
import { Badge, Button, ConfirmForm, SubmitButton } from "@/components/ui";
import { PaperworkList } from "@/components/vendors/paperwork-list";
import { VendorInfo } from "@/components/vendors/vendor-info";
import { cancelVendorInvite, createVendorLogin, deleteVendor, deleteVendorLogin, resendVendorInvite, updateVendorLogin } from "../actions";
import { openInvites } from "@/lib/invites";
import { companyClock } from "@/lib/company-zone";
import { requireView } from "@/lib/auth";

const small = "!h-7 !px-2.5 !text-xs";

/**
 * One sub or vendor, everything in one place: their company info (edited right here), their paperwork — each line
 * with "Need it", since every sub is different — the jobs and POs you have with them, and their portal sign-ins.
 */
export default async function VendorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const user = await requireView("lists");
  const canEdit = user.role === "ADMIN" || allows(user.access, "lists", 2);
  const { id } = await params;
  const { edit } = await searchParams;
  const [vendor, waiting, costCodes] = await Promise.all([
    db.vendor.findUnique({
      where: { id },
      include: {
        logins: { orderBy: { name: "asc" }, select: { id: true, name: true, email: true, active: true, lastSignInAt: true } },
        purchaseOrders: {
          orderBy: { number: "desc" },
          include: { lines: true, project: { select: { id: true, name: true } }, bills: { where: { status: { not: "REJECTED" } }, include: { lines: true } } },
        },
      },
    }),
    openInvites({ vendorId: id }),
    db.costCode.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }, { name: "asc" }], select: { id: true, code: true, name: true } }),
  ]);
  if (!vendor) notFound();
  const today = (await companyClock()).now; // today, on the company's clock
  const paper = await vendorPaperwork(vendor.id, today);
  const open = paper ? problems(paper.lines) : [];
  const codes = [...costCodes.map((c) => ({ id: c.id, label: codeLabelOf(c) })), { id: "none", label: "No cost code" }];
  const trades = vendorCodes(vendor)
    .map((c) => costCodes.find((x) => x.id === c)?.name)
    .filter(Boolean) as string[];
  const pos = vendor.purchaseOrders.filter((p) => p.status !== "VOID");

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <Link href={`/vendors#vendor-${vendor.id}`} className="text-xs text-slate-500 hover:text-slate-800">
          ← Subs & vendors
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-slate-900">{vendor.name}</h1>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {trades.map((t) => (
                <span key={t} className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                  {t}
                </span>
              ))}
              {open.length ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                  Paperwork: {open.length} to follow up
                </span>
              ) : paper?.lines.some((l) => l.needed) ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">Paperwork all in</span>
              ) : null}
            </div>
          </div>
          {canEdit ? (
            <ConfirmForm action={deleteVendor} hidden={{ id: vendor.id }} message={`Delete "${vendor.name}"? Their paperwork files go too; their bids and POs stay on your jobs.`} variant="ghost">
              <span className="inline-flex items-center gap-1 text-xs text-rose-600">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </span>
            </ConfirmForm>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <VendorInfo
          vendor={{
            id: vendor.id,
            name: vendor.name,
            contact: vendor.contact,
            phone: vendor.phone,
            email: vendor.email,
            address: vendor.address,
            licenseNumber: vendor.licenseNumber,
            taxId: vendor.taxId,
            notes: vendor.notes,
            codes: vendorCodes(vendor),
          }}
          codes={codes}
          canEdit={canEdit}
          startEditing={edit === "1"}
        />
        <PaperworkList vendorId={vendor.id} lines={(paper?.lines ?? []).map((l) => lineView(l, today))} canEdit={canEdit} />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-100 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-900">Jobs and POs</h2>
        </header>
        {pos.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Job</th>
                  <th className="px-2 py-2 font-medium">PO</th>
                  <th className="px-2 py-2 font-medium">What</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 text-right font-medium">Total</th>
                  <th className="px-2 py-2 text-right font-medium">Billed</th>
                  <th className="px-4 py-2 text-right font-medium">Left</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pos.map((po) => {
                  const total = poTotal(po.lines);
                  const billed = po.bills.reduce((n, b) => n + billTotal(b.lines), 0);
                  return (
                    <tr key={po.id}>
                      <td className="px-4 py-2">
                        <Link href={`/projects/${po.project.id}/purchasing`} className="text-slate-900 hover:text-blue-700">
                          {po.project.name}
                        </Link>
                      </td>
                      <td className="px-2 py-2 font-mono text-xs">
                        <Link href={`/projects/${po.project.id}/purchasing/po/${po.id}`} className="text-blue-700 hover:underline">
                          PO-{po.number}
                        </Link>
                      </td>
                      <td className="max-w-56 truncate px-2 py-2 text-slate-600">{po.title}</td>
                      <td className="px-2 py-2">
                        <Badge status={po.status}>{PO_STATUS_LABEL[po.status]}</Badge>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{money(total)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-600">{money(billed)}</td>
                      <td className={cn("px-4 py-2 text-right tabular-nums", total - billed < -0.005 ? "font-medium text-rose-700" : "text-slate-900")}>{money(total - billed)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-3 text-sm text-slate-500">No POs yet — make one from a job&apos;s Purchasing tab.</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-100 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-900">Portal sign-ins</h2>
          <p className="text-xs text-slate-500">They see their POs and schedule, and send bills and paperwork. Never your client prices or budgets.</p>
        </header>
        <div className="space-y-2 px-4 py-2.5">
          {vendor.logins.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className={cn("min-w-0 flex-1", !u.active && "text-slate-400 line-through")}>
                {u.name} <span className="text-xs text-slate-500">{u.email}</span>
                {u.lastSignInAt ? <span className="text-xs text-slate-400"> · signed in {fmtDate(u.lastSignInAt, "MMM d")}</span> : null}
              </span>
              {canEdit ? (
                <>
                  {u.active ? (
                    <form action={updateVendorLogin}>
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="reset" value="1" />
                      <SubmitButton size="sm" variant="ghost" className={small} pendingText="Sending…">
                        Send password reset
                      </SubmitButton>
                    </form>
                  ) : null}
                  <form action={updateVendorLogin}>
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="toggle" value="1" />
                    <Button type="submit" size="sm" variant="ghost" className={small}>
                      {u.active ? "Turn off" : "Turn on"}
                    </Button>
                  </form>
                  <ConfirmForm action={deleteVendorLogin} hidden={{ id: u.id }} message={`Remove ${u.name}'s login?`} variant="ghost">
                    <span className="text-xs text-rose-600">Remove</span>
                  </ConfirmForm>
                </>
              ) : null}
            </div>
          ))}
          {waiting.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 flex-1">
                {i.name ?? i.email}{" "}
                <span className="text-xs text-amber-700">
                  {i.email} · invited, {i.expiresAt < new Date() ? "expired" : `waiting until ${fmtDate(i.expiresAt)}`}
                </span>
              </span>
              {canEdit ? (
                <>
                  <form action={resendVendorInvite}>
                    <input type="hidden" name="vendorId" value={vendor.id} />
                    <input type="hidden" name="inviteId" value={i.id} />
                    <SubmitButton size="sm" variant="ghost" className={small} pendingText="Sending…">
                      Resend
                    </SubmitButton>
                  </form>
                  <ConfirmForm action={cancelVendorInvite} hidden={{ vendorId: vendor.id, inviteId: i.id }} message={`Cancel the invitation to ${i.email}?`} variant="ghost">
                    <span className="text-xs text-rose-600">Cancel</span>
                  </ConfirmForm>
                </>
              ) : null}
            </div>
          ))}
          {canEdit ? (
            <form action={createVendorLogin} className="flex flex-wrap items-center gap-1.5 pt-1">
              <input type="hidden" name="vendorId" value={vendor.id} />
              <input name="name" className="input !h-7 !w-36 !py-0 text-xs" placeholder="Name (optional)" aria-label="Name" />
              <input
                name="email"
                type="email"
                required
                className="input !h-7 !w-56 !py-0 text-xs"
                placeholder="Email they sign in with"
                aria-label="Email"
                defaultValue={vendor.logins.length ? "" : (vendor.email ?? "")}
              />
              <SubmitButton size="sm" variant="secondary" className={small} pendingText="Sending…">
                Invite
              </SubmitButton>
            </form>
          ) : null}
        </div>
      </section>
    </div>
  );
}
