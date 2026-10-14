import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeCostCodes } from "@/lib/projects";
import { parseMarkupTable } from "@/lib/markup";
import { Card, CardBody, CardHeader, Field, SubmitButton } from "@/components/ui";
import { DefaultMarkupTable } from "./default-table";
import { saveAllowanceDefault, saveDefaultMarkupTable } from "./actions";

export const metadata = { title: "Markup, margin & tax" };

/** What new estimates start with: the Markup, margin & tax table, and whether new allowances carry your profit. */
export default async function MarkupSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireAdmin();
  const { saved } = await searchParams;
  const [company, costCodes] = await Promise.all([db.company.findFirst({ select: { markupTable: true, allowanceProfit: true } }), activeCostCodes()]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Markup, margin & tax table"
          description="New estimates and estimate templates start with this table. Each estimate can change its own with Markup & tax on the estimate."
        />
        <CardBody>
          <DefaultMarkupTable
            initial={parseMarkupTable(company?.markupTable, 20)}
            costCodes={costCodes.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
            save={saveDefaultMarkupTable}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Allowances" description="Whether a new allowance's amount carries your profit. You can switch any allowance on its selection or on the estimate." />
        <CardBody>
          <form action={saveAllowanceDefault} className="flex flex-wrap items-end gap-3">
            {saved ? <p className="w-full rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">Saved.</p> : null}
            <Field label="Allowances start with" htmlFor="allowanceProfit">
              <select id="allowanceProfit" name="allowanceProfit" className="input" defaultValue={company?.allowanceProfit ? "in" : "out"}>
                <option value="out">Profit out (at cost)</option>
                <option value="in">Profit in</option>
              </select>
            </Field>
            <SubmitButton>Save</SubmitButton>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
