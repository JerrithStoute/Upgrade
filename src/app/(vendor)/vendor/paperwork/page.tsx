import { FileText, ShieldAlert, ShieldCheck } from "lucide-react";
import { requireVendor } from "@/lib/auth";
import { cn, fmtDate } from "@/lib/utils";
import { paperworkWarning, problemText } from "@/lib/paperwork";
import { vendorPaperwork } from "@/lib/paperwork-server";
import { Card, CardBody, CardHeader, SubmitButton } from "@/components/ui";
import { uploadVendorPaper } from "../actions";
import { companyClock } from "@/lib/company-zone";

/** The paperwork the builder needs from them, what's on file, and a place to send each. */
export default async function VendorPaperworkPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const user = await requireVendor();
  const { sent } = await searchParams;
  const today = (await companyClock()).now; // today, on the company's clock
  const paper = await vendorPaperwork(user.vendorId, today);
  const lines = (paper?.lines ?? []).filter((l) => l.needed || l.docs.length);
  const warning = paper ? paperworkWarning(paper.lines, (d) => fmtDate(d)) : "";
  const asked = lines.filter((l) => l.needed);
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Paperwork</h1>
      {sent ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">Thanks — we&apos;ll look it over and mark it on file.</p> : null}
      {warning ? (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> We need: {warning}.
        </p>
      ) : asked.length ? (
        <p className="flex items-center gap-2 text-sm text-emerald-800">
          <ShieldCheck className="h-4 w-4" /> You&apos;re up to date with us.
        </p>
      ) : (
        <p className="text-sm text-slate-600">We don&apos;t need any paperwork from you right now.</p>
      )}

      {lines.map((l) => (
        <Card key={l.type.id}>
          <CardHeader title={l.type.name} description={l.needed && l.status !== "ok" ? problemText(l, (d) => fmtDate(d)) : undefined} />
          <CardBody className="space-y-3">
            {l.docs.length ? (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {l.docs.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                    {d.storagePath ? (
                      <a href={`/api/vendor-files/${d.id}`} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-1 text-blue-700 hover:underline">
                        <FileText className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{d.fileName ?? "Open"}</span>
                      </a>
                    ) : (
                      <span className="flex-1 text-slate-500">(no file)</span>
                    )}
                    {d.expiresAt ? <span className={cn("whitespace-nowrap text-xs", d.expired ? "font-semibold text-rose-700" : "text-slate-600")}>Expires {fmtDate(d.expiresAt)}</span> : null}
                    {d.confirmed ? null : <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-800 ring-1 ring-sky-200">We&apos;re looking it over</span>}
                  </li>
                ))}
              </ul>
            ) : null}
            <form action={uploadVendorPaper} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="typeId" value={l.type.id} />
              <label className="space-y-1">
                <span className="label">{l.docs.length ? "Send a new one" : "Send it"}</span>
                <input name="file" type="file" required accept=".pdf,image/*,.doc,.docx" className="block w-full text-sm" />
              </label>
              {l.type.kind === "INSURANCE" ? (
                <label className="space-y-1">
                  <span className="label">Insurance company</span>
                  <input name="carrier" className="input" />
                </label>
              ) : null}
              {l.type.expires ? (
                <label className="space-y-1">
                  <span className="label">{l.type.kind === "INSURANCE" ? "Policy #" : "Number"}</span>
                  <input name="number" className="input" />
                </label>
              ) : null}
              {l.type.expires ? (
                <label className="space-y-1">
                  <span className="label">Expires</span>
                  <input name="expiresAt" type="date" required className="input" />
                </label>
              ) : null}
              <SubmitButton pendingText="Sending…">Send</SubmitButton>
            </form>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
