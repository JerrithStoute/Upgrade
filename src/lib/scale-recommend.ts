import { PDF_UNITS_PER_INCH, PRESET_SCALES } from "./takeoff";

/**
 * A sheet's recommended scale — a suggestion only: it's marked "Recommended" in the scale list
 * and the contractor picks it (or not). Nothing is set by itself. When it isn't clear, there's
 * no recommendation at all — a wrong one is worse than none.
 *
 * Two clues, read off the PDF:
 * 1. The scale note, when the PDF has it as real text ("SCALE: 1/4" = 1'-0"").
 * 2. Door swings: each is a quarter circle whose radius is the door's width, and doors come in
 *    a few widths (24" to 36"). At the right scale they land on those widths; at the wrong one
 *    they mostly don't. (Most CAD plans draw their lettering as lines, so the note can't be read.)
 * When both speak and disagree, there's no recommendation.
 */

export type ScaleClues = {
  /** Radii of the quarter-circle arcs drawn on the sheet, in page units. */
  arcRadii: number[];
  /** The sheet's text, if the PDF has any. */
  text: string;
};

export type ScaleRecommendation = { label: string; paperInchesPerFoot: number; why: string };

/** The scales floor plans are drawn at — door swings are only looked for at these. */
const PLAN_SCALES = PRESET_SCALES.filter((s) => s.label.endsWith(`= 1'-0"`) && s.paperInchesPerFoot <= 1 / 2);

/** Door leaf widths, inches. */
const DOOR_WIDTHS = [24, 28, 30, 32, 34, 36];
const DOOR_TOLERANCE = 0.75;
/** Fewer door swings than this landing on real widths isn't enough to go on (an elevation's arches can fake a few). */
const MIN_DOORS = 6;
/** Arcs this size (real inches, at a given scale) could be doors; smaller are lettering, bigger aren't doors. */
const DOOR_RANGE: [number, number] = [18, 48];

const upfOf = (paperInchesPerFoot: number) => paperInchesPerFoot * PDF_UNITS_PER_INCH;

/** "3/16" = 1'-0"" style notes in the sheet's text → the preset each one names. */
export function scalesInText(text: string) {
  const found: number[] = [];
  const t = text.replace(/[”″]/g, '"').replace(/[’′]/g, "'");
  // 3/16" = 1'-0"  ·  1/4"=1'  ·  1-1/2" = 1'-0"  ·  1" = 1'-0"
  for (const m of t.matchAll(/(\d+)(?:\s*-\s*(\d+)\s*\/\s*(\d+)|\s*\/\s*(\d+))?\s*("|''|in\.?)\s*=\s*1\s*('|ft\.?|'-0"?)/gi)) {
    const whole = Number(m[1]);
    const value = m[2] ? whole + Number(m[2]) / Number(m[3]) : m[4] ? whole / Number(m[4]) : whole;
    const preset = PRESET_SCALES.find((s) => Math.abs(s.paperInchesPerFoot - value) < 1e-9);
    if (preset) found.push(preset.paperInchesPerFoot);
  }
  // A stacked fraction: the 1 over the 4 with no slash in the text ("SC: 1 4 " = 1'-0"").
  for (const m of t.matchAll(/(?<![\d/-])(\d)\s+(\d{1,2})\s*("|'')\s*=\s*1\s*('|ft\.?|'-0"?)/gi)) {
    const value = Number(m[1]) / Number(m[2]);
    const preset = Number(m[1]) < Number(m[2]) ? PRESET_SCALES.find((s) => Math.abs(s.paperInchesPerFoot - value) < 1e-9) : undefined;
    if (preset) found.push(preset.paperInchesPerFoot);
  }
  // 1" = 20'
  for (const m of t.matchAll(/1\s*("|in\.?)\s*=\s*(\d+)\s*('|ft\.?)(?!\s*-\s*[1-9])/gi)) {
    const feet = Number(m[2]);
    if (feet <= 1) continue;
    const preset = PRESET_SCALES.find((s) => Math.abs(s.paperInchesPerFoot - 1 / feet) < 1e-9);
    if (preset) found.push(preset.paperInchesPerFoot);
  }
  return found;
}

/** How well the door swings fit a scale: doors landing on a real width, squared, over the door-sized arcs. */
function doorFit(radii: number[], paperInchesPerFoot: number) {
  const upf = upfOf(paperInchesPerFoot);
  let doors = 0;
  let fits = 0;
  for (const r of radii) {
    const inches = (r / upf) * 12;
    if (inches < DOOR_RANGE[0] || inches > DOOR_RANGE[1]) continue;
    doors++;
    if (DOOR_WIDTHS.some((w) => Math.abs(inches - w) <= DOOR_TOLERANCE)) fits++;
  }
  return { fits, doors, score: doors ? (fits * fits) / doors : 0 };
}

function byDoors(radii: number[]): { paperInchesPerFoot: number; fits: number } | null {
  const ranked = PLAN_SCALES.map((s) => ({ s, ...doorFit(radii, s.paperInchesPerFoot) })).sort((a, b) => b.score - a.score);
  const [best, next] = ranked;
  // Clear only: enough doors land on real widths, most of the door-sized arcs do, and no other scale comes close.
  if (!best || best.fits < MIN_DOORS || best.fits < best.doors * 0.6 || (next && best.score < next.score * 2.5)) return null;
  return { paperInchesPerFoot: best.s.paperInchesPerFoot, fits: best.fits };
}

function byText(text: string): number | null {
  const found = scalesInText(text);
  if (!found.length) return null;
  const counts = new Map<number, number>();
  for (const f of found) counts.set(f, (counts.get(f) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  // Several drawings at different scales on one sheet (a plan and its details): only when one is most of them.
  if (ranked.length > 1 && ranked[0][1] < ranked[1][1] * 2) return null;
  return ranked[0][0];
}

const labelOf = (paperInchesPerFoot: number) => PRESET_SCALES.find((s) => s.paperInchesPerFoot === paperInchesPerFoot)!.label;

export function recommendScale(clues: ScaleClues): ScaleRecommendation | null {
  const fromText = byText(clues.text);
  const fromDoors = byDoors(clues.arcRadii);
  if (fromText !== null && fromDoors !== null && fromText !== fromDoors.paperInchesPerFoot) return null;
  if (fromText !== null) {
    const label = labelOf(fromText);
    return { label, paperInchesPerFoot: fromText, why: `The sheet says ${label}${fromDoors ? ", and its door swings match" : ""}.` };
  }
  if (fromDoors) {
    const label = labelOf(fromDoors.paperInchesPerFoot);
    return { label, paperInchesPerFoot: fromDoors.paperInchesPerFoot, why: `At this scale ${fromDoors.fits} door swings come out standard door widths (24" to 36").` };
  }
  return null;
}
