/**
 * Branding colors. The app's main color is Tailwind's "blue" scale (buttons are
 * blue-700, links blue-700, highlights blue-50…); a company's brand color replaces
 * that whole scale, so everything follows from one color. Pure (server and client).
 */

export const DEFAULT_BRAND = "#1d4ed8"; // Tailwind blue-700

/** Ready-made colors to click. */
export const BRAND_PRESETS: { name: string; hex: string }[] = [
  { name: "Blue", hex: "#1d4ed8" },
  { name: "Navy", hex: "#1e3a8a" },
  { name: "Teal", hex: "#0f766e" },
  { name: "Green", hex: "#15803d" },
  { name: "Forest", hex: "#166534" },
  { name: "Red", hex: "#b91c1c" },
  { name: "Burnt orange", hex: "#c2410c" },
  { name: "Gold", hex: "#a16207" },
  { name: "Purple", hex: "#6d28d9" },
  { name: "Charcoal", hex: "#334155" },
];

export const isHexColor = (v: string | null | undefined): v is string => !!v && /^#[0-9a-f]{6}$/i.test(v);

function toHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

function toHex(h: number, s: number, l: number) {
  const S = Math.max(0, Math.min(100, s)) / 100;
  const L = Math.max(0, Math.min(100, l)) / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)]
    .map((x) =>
      Math.round(x * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/**
 * The full scale from one color: it sits at 700 (buttons, links), darkened if it's
 * too light for white text, with lighter tints above and darker shades below.
 */
export function brandShades(hex: string): Record<(typeof SHADES)[number], string> {
  const [h, s, l] = toHsl(isHexColor(hex) ? hex : DEFAULT_BRAND);
  const L7 = Math.max(20, Math.min(50, l)); // readable white text on buttons (the original blue sits at ~48)
  const tint = Math.min(s, 90);
  const L: Record<(typeof SHADES)[number], number> = {
    50: 97,
    100: 93.5,
    200: 87,
    300: 77,
    400: 65,
    500: L7 + (65 - L7) * 0.55,
    600: L7 + (65 - L7) * 0.25,
    700: L7,
    800: L7 * 0.84,
    900: L7 * 0.7,
    950: L7 * 0.5,
  };
  const out = {} as Record<(typeof SHADES)[number], string>;
  for (const k of SHADES) out[k] = k === 700 && L7 === l ? hex.toLowerCase() : toHex(h, k <= 200 ? tint * 0.9 : s, L[k]);
  return out;
}

/** CSS that swaps the app's blue for the brand color (empty for the built-in blue). */
export function brandCss(hex: string | null | undefined) {
  if (!isHexColor(hex) || hex.toLowerCase() === DEFAULT_BRAND) return "";
  const shades = brandShades(hex);
  return `:root{${SHADES.map((k) => `--color-blue-${k}:${shades[k]};`).join("")}}`;
}
