import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Download } from "lucide-react";
import { buttonClasses, Card, CardBody, CardHeader, ConfirmForm, Field, FormGrid, SubmitButton } from "@/components/ui";
import { MoreList } from "@/components/more-list";
import path from "path";
import { backupNow, restoreFromBackup, saveBackupFolder, saveCompany } from "../actions";
import { BrandingForm } from "../branding-form";
import { getBrand } from "@/lib/company-brand";
import { backupDir, backupHealth, backupsInCloud, companyDefaultDir, listBackups } from "@/lib/backup";
import { fmtDateTime, timeAgo } from "@/lib/utils";
import { DEFAULT_ZONE, ZONES, isZone } from "@/lib/zone";
import { companyClock } from "@/lib/company-zone";

export const metadata = { title: "Company settings" };

export default async function CompanySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; backup?: string; branding?: string; restored?: string; undo?: string }>;
}) {
  await requireAdmin();
  const { saved, backup, branding, restored, undo } = await searchParams;
  const { dateTime } = await companyClock();
  const [company, { last, overdue: stale }, brand, folder, backups, punches] = await Promise.all([
    db.company.findFirst(),
    backupHealth(),
    getBrand(),
    backupDir(),
    listBackups(),
    db.timeEntry.count(),
  ]);
  const ownFolder = await companyDefaultDir();
  const inCloud = backupsInCloud();
  // Same drive as the program? Then one failed disk takes both.
  const sameDrive = path.parse(folder).root.toLowerCase() === path.parse(process.cwd()).root.toLowerCase() && !/onedrive|dropbox|google drive|icloud/i.test(folder);
  const oneDrive = process.env.OneDrive ? path.join(process.env.OneDrive, "The Builder Station backups") : null;
  const stamp = (d: Date) => d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="space-y-6">
      {saved ? <p className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">Company profile saved.</p> : null}
      {branding ? (
        <p className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">Branding saved — the whole program now uses it.</p>
      ) : null}
      {backup ? (
        <p className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">
          {backup === "moved" ? "Backup folder saved — and a fresh backup is already in it." : "Backup complete."}
        </p>
      ) : null}
      {restored ? (
        <p className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">
          Everything is back the way it was in <span className="font-mono">{restored}</span>. Changed your mind? How things were just before is saved as{" "}
          <span className="font-mono">{undo}</span> — restore that one.
        </p>
      ) : null}
      <Card>
        <div id="backups" className="scroll-mt-20" />
        <CardHeader
          title="Backups"
          description="The database and all uploaded plans, photos and documents are copied automatically once a day while the program is running. The last 30 copies are kept."
          actions={
            <form action={backupNow}>
              <SubmitButton size="sm" variant="secondary" pendingText="Backing up…">
                Back up now
              </SubmitButton>
            </form>
          }
        />
        <CardBody className="space-y-4 text-sm">
          <p className={stale ? "font-medium text-amber-700" : "text-slate-700"}>
            {last ? (
              <>
                Last backup {timeAgo(last.at)} ({dateTime(last.at)}) · {(last.bytes / 1024 / 1024).toFixed(1)} MB
              </>
            ) : (
              "No backup yet — one runs about a minute after the program starts, or click Back up now."
            )}
          </p>

          {inCloud ? (
            <p className="text-xs text-slate-500">Kept in cloud storage, apart from the program&apos;s server, with a copy of every uploaded file.</p>
          ) : (
          <div className="space-y-2">
            <form action={saveBackupFolder} className="flex flex-wrap items-end gap-2">
              <Field label="Backup folder" htmlFor="backupDir" className="min-w-0 flex-1" hint={`Leave blank for the program's own folder (${ownFolder}).`}>
                <input id="backupDir" name="backupDir" className="input font-mono" defaultValue={company?.backupDir ?? ""} placeholder={ownFolder} />
              </Field>
              <SubmitButton variant="secondary" pendingText="Checking the folder…" className="mb-5">
                Save folder
              </SubmitButton>
            </form>
            {sameDrive ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-amber-800 ring-1 ring-inset ring-amber-200">
                <span className="min-w-0 flex-1">
                  Backups are on the same drive as the program — if that drive dies, both go. Pick a folder on another drive, a USB drive, or a cloud folder like OneDrive.
                </span>
                {oneDrive ? (
                  <form action={saveBackupFolder}>
                    <input type="hidden" name="backupDir" value={oneDrive} />
                    <SubmitButton size="sm" pendingText="Setting up…">
                      Use my OneDrive
                    </SubmitButton>
                  </form>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Saving to <span className="font-mono">{folder}</span>.
              </p>
            )}
          </div>
          )}

          <div>
            <p className="label">Restore a backup</p>
            <p className="mb-2 text-xs text-slate-500">
              Puts every job, setting and file back the way it was at that moment. Anything done since is replaced — but a backup of right now is taken first, so a restore can be
              undone.
            </p>
            {backups.length ? (
              <div className="overflow-hidden rounded-md border border-slate-200">
                <MoreList
                  show={5}
                  items={backups.map((b) => (
                    <li key={b.file} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-slate-900">{stamp(b.at)}</span>
                        <span className="ml-2 text-xs text-slate-500">
                          {(b.bytes / 1024 / 1024).toFixed(1)} MB{b.beforeRestore ? " · taken just before a restore" : ""}
                        </span>
                      </span>
                      <ConfirmForm
                        action={restoreFromBackup}
                        hidden={{ file: b.file }}
                        variant="secondary"
                        message={`Put everything back the way it was on ${stamp(b.at)}? Anything done since then is replaced. (A backup of right now is taken first, so you can undo this.)`}
                      >
                        Restore
                      </ConfirmForm>
                    </li>
                  ))}
                />
              </div>
            ) : (
              <p className="text-xs text-slate-500">No backups yet.</p>
            )}
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          title="Download all our data"
          description="Everything your company has in The Builder Station — every list as a spreadsheet, plus all uploaded plans, photos and documents — in one ZIP file. It's yours to keep, any time."
          actions={
            <a href="/api/company/export" download className={buttonClasses("secondary", "sm")}>
              <Download className="h-4 w-4" /> Download
            </a>
          }
        />
      </Card>
      <Card>
        <CardHeader title="Branding" description="Your logo and main color, used across the whole program, the client portal and printouts." />
        <CardBody>
          <BrandingForm color={brand.color} style={brand.style} logoUrl={brand.logoUrl} companyName={brand.name} />
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
              <Field
                label="Time zone"
                htmlFor="timeZone"
                hint={
                  punches
                    ? "The time clock, the times shown and the 6 am morning email follow it. Changing it moves the days and weeks your existing time-clock punches fall in."
                    : "The time clock, the times shown and the 6 am morning email follow it."
                }
              >
                <select id="timeZone" name="timeZone" className="input" defaultValue={isZone(company?.timeZone) ? company.timeZone : DEFAULT_ZONE}>
                  {ZONES.map((z) => (
                    <option key={z.value} value={z.value}>
                      {z.label}
                    </option>
                  ))}
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
