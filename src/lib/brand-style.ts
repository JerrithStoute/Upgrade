/**
 * More of the work screens' look, set once for the whole company (Settings → Company profile →
 * Branding) — everyone on the team sees the same screens, on any computer:
 * - the highlight color: the marker on the menu item you're on, the tab you're on, the box you're
 *   typing in (out of the box the logo's yellow; with a main color, a tint of it);
 * - the menu: light, or in the main color;
 * - the screen: Bright (white, as built), Soft (warm off-white, dimmer — easier on the eyes), or a
 *   background color of your own (kept light, so text stays readable — the cards and grays follow it);
 * - how much plan sheets are dimmed on the takeoff screen (Soft), so a white page doesn't glare.
 * Only the work screens change: printouts, PDFs, the client and vendor portals and emails keep
 * the company's main color and logo as they are. Pure (server and client).
 */
import { isHexColor } from "./brand";

export type ScreenLook = "bright" | "soft" | "color";
export type MenuLook = "light" | "brand";
/** `intensity`: how strong a background of your own is, 0 (barely there) to 100 (as strong as text stays readable on). */
export type BrandStyle = { accent: string | null; menu: MenuLook; screen: ScreenLook; background: string | null; intensity: number; planDim: number };

export const DEFAULT_INTENSITY = 60;
export const DEFAULT_STYLE: BrandStyle = { accent: null, menu: "light", screen: "bright", background: null, intensity: DEFAULT_INTENSITY, planDim: 0 };

/** Ready-made background colors (pale; any color picked is kept this light). */
export const BACKGROUND_PRESETS: { name: string; hex: string }[] = [
  { name: "Sage", hex: "#e3e9df" },
  { name: "Sand", hex: "#ece5d8" },
  { name: "Sky", hex: "#dfe8f1" },
  { name: "Gray-blue", hex: "#e2e6ec" },
  { name: "Lavender", hex: "#e6e2ee" },
  { name: "Blush", hex: "#efe2e0" },
  { name: "Mint", hex: "#dcebe6" },
  { name: "Stone", hex: "#e4e2df" },
];

/** Ready-made highlight colors. */
export const ACCENT_PRESETS: { name: string; hex: string }[] = [
  { name: "Builder Station yellow", hex: "#fbbf24" },
  { name: "Orange", hex: "#f97316" },
  { name: "Red", hex: "#ef4444" },
  { name: "Green", hex: "#22c55e" },
  { name: "Teal", hex: "#14b8a6" },
  { name: "Sky", hex: "#0ea5e9" },
  { name: "Purple", hex: "#a855f7" },
  { name: "Gray", hex: "#94a3b8" },
];

export const PLAN_DIM_MAX = 40;

export function parseBrandStyle(json: string | null | undefined): BrandStyle {
  if (!json) return { ...DEFAULT_STYLE };
  try {
    const raw = JSON.parse(json) as Partial<BrandStyle>;
    const dim = Number(raw.planDim);
    return {
      accent: isHexColor(raw.accent) ? raw.accent.toLowerCase() : null,
      menu: raw.menu === "brand" ? "brand" : "light",
      screen: raw.screen === "soft" ? "soft" : raw.screen === "color" && isHexColor(raw.background) ? "color" : "bright",
      background: raw.screen === "color" && isHexColor(raw.background) ? raw.background.toLowerCase() : null,
      intensity: Number.isFinite(Number(raw.intensity)) && raw.intensity != null ? Math.max(0, Math.min(100, Math.round(Number(raw.intensity)))) : DEFAULT_INTENSITY,
      planDim: Number.isFinite(dim) ? Math.max(0, Math.min(PLAN_DIM_MAX, Math.round(dim))) : 0,
    };
  } catch {
    return { ...DEFAULT_STYLE };
  }
}

/** Stored form — null when it's all the built-in look. */
export function brandStyleJson(s: BrandStyle): string | null {
  const clean = parseBrandStyle(JSON.stringify(s));
  return JSON.stringify(clean) === JSON.stringify(DEFAULT_STYLE) ? null : JSON.stringify(clean);
}

function mix(hex: string, toward: string, amount: number) {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(toward.slice(1), 16);
  const ch = (n: number, s: number) => (n >> s) & 255;
  const out = [16, 8, 0].map((s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * amount));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** The highlight color's three shades (the program's markers use 300, 400 and 500). */
export function accentShades(hex: string) {
  return { 300: mix(hex, "#ffffff", 0.35), 400: hex.toLowerCase(), 500: mix(hex, "#000000", 0.15) };
}

/** Soft: warm off-white cards on a warm gray page, softer grays — the program's whites and grays swapped. */
export const SOFT = {
  background: "#e9e4da",
  white: "#faf7f0",
  slate: {
    50: "#f2eee5",
    100: "#e9e3d7",
    200: "#dcd4c4",
    300: "#c8beab",
    400: "#948c7d",
    500: "#6e675b",
    600: "#565046",
    700: "#423d36",
    800: "#2e2a25",
    900: "#1f1c19",
  },
} as const;

function hsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

function hex(h: number, s: number, l: number) {
  const S = Math.max(0, Math.min(100, s)) / 100;
  const L = Math.max(0, Math.min(100, l)) / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** The darkest a background goes, and the most color it keeps — so black text stays readable on it. Faintest: nearly white. */
const BG_MIN_L = 82;
const BG_MAX_S = 45;
const BG_FAINT_L = 97;

/**
 * A background color as it will be used, at an intensity: 100 is the color itself, kept pale enough
 * to read on (lightened and calmed if it's dark or loud); lower fades it toward white.
 */
export function usableBackground(color: string, intensity = 100) {
  const [h, s, l] = hsl(color);
  const k = Math.max(0, Math.min(100, intensity)) / 100;
  const full = { s: Math.min(s, BG_MAX_S), l: Math.max(l, BG_MIN_L) };
  return hex(h, full.s * k, BG_FAINT_L - (BG_FAINT_L - full.l) * k);
}

/** True when a picked background had to be lightened (or calmed) to stay readable, even at full strength. */
export const backgroundAdjusted = (color: string) => usableBackground(color, 100) !== color.toLowerCase();

/**
 * The palette for a background of your own: the page is it, cards a lighter shade of it, and the
 * lines and grays tinted to go with it (text kept as dark as the program's own).
 */
export function colorPalette(color: string, intensity = DEFAULT_INTENSITY) {
  const bg = usableBackground(color, intensity);
  const [h, s, l] = hsl(bg);
  const tint = Math.min(s, 30);
  const text = Math.min(s, 14);
  return {
    background: bg,
    white: hex(h, tint * 0.8, l + (100 - l) * 0.75),
    slate: {
      50: hex(h, tint, l + (100 - l) * 0.45),
      100: hex(h, tint, l - 2),
      200: hex(h, tint, l - 8),
      300: hex(h, tint * 0.9, l - 18),
      400: hex(h, text, 58),
      500: hex(h, text, 43),
      600: hex(h, text, 33),
      700: hex(h, text, 26),
      800: hex(h, text, 18),
      900: hex(h, text, 11),
    } as Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900, string>,
  };
}

/** The screen's colors (null for Bright: the program's own). */
export function screenPalette(s: BrandStyle) {
  if (s.screen === "soft") return { background: SOFT.background, white: SOFT.white, slate: SOFT.slate as Record<string, string> };
  if (s.screen === "color" && s.background) return colorPalette(s.background, s.intensity);
  return null;
}

/**
 * CSS for the work screens (the team's pages only — the (app) layout puts it there): the highlight
 * color, Soft's colors, and the dimmed plan. Screen only, so printing is never affected.
 */
export function workScreenCss(s: BrandStyle) {
  const vars: string[] = [];
  if (s.accent) {
    const a = accentShades(s.accent);
    vars.push(`--color-blue-300:${a[300]}`, `--color-blue-400:${a[400]}`, `--color-blue-500:${a[500]}`);
  }
  const palette = screenPalette(s);
  if (palette) {
    vars.push(`--background:${palette.background}`, `--color-white:${palette.white}`);
    for (const [k, v] of Object.entries(palette.slate)) vars.push(`--color-slate-${k}:${v}`);
  }
  const rules: string[] = [];
  if (vars.length) rules.push(`:root{${vars.join(";")}}`);
  if (palette) rules.push("body{background:var(--background)}");
  if (s.planDim > 0) rules.push(`canvas[data-plan]{filter:brightness(${(1 - s.planDim / 100).toFixed(2)})}`);
  return rules.length ? `@media screen{${rules.join("")}}` : "";
}
