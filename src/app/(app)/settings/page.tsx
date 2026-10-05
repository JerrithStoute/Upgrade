import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardBody, CardHeader, Field, FormGrid, SubmitButton } from "@/components/ui";
import { backupNow, saveCompany } from "./actions";
import { BrandingForm } from "./branding-form";
import { getBrand } from "@/lib/company-brand";
import { backupDir, backupHealth } from "@/lib/backup";
import { fmtDateTime, timeAgo } from "@/lib/utils";

export const metadata = { title: "Company settings" };

export default async function CompanySettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; backup?: string; branding?: string }> }) {
  await requireAdmin();
  const { saved, backup, branding } = await searchParams;
  const [company, { last, overdue: stale }, brand] = await Promise.all([db.company.findFirst(), backupHealth(), getBrand()]);

  return (
    <div className="space-y-6">
      {saved ? <p className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">Company profile saved.</p> : null}
      {branding ? (
        <p className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">Branding saved — the whole program now uses it.</p>
      ) : null}
      {backup ? <p className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">Backup complete.</p> : null}
      <Card>
        <CardHeader
          title="Backups"
          description="The database and all uploaded plans, photos and documents are copied automatically once a day while the app is running. The last 30 database copies are kept."
          actions={
            <form action={backupNow}>
              <SubmitButton size="sm" variant="secondary" pendingText="Backing up…">
                Back up now
              </SubmitButton>
            </form>
          }
        />
        <CardBody className="space-y-1 text-sm">
          <p className={stale ? "font-medium text-amber-700" : "text-slate-700"}>
            {last ? (
              <>
                Last backup {timeAgo(last.at)} ({fmtDateTime(last.at)}) · {last.file} · {(last.bytes / 1024 / 1024).toFixed(1)} MB
              </>
            ) : (
              "No backup yet — one runs about a minute after the app starts, or click Back up now."
            )}
          </p>
          <p className="text-xs text-slate-500">
            Saved to <span className="font-mono">{backupDir()}</span>. For real protection, set <span className="font-mono">BACKUP_DIR</span> in{" "}
            <span className="font-mono">.env</span> to a different drive or a synced cloud folder (OneDrive, Dropbox), so one failed disk can&apos;t take the app and its backups
            together.
          </p>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Branding" description="Your logo and main color, used across the whole program, the client portal and printouts." />
        <CardBody>
          <BrandingForm color={brand.color} logoUrl={brand.logoUrl} companyName={brand.name} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Company profile" description="Appears on proposals, invoices and the client portal." />
        <CardBody>
          <form action={saveCompany} className="space-y-5">
            <FormGrid>
              <Field label="Company name" htmlFor="name" className="md:col-span-2">
                <input id="name" name="name" className="input" required defaultValue={company?.name ?? ""} />
              </Field>
              <Field label="Address" htmlFor="address" className="md:col-span-2">
                <input id="address" name="address" className="input" defaultValue={company?.address ?? ""} />
              </Field>
              <Field label="City" htmlFor="city">
                <input id="city" name="city" className="input" defaultValue={company?.city ?? ""} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="State" htmlFor="state">
                  <input id="state" name="state" className="input" maxLength={2} defaultValue={company?.state ?? ""} />
                </Field>
                <Field label="ZIP" htmlFor="zip">
                  <input id="zip" name="zip" className="input" defaultValue={company?.zip ?? ""} />
                </Field>
              </div>
              <Field label="Phone" htmlFor="phone">
                <input id="phone" name="phone" type="tel" className="input" defaultValue={company?.phone ?? ""} />
              </Field>
              <Field label="Email" htmlFor="email">
                <input id="email" name="email" type="email" className="input" defaultValue={company?.email ?? ""} />
              </Field>
              <Field label="Website" htmlFor="website">
                <input id="website" name="website" className="input" defaultValue={company?.website ?? ""} />
              </Field>
              <Field label="License number" htmlFor="licenseNumber">
                <input id="licenseNumber" name="licenseNumber" className="input" defaultValue={company?.licenseNumber ?? ""} />
              </Field>
              <Field label="Default markup (%)" htmlFor="defaultMarkup" hint="Applied to new estimate and change order line items.">
                <input id="defaultMarkup" name="defaultMarkup" type="number" step="0.5" min="0" className="input" defaultValue={company?.defaultMarkup ?? 20} />
              </Field>
              <Field label="Allowances start with" htmlFor="allowanceProfit" hint="You can switch any allowance on its selection or in the estimate.">
                <select id="allowanceProfit" name="allowanceProfit" className="input" defaultValue={company?.allowanceProfit ? "in" : "out"}>
                  <option value="out">Profit out (at cost)</option>
                  <option value="in">Profit in</option>
                </select>
              </Field>
            </FormGrid>
            <div className="flex justify-end">
              <SubmitButton>Save company</SubmitButton>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
