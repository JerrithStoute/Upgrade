import { FileText, ShieldAlert, ShieldCheck } from "lucide-react";
import { requireVendor } from "@/lib/auth";
import { db } from "@/lib/db";
import { cn, fmtDate } from "@/lib/utils";
import { COVERAGE_TYPES, SOON_DAYS, coverageLabel, coverageWarning, vendorCoverage } from "@/lib/purchasing";
import { Card, CardBody, CardHeader, SubmitButton } from "@/components/ui";
import { uploadVendorInsurance } from "../actions";

/** Their certificates with you, and a place to upload a new one. */
export default async function VendorInsurancePage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const user = await requireVendor();
  const { sent } = await searchParams;
  const [certs, coverage] = await Promise.all([
    db.vendorInsurance.findMany({ where: { vendorId: user.vendorId }, orderBy: [{ type: "asc" }, { expiresAt: "desc" }] }),
    vendorCoverage(user.vendorId),
  ]);
  const today = new Date();
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const soon = new Date(day.getTime() + SOON_DAYS * 86400000);
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Insurance</h1>
      {sent ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">Thanks — we&apos;ll check it and mark it on file.</p> : null}
      {coverage ? (
        coverage.ok ? (
          <p className="flex items-center gap-2 text-sm text-emerald-800">
            <ShieldCheck className="h-4 w-4" /> You&apos;re up to date with us.
          </p>
        ) : (
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> We need: {coverageWarning(coverage, (d) => fmtDate(d))}.
          </p>
        )
      ) : null}

      {certs.length ? (
        <Card>
          <CardHeader title="On file" />
          <ul className="divide-y divide-slate-100">
            {certs.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-slate-900">{coverageLabel(c.type)}</span>
                  <span className="block text-xs text-slate-500">{[c.carrier, c.policyNumber].filter(Boolean).join(" · ")}</span>
                </span>
                <span
                  className={cn(
                    "whitespace-nowrap text-xs",
                    c.expiresAt < day ? "font-semibold text-rose-700" : c.expiresAt <= soon ? "font-semibold text-amber-700" : "text-slate-600",
                  )}
                >
                  Expires {fmtDate(c.expiresAt)}
                </span>
                {c.confirmed ? null : <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-800 ring-1 ring-sky-200">We&apos;re checking it</span>}
                {c.storagePath ? (
                  <a href={`/api/vendor-files/${c.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
                    <FileText className="h-3.5 w-3.5" /> Open
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Upload a certificate" description="Your certificate of insurance (COI) — a PDF or a photo." />
        <CardBody>
          <form action={uploadVendorInsurance} className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1">
              <span className="label">Coverage</span>
              <select name="type" className="input" defaultValue={coverage?.missing[0] ?? coverage?.expired[0]?.type ?? coverage?.expiring[0]?.type ?? "GL"}>
                {COVERAGE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="label">Expires</span>
              <input name="expiresAt" type="date" required className="input" />
            </label>
            <label className="space-y-1">
              <span className="label">Insurance company (optional)</span>
              <input name="carrier" className="input" />
            </label>
            <label className="space-y-1">
              <span className="label">Policy # (optional)</span>
              <input name="policyNumber" className="input" />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="label">Certificate</span>
              <input name="file" type="file" required accept=".pdf,image/*" className="block w-full text-sm" />
            </label>
            <div className="md:col-span-3">
              <SubmitButton pendingText="Uploading…">Upload</SubmitButton>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
