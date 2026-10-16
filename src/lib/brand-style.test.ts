import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STYLE, brandStyleJson, colorPalette, parseBrandStyle, usableBackground, workScreenCss } from "./brand-style";

describe("the work screens' look", () => {
  it("the built-in look stores nothing and adds no CSS", () => {
    assert.equal(brandStyleJson(DEFAULT_STYLE), null);
    assert.equal(workScreenCss(DEFAULT_STYLE), "");
    assert.deepEqual(parseBrandStyle(null), DEFAULT_STYLE);
  });

  it("Soft, a highlight color and dimmed plans: screen only (printing is never affected)", () => {
    const css = workScreenCss({ ...DEFAULT_STYLE, accent: "#22c55e", menu: "brand", screen: "soft", planDim: 20 });
    assert.ok(css.startsWith("@media screen{"));
    assert.match(css, /--color-white:#faf7f0/);
    assert.match(css, /--color-blue-400:#22c55e/);
    assert.match(css, /canvas\[data-plan\]\{filter:brightness\(0\.80\)\}/);
  });

  it("anything odd in storage falls back to the built-in look, and dimming is capped", () => {
    assert.deepEqual(parseBrandStyle("nope"), DEFAULT_STYLE);
    assert.deepEqual(parseBrandStyle(JSON.stringify({ accent: "red", menu: "x", screen: "dark", planDim: 99 })), { ...DEFAULT_STYLE, planDim: 40 });
    assert.deepEqual(parseBrandStyle(brandStyleJson({ ...DEFAULT_STYLE, accent: "#ABCDEF", menu: "brand", screen: "soft", planDim: 15 })), { ...DEFAULT_STYLE, accent: "#abcdef", menu: "brand", screen: "soft", planDim: 15 });
  });

  it("a background of your own: kept light enough to read on, its strength from faint to strong", () => {
    const navy = "#1e3a8a";
    const faint = usableBackground(navy, 0);
    const strong = usableBackground(navy, 100);
    const lightness = (h: string) => {
      const n = parseInt(h.slice(1), 16);
      return (Math.max((n >> 16) & 255, (n >> 8) & 255, n & 255) + Math.min((n >> 16) & 255, (n >> 8) & 255, n & 255)) / 2 / 255;
    };
    assert.ok(lightness(strong) >= 0.8, "even a dark navy comes out pale enough for black text");
    assert.ok(lightness(faint) > lightness(strong), "faint is lighter than strong");
    const pal = colorPalette(navy, 60);
    assert.ok(lightness(pal.white) > lightness(pal.background), "cards are lighter than the page");
    const css = workScreenCss({ ...DEFAULT_STYLE, screen: "color", background: navy, intensity: 60 });
    assert.ok(css.includes(`--background:${pal.background}`));
    assert.equal(parseBrandStyle(JSON.stringify({ screen: "color", background: "nope" })).screen, "bright", "no color picked: Bright");
  });
});
