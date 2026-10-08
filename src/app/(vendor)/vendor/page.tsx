import Link from "next/link";
import { CalendarDays, ClipboardList, FileInput, ShieldAlert, ShieldCheck } from "lucide-react";
import { requireVendor } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, money } from "@/lib/utils";
import { billTotal, coverageWarning, poTotal, vendorCoverage } from "@/lib/purchasing";
import { Card, CardBody, CardHeader } from "@/components/ui";

export default async function VendorHome() {
  const user = await requireVendor();
  const today = new Date();
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const [waiting, tasks, bills, coverage] = await Promise.all([
    db.purchaseOrder.findMany({ where: { vendorId: user.vendorId, status: "SENT" }, include: { lines: true, project: { select: { name: true } } }, orderBy: { sentAt: "asc" } }),
    db.scheduleTask.findMany({
      where: { vendorId: user.vendorId, endDate: { gte: day }, percentComplete: { lt: 100 } },
      include: { project: { select: { name: true } } },
      orderBy: { startDate: "asc" },
      take: 8,
    }),
    db.vendorBill.findMany({ where: { vendorId: user.vendorId, status: { in: ["PENDING", "APPROVED"] } }, include: { lines: true } }),
    vendorCoverage(user.vendorId),
  ]);
  const unpaid = bills.reduce((n, b) => n + billTotal(b.lines), 0);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Hi, {user.name.split(" ")[0]}</h1>
      {coverage && !coverage.ok ? (
        <Link href="/vendor/insurance" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>Insurance needed:</strong> {coverageWarning(coverage, (d) => fmtDate(d))}. Upload your certificate →
          </span>
        </Link>
      ) : coverage ? (
        <p className="flex items-center gap-2 text-sm text-emerald-800">
          <ShieldCheck className="h-4 w-4" /> Your insurance is up to date with us.
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="POs waiting for your answer" description={waiting.length ? "Look them over and accept or decline." : undefined} />
          {waiting.length ? (
            <ul className="divide-y divide-slate-100">
              {waiting.map((po) => (
                <li key={po.id}>
                  <Link href={`/vendor/pos/${po.id}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-slate-50">
                    <ClipboardList className="h-4 w-4 shrink-0 text-blue-600" />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-slate-900">
                        PO-{po.number} · {po.title}
                      </span>
                      <span className="block text-xs text-slate-500">{po.project.name}</span>
                    </span>
                    <span className="font-medium tabular-nums">{money(poTotal(po.lines))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <CardBody>
              <p className="text-sm text-slate-500">Nothing waiting.</p>
            </CardBody>
          )}
        </Card>
        <Card>
          <CardHeader title="Coming up" description="Your work on the schedule" />
          {tasks.length ? (
            <ul className="divide-y divide-slate-100">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-slate-900">{t.name}</span>
                    <span className="block text-xs text-slate-500">{t.project.name}</span>
                  </span>
                  <span className="whitespace-nowrap text-xs text-slate-600">
                    {fmtDate(t.startDate, "MMM d")}
                    {t.endDate > t.startDate ? ` – ${fmtDate(t.endDate, "MMM d")}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <CardBody>
              <p className="text-sm text-slate-500">Nothing scheduled for you right now.</p>
            </CardBody>
          )}
        </Card>
      </div>
      <Link href="/vendor/bills" className="flex items-center gap-2 text-sm font-medium text-blue-700 hover:underline">
        <FileInput className="h-4 w-4" /> {bills.length ? `${bills.length} bill${bills.length === 1 ? "" : "s"} not paid yet (${money(unpaid)})` : "Send us a bill"}
      </Link>
    </div>
  );
}
