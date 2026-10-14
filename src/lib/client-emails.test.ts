import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildProposal, clientCopy, DEFAULT_PROPOSAL_OPTIONS, NO_VIEW, type ProposalSpec } from "./proposal-options";

const line = (id: string, unitCost: number, markupPct = 20) => ({ id, description: `Item ${id}`, quantity: 2, unit: "ea", unitCost, markupPct, costType: "MATERIAL", isOptional: false });
const spec = (id: string, name: string, lines: ReturnType<typeof line>[], view = NO_VIEW): ProposalSpec => ({
  id,
  name,
  category: "Sitework",
  specText: `About ${name}`,
  isAllowance: false,
  kind: "SPECIFICATION",
  allowanceProfit: false,
  choice: null,
  view,
  lines,
});

describe("the client's copy of a proposal", () => {
  const specs = [spec("a", "Clearing", [line("1", 1000)]), spec("b", "Secret", [line("2", 500)], { ...NO_VIEW, show: false })];

  it("keeps the total the same", () => {
    const doc = buildProposal(specs, DEFAULT_PROPOSAL_OPTIONS, null);
    assert.equal(clientCopy(doc).total, doc.total);
  });

  it("takes hidden categories out of the data, not just off the page", () => {
    const copy = clientCopy(buildProposal(specs, DEFAULT_PROPOSAL_OPTIONS, null));
    const text = JSON.stringify(copy);
    assert.equal(text.includes("Secret"), false);
    assert.equal(text.includes("About Secret"), false);
    assert.equal(text.includes("Clearing"), true);
  });

  it("never carries what things cost you or your markup", () => {
    const text = JSON.stringify(clientCopy(buildProposal(specs, DEFAULT_PROPOSAL_OPTIONS, null)));
    assert.equal(/unitCost|markupPct|costType/.test(text), false);
  });

  it("blanks every amount but the total when only the total is shown", () => {
    const copy = clientCopy(buildProposal(specs, { ...DEFAULT_PROPOSAL_OPTIONS, totalOnly: true }, null));
    const amounts = copy.categories.flatMap((c) => [c.amount, ...c.divisions.flatMap((d) => [d.amount, ...(d.items ?? []).map((i) => i.amount)])]);
    assert.deepEqual([...new Set(amounts)], [0]);
    assert.ok(copy.total > 0);
  });
});
