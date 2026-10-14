import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseProposalOptions } from "@/lib/proposal-options";
import { Card, CardBody, CardHeader, Field, SubmitButton } from "@/components/ui";
import { saveProposalDefaults } from "./actions";

export const metadata = { title: "Proposal defaults" };

function Check({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" name={name} defaultChecked={checked} className="h-4 w-4 rounded border-slate-300" />
      {label}
    </label>
  );
}

function Radio({ name, value, label, checked }: { name: string; value: string; label: string; checked: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="radio" name={name} value={value} defaultChecked={checked} className="h-4 w-4" />
      {label}
    </label>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody className="space-y-2.5">{children}</CardBody>
    </Card>
  );
}

/**
 * What a new proposal shows — the same choices as the panel beside a proposal (in the same words).
 * Each estimate can still have its own there.
 */
export default async function ProposalDefaultsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireAdmin();
  const { saved } = await searchParams;
  const company = await db.company.findFirst({ select: { proposalOptions: true, name: true } });
  const o = parseProposalOptions(company?.proposalOptions);

  return (
    <form action={saveProposalDefaults} className="space-y-6">
      {saved ? <p className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">Saved — proposals that follow your defaults show it this way.</p> : null}
      <p className="text-sm text-slate-500">Proposals follow these unless an estimate has its own (set beside the proposal, with &ldquo;Save for this estimate&rdquo;).</p>
      <div className="grid gap-6 lg:grid-cols-2">
        <Group title="Page">
          <Field label="Heading" htmlFor="p-heading">
            <input id="p-heading" name="heading" className="input" defaultValue={o.heading} placeholder="Proposal" />
          </Field>
          <Check name="cover" label="Cover page with a picture" checked={o.cover} />
          <Check name="introTitled" label="Title over the introduction" checked={o.intro.titled} />
          <Field label="Introduction title" htmlFor="p-intro-title">
            <input id="p-intro-title" name="introTitle" className="input" defaultValue={o.intro.title} placeholder="Notes" />
          </Field>
        </Group>

        <Group title="Divisions">
          <Check name="categoriesShow" label="Show divisions" checked={o.categories.show} />
          <Check name="categoriesSubtotals" label="Division totals" checked={o.categories.subtotals} />
        </Group>

        <Group title="Categories (selections / specifications)">
          <Check name="divisionsShow" label="Show categories" checked={o.divisions.show} />
          <Check name="divisionsPrices" label="Prices" checked={o.divisions.prices} />
          <Check name="divisionsSpecText" label="Specification text" checked={o.divisions.specText} />
          <Check name="allowanceInline" label="“Allowance: $X” under allowances" checked={o.allowanceInline} />
          <Check name="selectionTbd" label="“Choice – To be specified by client … TBD” under selections" checked={o.selectionTbd} />
        </Group>

        <Group title="Items">
          <Check name="itemsShow" label="Show items" checked={o.items.show} />
          <Check name="itemsQty" label="Qty & units" checked={o.items.qty} />
          <Check name="itemsPrices" label="Prices" checked={o.items.prices} />
        </Group>

        <Group title="Totals">
          <Check name="totalOnly" label="Final total only (hide every other price)" checked={o.totalOnly} />
          <Check name="allowances" label="Allowance Summary page" checked={o.allowances} />
        </Group>

        <Group title="Profit">
          <Radio name="profitMode" value="BUILT_IN" label="Built into the prices" checked={o.profit.mode === "BUILT_IN"} />
          <Radio name="profitMode" value="FEE" label="Separate fee line (prices at cost)" checked={o.profit.mode === "FEE"} />
          <Field label="Fee line name" htmlFor="p-fee-label">
            <input id="p-fee-label" name="profitLabel" className="input" defaultValue={o.profit.label} />
          </Field>
          <Check name="profitShowPct" label="Show the fee %" checked={o.profit.showPct} />
        </Group>

        <Group title="Sales tax">
          <p className="text-xs text-slate-500">The tax you pay (Tax column on the estimate) is in the total either way.</p>
          <Radio name="tax" value="BUILT_IN" label="Built into the prices" checked={!o.tax.on} />
          <Radio name="tax" value="LINE" label="Its own line (prices before tax)" checked={o.tax.on} />
          <Field label="Tax line name" htmlFor="p-tax-label">
            <input id="p-tax-label" name="taxLabel" className="input" defaultValue={o.tax.label} />
          </Field>
        </Group>

        <Group title="Pricing & signatures">
          <Field label="Pricing good for (days)" htmlFor="p-valid" hint="Prints “Pricing … is good for N days, through (date)” above the signatures. Leave it empty to leave it off.">
            <input id="p-valid" name="validDays" type="number" min={0} max={365} className="input" defaultValue={o.validDays || ""} placeholder="—" />
          </Field>
          <Field label="Builder signs as" htmlFor="p-signer">
            <input id="p-signer" name="signer" className="input" defaultValue={o.signer} placeholder={company?.name ?? ""} />
          </Field>
          <Check name="clientSignature" label="Client signs too" checked={o.clientSignature} />
        </Group>
      </div>
      <SubmitButton>Save</SubmitButton>
    </form>
  );
}
