import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseCoDefaults } from "@/lib/change-orders";
import { Card, CardBody, CardHeader, Field, FormGrid, SubmitButton } from "@/components/ui";
import { saveChangeOrderDefaults } from "./actions";

export const metadata = { title: "Change order defaults" };

/** What a new change order starts with. Each change order can still change its own (and "Use as default" there saves back here). */
export default async function ChangeOrderDefaultsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireAdmin();
  const { saved } = await searchParams;
  const company = await db.company.findFirst({ select: { changeOrderDefaults: true } });
  const d = parseCoDefaults(company?.changeOrderDefaults);
  const mode = d.profitMode ?? "NONE";

  return (
    <form action={saveChangeOrderDefaults} className="max-w-3xl space-y-6">
      {saved ? <p className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">Saved — new change orders start this way.</p> : null}
      <Card>
        <CardHeader title="Wording" description="What a new change order says before and after its items. Each one can still be changed." />
        <CardBody className="space-y-4">
          <Field label="Introduction" htmlFor="co-intro">
            <textarea id="co-intro" name="introText" rows={3} className="input" defaultValue={d.introText ?? ""} placeholder="e.g. Here are the changes we talked about…" />
          </Field>
          <Field label="Closing" htmlFor="co-closing">
            <textarea id="co-closing" name="closingText" rows={3} className="input" defaultValue={d.closingText ?? ""} />
          </Field>
          <Field label="Terms" htmlFor="co-terms">
            <textarea id="co-terms" name="terms" rows={2} className="input" defaultValue={d.terms ?? ""} placeholder="e.g. Payment due on approval" />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Profit" description="Your profit on a new change order — any line can still have its own." />
        <CardBody>
          <FormGrid>
            <Field label="Profit" htmlFor="co-profit-mode">
              <select id="co-profit-mode" name="profitMode" className="input" defaultValue={mode}>
                <option value="NONE">No profit</option>
                <option value="PCT">Markup %</option>
                <option value="AMOUNT">Profit $</option>
              </select>
            </Field>
            <Field label="Markup % or profit $" htmlFor="co-profit-value" hint="Used when Profit is Markup % or Profit $.">
              <input id="co-profit-value" name="profitValue" type="number" min={0} step="0.01" className="input" defaultValue={d.profitValue ?? ""} />
            </Field>
            <Field label="Shown to the client as" htmlFor="co-profit-shown">
              <select id="co-profit-shown" name="profitShown" className="input" defaultValue={d.profitShown ?? "LINE"}>
                <option value="LINE">Its own line</option>
                <option value="FOLDED">Folded into the prices</option>
              </select>
            </Field>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="If the client declines" />
        <CardBody className="space-y-2 text-sm text-slate-700">
          <label className="flex items-center gap-2">
            <input type="radio" name="ifDeclined" value="KEEP" defaultChecked={(d.ifDeclined ?? "KEEP") === "KEEP"} className="h-4 w-4" />
            Take the selections off the change order, but keep the choices made
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="ifDeclined" value="CLEAR" defaultChecked={d.ifDeclined === "CLEAR"} className="h-4 w-4" />
            Take the selections off the change order and clear the choices made
          </label>
        </CardBody>
      </Card>

      <div className="flex items-center gap-3">
        <SubmitButton>Save</SubmitButton>
        <span className="text-xs text-slate-500">Change orders already started keep what they have.</span>
      </div>
    </form>
  );
}
