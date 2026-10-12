import { DEFAULT_WALL_OPTIONS, lumberItemName, studItemName, withSheetSize } from "./takeoff";

/**
 * What a new company starts with (the "common lumber" box at sign-up) — the lists themselves.
 * Added by starter-lumber.ts. Nothing priced.
 */

export type StarterSize = { name: string; kind: string; widthIn: number; depthIn: number; soldAs: string; stockLengths: string | null; boardFeet: boolean };

const dim = (name: string, depthIn: number, stockLengths: string): StarterSize => ({ name, kind: "DIMENSIONAL", widthIn: 1.5, depthIn, soldAs: "STOCK", stockLengths, boardFeet: true });
const DEPTH = { "9-1/2": 9.5, "11-7/8": 11.875, "14": 14, "16": 16 } as const;
const iJoist = (brand: string, series: string, widthIn: number, depths: (keyof typeof DEPTH)[]): StarterSize[] =>
  depths.map((d) => ({ name: `${brand} ${series} ${d}"`, kind: "I_JOIST", widthIn, depthIn: DEPTH[d], soldAs: "EXACT_LF", stockLengths: "16-48", boardFeet: false }));
const engineered = (name: string, widthIn: number, depthIn: number, stockLengths: string | null): StarterSize => ({ name, kind: "ENGINEERED", widthIn, depthIn, soldAs: "EXACT_LF", stockLengths, boardFeet: false });

export const STARTER_MEMBER_SIZES: StarterSize[] = [
  // Sawn through 24'; 2x6 and 2x8 come on to 32' (finger-jointed past 24').
  dim("2x4", 3.5, "8-24"),
  dim("2x6", 5.5, "8-32"),
  dim("2x8", 7.25, "8-32"),
  dim("2x10", 9.25, "8-24"),
  dim("2x12", 11.25, "8-24"),
  ...iJoist("TJI", "110", 1.75, ["9-1/2", "11-7/8"]),
  ...iJoist("TJI", "210", 2.0625, ["9-1/2", "11-7/8", "14"]),
  ...iJoist("TJI", "230", 2.3125, ["9-1/2", "11-7/8", "14", "16"]),
  ...iJoist("TJI", "360", 2.3125, ["11-7/8", "14", "16"]),
  ...iJoist("TJI", "560", 3.5, ["11-7/8", "14", "16"]),
  ...iJoist("BCI", "4500s", 1.75, ["9-1/2", "11-7/8"]),
  ...iJoist("BCI", "5000s", 2, ["9-1/2", "11-7/8", "14"]),
  ...iJoist("BCI", "6000s", 2.3125, ["9-1/2", "11-7/8", "14", "16"]),
  ...iJoist("BCI", "60s 2.0", 2.3125, ["11-7/8", "14", "16"]),
  ...iJoist("BCI", "90s 2.0", 3.5, ["11-7/8", "14", "16"]),
  ...(
    [
      ["7-1/4", 7.25],
      ["9-1/4", 9.25],
      ["9-1/2", 9.5],
      ["11-1/4", 11.25],
      ["11-7/8", 11.875],
      ["14", 14],
      ["16", 16],
      ["18", 18],
    ] as const
  ).map(([d, n]) => engineered(`LVL 1-3/4x${d}`, 1.75, n, "12-48")),
  ...(
    [
      ["9-1/2", 9.5],
      ["11-7/8", 11.875],
      ["14", 14],
      ["16", 16],
    ] as const
  ).map(([d, n]) => engineered(`Glulam 3-1/2x${d}`, 3.5, n, null)),
  ...(
    [
      ["9", 9],
      ["10-1/2", 10.5],
      ["12", 12],
      ["13-1/2", 13.5],
      ["15", 15],
      ["16-1/2", 16.5],
      ["18", 18],
    ] as const
  ).map(([d, n]) => engineered(`Glulam 5-1/2x${d}`, 5.5, n, null)),
];

export type StarterItem = { name: string; category: string; unit: string; notes?: string };

/** The Item List entries a first wall takeoff orders, named the way it names them. */
export function starterItems(): StarterItem[] {
  const o = DEFAULT_WALL_OPTIONS;
  const plate = (size: string) => lumberItemName(size, size, Number(o.topPlateStock) || 16);
  const out: StarterItem[] = [];
  for (const size of ["2x4", "2x6"])
    for (const [inches, wall] of [
      [92.625, "8'"],
      [104.625, "9'"],
      [116.625, "10'"],
    ] as const)
      out.push({ name: studItemName(size, inches, true), category: "Framing Lumber", unit: "ea", notes: `Precut stud for ${wall} walls` });
  for (const size of ["2x4", "2x6"]) out.push({ name: plate(size), category: "Framing Lumber", unit: "ea", notes: "Top plates" });
  for (const size of ["2x4", "2x6"]) out.push({ name: plate(`${size} treated`), category: "Framing Lumber", unit: "ea", notes: "Bottom plates (treated)" });
  out.push({ name: withSheetSize(o.sheathingItem, o.sheathingSheet), category: "Sheathing", unit: "ea" });
  out.push({ name: withSheetSize(o.drywallItem, o.drywallSheet), category: "Drywall", unit: "ea" });
  return out;
}
