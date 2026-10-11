import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  accrued,
  carryToClosing,
  closedMonths,
  dailyRate,
  dayNo,
  futureDrawInterest,
  hoaCredit,
  loanOn,
  netSheet,
  offerMath,
  priceForProfit,
  taxProration,
  type Carry,
  type Sheet,
} from "./spec-math";

const d = (s: string) => new Date(`${s}T12:00:00`);
const near = (a: number, b: number, tol = 0.01) => assert.ok(Math.abs(a - b) < tol, `${a} ≈ ${b}`);
const base = { amount: 0, frequency: "MONTHLY", loanBalance: null, ratePct: null, startDate: d("2026-09-01"), endDate: null };

describe("carrying costs", () => {
  it("works interest out from the balance and rate", () => {
    const loan: Carry = { ...base, kind: "INTEREST", loanBalance: 365000, ratePct: 10 };
    near(dailyRate(loan), 100);
    near(accrued(loan, d("2026-09-01"), d("2026-10-01")), 3000); // 30 days
  });

  it("follows the draws day by day", () => {
    // $0 to start; $36,500 drawn Sep 1, another $36,500 Sep 16; 10%: $10 a day, then $20.
    const loan: Carry = {
      ...base,
      kind: "INTEREST",
      loanBalance: 0,
      ratePct: 10,
      moves: [
        { kind: "DRAW", date: d("2026-09-01"), amount: 36500, ratePct: null },
        { kind: "DRAW", date: d("2026-09-16"), amount: 36500, ratePct: null },
      ],
    };
    near(accrued(loan, d("2026-09-01"), d("2026-10-01")), 15 * 10 + 15 * 20);
    assert.equal(loanOn(loan, dayNo(d("2026-09-20"))).balance, 73000);
    near(dailyRate(loan, d("2026-09-20")), 20);
  });

  it("takes paydowns and rate changes from their day", () => {
    const loan: Carry = {
      ...base,
      kind: "INTEREST",
      loanBalance: 73000,
      ratePct: 10,
      moves: [
        { kind: "PAYDOWN", date: d("2026-09-11"), amount: 36500, ratePct: null },
        { kind: "RATE", date: d("2026-09-21"), amount: 0, ratePct: 20 },
      ],
    };
    // 10 days at $20, 10 at $10, 10 at $20 (half the balance at twice the rate).
    near(accrued(loan, d("2026-09-01"), d("2026-10-01")), 200 + 100 + 200);
  });

  it("spreads monthly and yearly amounts by the day", () => {
    near(dailyRate({ ...base, kind: "AMOUNT", amount: 365, frequency: "YEARLY" }), 1);
    near(accrued({ ...base, kind: "AMOUNT", amount: 304.17, frequency: "MONTHLY" }, d("2026-09-01"), d("2026-09-11")), 100);
  });

  it("only counts the days it runs, and stops when sold", () => {
    const hoa: Carry = { ...base, kind: "AMOUNT", amount: 365, frequency: "YEARLY", startDate: d("2026-09-10"), endDate: d("2026-09-19") };
    near(accrued(hoa, d("2026-09-01"), d("2026-10-01")), 10);
    near(accrued({ ...hoa, endDate: null }, d("2026-09-01"), d("2026-10-01"), d("2026-09-15")), 5);
  });

  it("counts a one-time cost on its day", () => {
    const staging: Carry = { ...base, kind: "AMOUNT", amount: 1500, frequency: "ONCE", startDate: d("2026-09-20") };
    assert.equal(accrued(staging, d("2026-09-01"), d("2026-10-01")), 1500);
    assert.equal(accrued(staging, d("2026-10-01"), d("2026-11-01")), 0);
  });

  it("lists the months that are over", () => {
    const c: Carry = { ...base, kind: "AMOUNT", amount: 100, startDate: d("2026-08-15") };
    assert.deepEqual(
      closedMonths(c, d("2026-10-08")).map((m) => m.key),
      ["2026-08", "2026-09"],
    );
    assert.deepEqual(
      closedMonths(c, d("2026-10-08"), d("2026-09-01")).map((m) => m.key),
      ["2026-08"],
    );
  });
});

describe("carrying to a closing date", () => {
  it("adds what's charged to what's still coming", () => {
    const loan = {
      kind: "INTEREST",
      amount: 0,
      frequency: "MONTHLY",
      loanBalance: 365000,
      ratePct: 10,
      startDate: "2026-09-01T12:00:00",
      endDate: null,
      moves: [],
      posted: 3000,
      nextFrom: "2026-10-01T00:00:00",
    };
    near(carryToClosing([loan], d("2026-10-10"), null), 4000);
    near(carryToClosing([{ ...loan, kind: "AMOUNT", frequency: "ONCE", amount: 1500, posted: 1500, nextFrom: null }], d("2026-12-01"), null), 1500);
  });

  it("counts interest on the draws still to come, half the time", () => {
    // $73,000 left to draw at 10% ($20 a day all out), 30 days to closing → about $300.
    near(futureDrawInterest(73000, 10, d("2026-10-01"), d("2026-10-31")), 300);
  });
});

describe("prorations", () => {
  it("credits the buyer property taxes Jan 1 to closing", () => {
    near(taxProration(3650, d("2026-03-01")), 590); // 59 days at $10
    near(taxProration(6000, d("2026-11-15")), (6000 * 318) / 365);
  });
  it("gets HOA dues paid ahead back", () => {
    near(hoaCredit(365, d("2026-12-31"), d("2026-12-22")), 10);
    assert.equal(hoaCredit(365, d("2026-06-30"), d("2026-12-22")), 0);
  });
});

describe("the net sheet", () => {
  const sheet: Sheet = {
    listPct: 3,
    buyerPct: 3,
    lines: [
      { name: "Owner's title policy", kind: "PCT", value: 0.5, title: true },
      { name: "Escrow fee", kind: "FLAT", value: 1000 },
    ],
    concessions: 5000,
    repairs: 1000,
    annualTax: 3650,
    hoaAnnual: null,
    hoaPaidThrough: null,
  };
  const closing = d("2026-03-01"); // $590 of taxes

  it("takes every line off the price", () => {
    const n = netSheet(400000, sheet, closing);
    near(n.selling, 24000 + 2000 + 1000 + 5000 + 1000 + 590);
    near(n.net, 400000 - 33590);
    assert.ok(n.lines.some((l) => l.label.startsWith("Owner's title policy (0.5%)")));
  });

  it("uses the title company's quote when there is one", () => {
    near(netSheet(400000, { ...sheet, titleQuote: 1800 }, closing).selling, 24000 + 1800 + 1000 + 5000 + 1000 + 590);
  });

  it("finds the price for a profit, and break-even", () => {
    const cost = 330000;
    const p = priceForProfit(25000, sheet, closing, cost)!;
    near(offerMath(p, sheet, closing, cost).profit, 25000);
    near(offerMath(priceForProfit(0, sheet, closing, cost)!, sheet, closing, cost).profit, 0);
    // With a quote, the title doesn't grow with the price.
    const q = { ...sheet, titleQuote: 1800 };
    near(offerMath(priceForProfit(25000, q, closing, cost)!, q, closing, cost).profit, 25000);
  });
});
