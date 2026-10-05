import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateFormula, formulaRefs, toDisplayFormula, toStoredFormula } from "./formula";

const params = [
  { id: "sf", name: "Heated sq. ft." },
  { id: "wall", name: "Wall area" },
  { id: "baths", name: "Bathrooms" },
];
const values = { sf: 2400, wall: 3210, baths: 3 };
const run = (typed: string) => {
  const s = toStoredFormula(typed, params);
  if ("error" in s) throw new Error(s.error);
  return evaluateFormula(s.formula, values, params);
};

describe("quantity formulas", () => {
  it("does the math with your parameters", () => {
    assert.equal(run("=[Heated sq. ft.] * 1.1").value, 2640);
    assert.equal(run("=roundup([Wall area] / 32)").value, 101);
    assert.equal(run("=([Bathrooms] + 1) * 2 - 1").value, 7);
    assert.equal(run("=[heated sq. ft.]×2").value, 4800); // names ignore case; × works
    assert.equal(run("=2^3 + -1").value, 7);
    assert.equal(run("=round(10/3, 2)").value, 3.33);
    assert.equal(run("=max([Bathrooms], 4)").value, 4);
  });

  it("stores ids so renaming a parameter keeps the formula", () => {
    const s = toStoredFormula("=[Heated sq. ft.] * 1.1", params);
    assert.ok("formula" in s);
    assert.equal(s.formula, "[#sf] * 1.1");
    assert.deepEqual(formulaRefs(s.formula), ["sf"]);
    assert.equal(toDisplayFormula(s.formula, [{ id: "sf", name: "Conditioned SF" }]), "=[Conditioned SF] * 1.1");
    assert.equal(toDisplayFormula(s.formula, []), "=[?] * 1.1");
  });

  it("explains what's wrong instead of guessing", () => {
    assert.deepEqual(toStoredFormula("=[Garage sq. ft.] * 2", params), { error: `There's no parameter called "Garage sq. ft."` });
    assert.ok("error" in toStoredFormula("=([Bathrooms] + 1", params));
    assert.ok("error" in toStoredFormula("=alert(1)", params));
    assert.ok("error" in toStoredFormula("=[Bathrooms] +", params));
    assert.ok("error" in toStoredFormula("=", params));
  });

  it("counts a parameter with no value as 0 and says which one", () => {
    const r = evaluateFormula("[#sf] + [#gone]", {}, params);
    assert.equal(r.value, 0);
    assert.deepEqual(r.missing, ["Heated sq. ft.", "a deleted parameter"]);
  });
});
