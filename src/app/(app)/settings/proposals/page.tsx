import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseProposalOptions, STARTER_PAYMENTS } from "@/lib/proposal-options";
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
  const company = await db.company.findFirst({ select: { proposalOptions: true, name: true, escalationPct: true, escalationFrom: true, proposalIntro: true, proposalTerms: true } });
  const o = parseProposalOptions(company?.proposalOptions);
  // Room for 8 payments; blank rows are left off.
  const payRows = [...(o.payments.rows.length ? o.payments.rows : STARTER_PAYMENTS), ...Array(8).fill({ label: "", pct: 0 })].slice(0, 8);

  return (
    <form action={saveProposalDefaults} className="space-y-6">
      {saved ? <p className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">Saved — proposals that follow your defaults show it this way.</p> : null}
      <p className="text-sm text-slate-500">Proposals follow these unless an estimate has its own (set beside the proposal, with &ldquo;Save for this estimate&rdquo;).</p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
          <Field label="Pricing good for (days)" htmlFor="p-valid" hint="Shows “Pricing good through (date)” at the top of the proposal. Leave it empty to leave it off.">
            <input id="p-valid" name="validDays" type="number" min={0} max={365} className="input" defaultValue={o.validDays || ""} placeholder="—" />
          </Field>
          <Field label="Builder signs as" htmlFor="p-signer">
            <input id="p-signer" name="signer" className="input" defaultValue={o.signer} placeholder={company?.name ?? ""} />
          </Field>
          <Check name="clientSignature" label="Client signs too" checked={o.clientSignature} />
        </Group>

        <Group title="Payment schedule">
          <Check name="paymentsShow" label="Show the payment schedule" checked={o.payments.show} />
          <p className="text-xs text-slate-500">Each payment&apos;s name and % of the total — the proposal works out the dollar amounts. Leave a row blank to leave it off.</p>
          <div className="space-y-1.5">
            {payRows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input name="payLabel" className="input min-w-0 flex-1" defaultValue={r.label} placeholder="When it's due" aria-label={`Payment ${i + 1}`} />
                <input name="payPct" className="input !w-20 text-right" inputMode="decimal" defaultValue={r.pct || ""} placeholder="%" aria-label={`Payment ${i + 1} percent`} />
                <span className="text-sm text-slate-500">%</span>
              </div>
            ))}
          </div>
        </Group>

        <Group title="Introduction & terms">
          <p className="text-xs text-slate-500">
            Your standard wording. New estimates start with it (unless their estimate template has its own); change it on any proposal by clicking it. Proposals already made keep
            their own.
          </p>
          <Field label="Introduction" htmlFor="p-intro" hint="Opens the proposal, under the header: a thank-you and what it covers.">
            <textarea id="p-intro" name="proposalIntro" rows={4} className="input" defaultValue={company?.proposalIntro ?? ""} />
          </Field>
          <Check name="terms" label="Show the terms & conditions" checked={o.terms} />
          <Field label="Terms & conditions" htmlFor="p-terms" hint="A short line on its own above a paragraph prints as its heading.">
            <textarea id="p-terms" name="proposalTerms" rows={8} className="input" defaultValue={company?.proposalTerms ?? ""} />
          </Field>
        </Group>

        <Group title="Material price escalation">
          <p className="text-xs text-slate-500">
            When material prices rise more than this after a proposal, the estimate turns the price change red: past it, your contract lets you charge the increase.
            Each proposal&apos;s Material list is saved the day it&apos;s sent and the day it&apos;s signed (Files → Bid snapshots).
          </p>
          <Field label="Escalation trigger (%)" htmlFor="p-escalation">
            <input id="p-escalation" name="escalationPct" type="number" min={0} max={100} step="0.5" className="input !w-28" defaultValue={company?.escalationPct ?? 10} />
          </Field>
          <p className="text-sm font-medium text-slate-700">Measure price increases from</p>
          <Radio name="escalationFrom" value="SENT" label="The day the proposal was sent" checked={company?.escalationFrom !== "SIGNED"} />
          <Radio name="escalationFrom" value="SIGNED" label="The day the contract was signed" checked={company?.escalationFrom === "SIGNED"} />
          <p className="text-xs text-slate-500">Use what your contract says. Before it&apos;s signed, the estimate measures from the day it was sent either way.</p>
        </Group>
      </div>
      <SubmitButton>Save</SubmitButton>
    </form>
  );
}
