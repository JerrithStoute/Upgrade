import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardBody, CardHeader, Field, FormGrid, SubmitButton } from "@/components/ui";
import { saveCompany } from "./actions";

export const metadata = { title: "Company settings" };

export default async function CompanySettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireAdmin();
  const { saved } = await searchParams;
  const company = await db.company.findFirst();

  return (
    <div className="space-y-6">
      {saved ? <p className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">Company profile saved.</p> : null}
      <Card>
        <CardHeader
          title="Company profile"
          description="Appears on proposals, invoices and the client portal."
        />
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
                <input
                  id="defaultMarkup"
                  name="defaultMarkup"
                  type="number"
                  step="0.5"
                  min="0"
                  className="input"
                  defaultValue={company?.defaultMarkup ?? 20}
                />
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
