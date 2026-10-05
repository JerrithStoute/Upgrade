import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROPOSAL_OPTIONS, NO_VIEW, buildProposal, parseProposalOptions, type ProposalOptions, type ProposalSpec } from "./proposal-options";

const line = (id: string, qty: number, cost: number, markup: number, costType = "MATERIAL", isOptional = false) => ({
  id,
  description: id,
  quantity: qty,
  unit: "ea",
  unitCost: cost,
  markupPct: markup,
  costType,
  isOptional,
});

// Cost 1,000 + 500 + 1,000 = 2,500; price 1,200 + 600 + 1,200 = 3,000.
const specs: ProposalSpec[] = [
  {
    id: "a",
    name: "2000 Excavation",
    category: "Excavation and Foundation",
    specText: "Dig it",
    isAllowance: false,
    kind: "SPECIFICATION",
    allowanceProfit: false,
    choice: null,
    view: NO_VIEW,
    lines: [line("dig", 1, 1000, 20)],
  },
  {
    id: "b",
    name: "2100 Footing and Foundation",
    category: "Excavation and Foundation",
    specText: null,
    isAllowance: false,
    kind: "SPECIFICATION",
    allowanceProfit: false,
    choice: null,
    view: NO_VIEW,
    lines: [line("labor", 1, 500, 20, "LABOR"), line("upgrade", 1, 999, 20, "MATERIAL", true)],
  },
  {
    id: "c",
    name: "Flooring",
    category: "Finishes",
    specText: null,
    isAllowance: true,
    kind: "SELECTION",
    allowanceProfit: true,
    choice: null,
    view: NO_VIEW,
    lines: [line("tile", 100, 10, 20)],
  },
];
const opts = (p: Partial<ProposalOptions>): ProposalOptions => ({ ...DEFAULT_PROPOSAL_OPTIONS, ...p });

describe("proposal", () => {
  it("prices divisions and categories with profit built in, optional lines left out", () => {
    const d = buildProposal(specs, DEFAULT_PROPOSAL_OPTIONS, null);
    assert.deepEqual(
      d.categories.map((c) => [c.name, c.amount, c.divisions.map((x) => x.amount)]),
      [
        ["Excavation and Foundation", 1800, [1200, 600]],
        ["Finishes", 1200, [1200]],
      ],
    );
    assert.equal(d.total, 3000);
    assert.equal(d.fee, null);
    assert.deepEqual(
      d.optional.map((o) => [o.id, o.amount]),
      [["upgrade", 1198.8]],
    );
    assert.deepEqual(
      d.allowances.map((a) => [a.name, a.amount]),
      [["Flooring", 1200]],
    );
  });

  it("shows the allowance amount and TBD under the categories that need them", () => {
    const d = buildProposal(specs, opts({ profit: { mode: "FEE", label: "Fee", showPct: false } }), null);
    const flooring = d.categories[1].divisions[0];
    assert.deepEqual([flooring.allowance, flooring.tbd, flooring.amount], [1200, true, 1000]); // allowance includes profit even with a fee line
    assert.deepEqual([d.categories[0].divisions[0].allowance, d.categories[0].divisions[0].tbd], [null, false]);
    assert.equal(d.allowancesTotal, 1200);
    // Profit out: the allowance is the cost of its items.
    const atCost = buildProposal(
      specs.map((x) => (x.id === "c" ? { ...x, allowanceProfit: false } : x)),
      DEFAULT_PROPOSAL_OPTIONS,
      null,
    );
    assert.equal(atCost.categories[1].divisions[0].allowance, 1000);
    assert.equal(atCost.allowancesTotal, 1000);
    const off = buildProposal(specs, opts({ allowanceInline: false, selectionTbd: false }), null);
    assert.deepEqual([off.categories[1].divisions[0].allowance, off.categories[1].divisions[0].tbd], [null, false]);
  });

  it("shows the client's choice instead of TBD once it's made (on allowances too)", () => {
    const chosen = specs.map((x) =>
      x.id === "c" ? { ...x, choice: { name: "Wood floors", price: 1500 } } : x.id === "a" ? { ...x, kind: "SPECIFICATION", isAllowance: true, choice: "DECLINED" as const } : x,
    );
    const d = buildProposal(chosen, DEFAULT_PROPOSAL_OPTIONS, null);
    assert.deepEqual([d.categories[1].divisions[0].tbd, d.categories[1].divisions[0].choice], [true, { name: "Wood floors", price: 1500 }]);
    assert.deepEqual([d.categories[0].divisions[0].tbd, d.categories[0].divisions[0].choice], [true, "DECLINED"]);
  });

  it("scales everything to the base price so the numbers add up to what you quoted", () => {
    const d = buildProposal(specs, DEFAULT_PROPOSAL_OPTIONS, 3300);
    assert.deepEqual(
      d.categories.map((c) => c.amount),
      [1980, 1320],
    );
    assert.equal(d.total, 3300);
  });

  it("shows profit as one fee line with everything above at cost", () => {
    const d = buildProposal(specs, opts({ profit: { mode: "FEE", label: "Builder's fee", showPct: true } }), 3300);
    assert.deepEqual(
      d.categories.map((c) => c.amount),
      [1500, 1000],
    );
    assert.equal(d.subtotal, 2500);
    assert.deepEqual(d.fee, { label: "Builder's fee", pct: 32, amount: 800 });
    assert.equal(d.total, 3300);
  });

  it("adds tax on the whole price or on materials only", () => {
    const whole = buildProposal(specs, opts({ tax: { on: true, pct: 10, label: "Sales tax", base: "TOTAL" } }), null);
    assert.equal(whole.tax?.amount, 300);
    assert.equal(whole.total, 3300);
    const materials = buildProposal(specs, opts({ tax: { on: true, pct: 10, label: "Sales tax", base: "MATERIAL" } }), null);
    assert.equal(materials.tax?.amount, 240); // excavation 1,200 + tile 1,200
    assert.equal(materials.total, 3240);
  });

  it("puts the table's overhead into what the client pays and its tax rows on top", () => {
    const d = buildProposal(specs, DEFAULT_PROPOSAL_OPTIONS, null, { overhead: 300, taxes: [{ label: "Sales tax", pct: 8.25, amount: 165 }] });
    assert.deepEqual(
      d.categories.map((c) => c.amount),
      [1980, 1320],
    ); // 3,000 + 300 overhead, built into the prices
    assert.equal(d.tax?.amount, 165);
    assert.equal(d.total, 3465);
    const fee = buildProposal(specs, opts({ profit: { mode: "FEE", label: "Fee", showPct: false } }), null, { overhead: 300, taxes: [] });
    assert.equal(fee.fee?.amount, 800); // profit 500 + overhead 300
  });

  it("final total only hides every other price", () => {
    const d = buildProposal(specs, opts({ totalOnly: true, items: { show: true, qty: true, prices: true } }), null);
    assert.equal(d.showCategoryAmounts, false);
    assert.equal(d.showItemPrices, false);
    assert.ok(d.categories.every((c) => c.divisions.every((x) => !x.showPrice)));
  });

  it("lets one division override the rest", () => {
    const own = specs.map((s) => (s.id === "b" ? { ...s, view: { show: true, prices: false, items: true } } : s));
    const d = buildProposal(own, opts({ items: { show: false, qty: false, prices: false } }), null);
    const b = d.categories[0].divisions[1];
    assert.equal(b.showPrice, false);
    assert.deepEqual(
      b.items?.map((i) => i.id),
      ["labor"],
    );
    assert.equal(d.categories[0].divisions[0].items, null);
  });

  it("reads saved options, filling anything missing from the default", () => {
    const o = parseProposalOptions(JSON.stringify({ totalOnly: true, tax: { on: true, pct: 8.25 } }));
    assert.equal(o.totalOnly, true);
    assert.equal(o.tax.pct, 8.25);
    assert.equal(o.tax.label, "Sales tax");
    assert.equal(o.divisions.show, true);
    assert.deepEqual(parseProposalOptions("not json"), DEFAULT_PROPOSAL_OPTIONS);
  });
});
