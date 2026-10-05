import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BRAND, brandCss, brandShades, isHexColor } from "./brand";

const lightness = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  return (Math.max(...c) + Math.min(...c)) / 2;
};

describe("brand colors", () => {
  it("keeps the picked color for buttons and builds lighter and darker shades around it", () => {
    const s = brandShades("#15803d");
    assert.equal(s[700], "#15803d");
    const order = [s[50], s[100], s[300], s[500], s[700], s[900], s[950]].map(lightness);
    for (let i = 1; i < order.length; i++) assert.ok(order[i] < order[i - 1], "each shade darker than the last");
  });

  it("darkens a color too light for white button text", () => {
    assert.ok(lightness(brandShades("#fde047")[700]) <= 0.51);
  });

  it("leaves the original blue exactly as it is", () => {
    assert.equal(brandShades(DEFAULT_BRAND)[700], DEFAULT_BRAND);
  });

  it("only writes CSS for a real, non-default color", () => {
    assert.equal(brandCss(null), "");
    assert.equal(brandCss(DEFAULT_BRAND), "");
    assert.equal(brandCss("red"), "");
    assert.match(brandCss("#b91c1c"), /--color-blue-700:#b91c1c;/);
    assert.ok(isHexColor("#AbCdEf") && !isHexColor("#abc"));
  });
});
