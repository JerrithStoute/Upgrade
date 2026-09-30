import type { Client } from "@prisma/client";
import { ButtonLink, Card, CardBody, CardHeader, Field, FormGrid, SubmitButton } from "@/components/ui";

export function ClientForm({ action, client }: { action: (formData: FormData) => Promise<void>; client?: Client }) {
  const editing = Boolean(client);
  return (
    <form action={action} className="space-y-6">
      {client ? <input type="hidden" name="id" value={client.id} /> : null}
      <Card>
        <CardHeader title="Contact" />
        <CardBody>
          <FormGrid>
            <Field label="First name" htmlFor="firstName">
              <input id="firstName" name="firstName" required className="input" defaultValue={client?.firstName ?? ""} />
            </Field>
            <Field label="Last name" htmlFor="lastName">
              <input id="lastName" name="lastName" required className="input" defaultValue={client?.lastName ?? ""} />
            </Field>
            <Field label="Company" htmlFor="company">
              <input id="company" name="company" className="input" defaultValue={client?.company ?? ""} />
            </Field>
            <Field label="Source" htmlFor="source" hint="Referral, website, repeat client…">
              <input id="source" name="source" className="input" defaultValue={client?.source ?? ""} />
            </Field>
            <Field label="Email" htmlFor="email">
              <input id="email" name="email" type="email" className="input" defaultValue={client?.email ?? ""} />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <input id="phone" name="phone" type="tel" className="input" defaultValue={client?.phone ?? ""} />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Address" />
        <CardBody>
          <FormGrid>
            <Field label="Street" htmlFor="address" className="md:col-span-2">
              <input id="address" name="address" className="input" defaultValue={client?.address ?? ""} />
            </Field>
            <Field label="City" htmlFor="city">
              <input id="city" name="city" className="input" defaultValue={client?.city ?? ""} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="State" htmlFor="state">
                <input id="state" name="state" className="input" defaultValue={client?.state ?? ""} maxLength={2} />
              </Field>
              <Field label="ZIP" htmlFor="zip">
                <input id="zip" name="zip" className="input" defaultValue={client?.zip ?? ""} />
              </Field>
            </div>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Notes" />
        <CardBody>
          <textarea id="notes" name="notes" rows={4} className="input" defaultValue={client?.notes ?? ""} placeholder="Preferences, gate codes, how they found you…" />
        </CardBody>
      </Card>

      <div className="flex items-center gap-2">
        <SubmitButton>{editing ? "Save changes" : "Create client"}</SubmitButton>
        <ButtonLink href={client ? `/clients/${client.id}` : "/clients"} variant="ghost">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
