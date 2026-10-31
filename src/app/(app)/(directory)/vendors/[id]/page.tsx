import Link from "@/components/link";
import { notFound } from "next/navigation";
import { Mail, Phone, User } from "lucide-react";
import { db } from "@/lib/db";
import { allows } from "@/lib/access";
import { cn, fmtDate, money } from "@/lib/utils";
import { PO_STATUS_LABEL, poTotal } from "@/lib/purchasing";
import { lineView } from "@/lib/paperwork";
import { paperTypes, vendorPaperwork } from "@/lib/paperwork-server";
import { Badge, Button, Collapsible, ConfirmForm, SubmitButton } from "@/components/ui";
import { PaperworkList } from "@/components/vendors/paperwork-list";
import { cancelVendorInvite, createVendorLogin, deleteVendorLogin, resendVendorInvite, updateVendorLogin } from "../actions";
import { openInvites } from "@/lib/invites";
import { companyClock } from "@/lib/company-zone";
import { requireView } from "@/lib/auth";

/**
 * One sub or vendor: who they are, their paperwork (the part you use most), and — folded away until you want
 * them — their POs and bills and their portal sign-ins.
 */
export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireView("lists");
  const canEdit = user.role === "ADMIN" || allows(user.access, "lists", 2);
  const { id } = await params;
  const [vendor, waiting, types] = await Promise.all([
    db.vendor.findUnique({
      where: { id },
      include: {
        logins: { orderBy: { name: "asc" }, select: { id: true, name: true, email: true, active: true } },
        purchaseOrders: { orderBy: { number: "desc" }, include: { lines: true, project: { select: { id: true, name: true } } } },
        _count: { select: { bills: true } },
      },
    }),
    openInvites({ vendorId: id }),
    paperTypes(),
  ]);
  if (!vendor) notFound();
  const today = (await companyClock()).now; // today, on the company's clock
  const paper = await vendorPaperwork(vendor.id, today);
  const pos = vendor.purchaseOrders;
  const people = vendor.logins.length + waiting.length;

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <Link href={`/vendors#vendor-${vendor.id}`} className="text-xs text-slate-500 hover:text-slate-800">
          ← Subs & vendors
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-semibold text-slate-900">{vendor.name}</h1>
          {canEdit ? (
            <Link href={`/vendors?edit=${vendor.id}#vendor-${vendor.id}`} className="text-xs font-medium text-blue-700 hover:underline">
              Edit details
            </Link>
          ) : null}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
          {vendor.contact ? (
            <span className="inline-flex items-center gap-1">
              <User className="h-3.5 w-3.5 text-slate-400" /> {vendor.contact}
            </span>
          ) : null}
          {vendor.phone ? (
            <a href={`tel:${vendor.phone}`} className="inline-flex items-center gap-1 hover:text-blue-700">
              <Phone className="h-3.5 w-3.5 text-slate-400" /> {vendor.phone}
            </a>
          ) : null}
          {vendor.email ? (
            <a href={`mailto:${vendor.email}`} className="inline-flex items-center gap-1 hover:text-blue-700">
              <Mail className="h-3.5 w-3.5 text-slate-400" /> {vendor.email}
            </a>
          ) : null}
          {!vendor.contact && !vendor.phone && !vendor.email ? <span className="text-slate-400">No contact details</span> : null}
        </p>
        {vendor.notes ? <p className="mt-1 text-xs text-slate-500">{vendor.notes}</p> : null}
      </div>

      <PaperworkList
        vendorId={vendor.id}
        lines={(paper?.lines ?? []).map((l) => lineView(l, today))}
        allTypes={types.map((t) => ({ id: t.id, name: t.name }))}
        canEdit={canEdit}
      />

      <Collapsible
        summary={
          <span>
            POs <span className="text-slate-500">({pos.length})</span> · Bills <span className="text-slate-500">({vendor._count.bills})</span>
          </span>
        }
      >
        {pos.length ? (
          <ul className="-my-2 divide-y divide-slate-100 text-sm">
            {pos.map((po) => (
              <li key={po.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <Link href={`/projects/${po.project.id}/purchasing/po/${po.id}`} className="font-mono text-xs text-blue-700 hover:underline">
                  PO-{po.number}
                </Link>
                <span className="min-w-0 flex-1 truncate">
                  {po.title} <span className="text-xs text-slate-500">· {po.project.name}</span>
                </span>
                <Badge status={po.status}>{PO_STATUS_LABEL[po.status]}</Badge>
                <span className="w-24 text-right tabular-nums">{money(poTotal(po.lines))}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">None yet — make one from a job&apos;s Purchasing tab.</p>
        )}
      </Collapsible>

      <Collapsible
        summary={
          <span>
            Portal sign-ins <span className="text-slate-500">({people})</span>
          </span>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            People at this vendor who can sign in: they see their POs (and accept them), their schedule items, and send bills and paperwork. They never see your client prices or
            budgets.
          </p>
          {vendor.logins.length ? (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {vendor.logins.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-sm">
                  <span className={cn("min-w-0 flex-1", !u.active && "text-slate-400 line-through")}>
                    <span className="font-medium">{u.name}</span> <span className="text-xs text-slate-500">{u.email}</span>
                  </span>
                  {canEdit ? (
                    <>
                      {u.active ? (
                        <form action={updateVendorLogin}>
                          <input type="hidden" name="id" value={u.id} />
                          <input type="hidden" name="reset" value="1" />
                          <SubmitButton size="sm" variant="ghost" pendingText="Sending…" title="Emails them a link to choose a new password">
                            Send password reset
                          </SubmitButton>
                        </form>
                      ) : null}
                      <form action={updateVendorLogin}>
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="toggle" value="1" />
                        <Button type="submit" size="sm" variant="ghost">
                          {u.active ? "Turn off" : "Turn on"}
                        </Button>
                      </form>
                      <ConfirmForm action={deleteVendorLogin} hidden={{ id: u.id }} message={`Remove ${u.name}'s login?`} variant="ghost">
                        <span className="text-xs text-rose-600">Remove</span>
                      </ConfirmForm>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {waiting.length ? (
            <ul className="divide-y divide-slate-100 rounded-lg border border-amber-200 bg-amber-50/50">
              {waiting.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{i.name ?? i.email}</span>{" "}
                    <span className="text-xs text-slate-500">
                      {i.email} · invited, {i.expiresAt < new Date() ? "expired" : `waiting until ${fmtDate(i.expiresAt)}`}
                    </span>
                  </span>
                  {canEdit ? (
                    <>
                      <form action={resendVendorInvite}>
                        <input type="hidden" name="vendorId" value={vendor.id} />
                        <input type="hidden" name="inviteId" value={i.id} />
                        <SubmitButton size="sm" variant="ghost" pendingText="Sending…">
                          Resend
                        </SubmitButton>
                      </form>
                      <ConfirmForm action={cancelVendorInvite} hidden={{ vendorId: vendor.id, inviteId: i.id }} message={`Cancel the invitation to ${i.email}?`} variant="ghost">
                        <span className="text-xs text-rose-600">Cancel</span>
                      </ConfirmForm>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {canEdit ? (
            <form action={createVendorLogin} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="vendorId" value={vendor.id} />
              <input name="name" className="input !h-8 !w-40 text-sm" placeholder="Name (optional)" aria-label="Name" />
              <input
                name="email"
                type="email"
                required
                className="input !h-8 !w-56 text-sm"
                placeholder="Email (they sign in with it)"
                aria-label="Email"
                defaultValue={vendor.logins.length ? "" : (vendor.email ?? "")}
              />
              <SubmitButton size="sm" variant="secondary" pendingText="Sending…">
                Invite
              </SubmitButton>
            </form>
          ) : null}
        </div>
      </Collapsible>
    </div>
  );
}
