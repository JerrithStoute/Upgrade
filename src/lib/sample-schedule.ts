/**
 * A sample schedule template: a new home, slab on grade, about 2,400 sq ft — from plans to
 * the client walkthrough. Lengths are workdays; each task lists what it waits on (and any
 * lag: the slab cures before framing, countertops are fabricated after templating). A place
 * to start, edited like any template.
 */

export type SampleTask = { key: string; name: string; phase: string; days: number; milestone?: boolean; after?: (string | [string, number])[] };

const COLORS: Record<string, string> = {
  "Pre-Construction": "#475569",
  "Site Work": "#92400e",
  Foundation: "#78716c",
  Framing: "#d97706",
  Exterior: "#0891b2",
  "Rough-Ins": "#2563eb",
  "Insulation & Drywall": "#7c3aed",
  "Interior Finishes": "#db2777",
  Final: "#059669",
};
export const phaseColor = (phase: string, milestone?: boolean) => (milestone ? "#7c3aed" : (COLORS[phase] ?? "#2563eb"));

export const SAMPLE_NEW_HOME_NAME = "Sample — New home, slab on grade";

export const SAMPLE_NEW_HOME: SampleTask[] = [
  // Pre-Construction
  { key: "plans", name: "Final plans & engineering", phase: "Pre-Construction", days: 10 },
  { key: "permit", name: "Building permit", phase: "Pre-Construction", days: 15, after: ["plans"] },
  { key: "insurance", name: "Builder's risk insurance in place", phase: "Pre-Construction", days: 1, milestone: true, after: ["permit"] },
  { key: "orderWindows", name: "Order windows & exterior doors", phase: "Pre-Construction", days: 1, milestone: true, after: ["permit"] },
  { key: "orderTrusses", name: "Order trusses", phase: "Pre-Construction", days: 1, milestone: true, after: ["permit"] },
  // Site Work
  { key: "clear", name: "Lot clearing", phase: "Site Work", days: 3, after: ["permit"] },
  { key: "tempPower", name: "Temporary power, toilet & dumpster", phase: "Site Work", days: 1, after: ["clear"] },
  { key: "silt", name: "Silt fence & construction entrance", phase: "Site Work", days: 1, after: ["clear"] },
  { key: "pad", name: "Fill & build the pad", phase: "Site Work", days: 4, after: ["clear"] },
  { key: "formSurvey", name: "Form board survey", phase: "Site Work", days: 1, after: ["pad"] },
  // Foundation
  { key: "plumbUnder", name: "Plumbing underground", phase: "Foundation", days: 3, after: ["formSurvey"] },
  { key: "termite", name: "Termite pretreat", phase: "Foundation", days: 1, after: ["plumbUnder"] },
  { key: "forms", name: "Forms, rebar & vapor barrier", phase: "Foundation", days: 5, after: ["plumbUnder"] },
  { key: "foundInsp", name: "Foundation inspection", phase: "Foundation", days: 1, milestone: true, after: ["forms", "termite"] },
  { key: "pour", name: "Pour slab", phase: "Foundation", days: 1, after: ["foundInsp"] },
  // Framing
  { key: "lumber", name: "Lumber package delivered", phase: "Framing", days: 1, milestone: true, after: [["pour", 2]] },
  { key: "walls", name: "Frame walls", phase: "Framing", days: 8, after: [["pour", 3], "lumber"] },
  { key: "trusses", name: "Set trusses & roof decking", phase: "Framing", days: 5, after: ["walls", "orderTrusses"] },
  { key: "sheathing", name: "Wall sheathing & house wrap", phase: "Framing", days: 3, after: ["trusses"] },
  { key: "windows", name: "Install windows & exterior doors", phase: "Framing", days: 3, after: ["sheathing", "orderWindows"] },
  // Exterior
  { key: "roof", name: "Roofing", phase: "Exterior", days: 4, after: ["trusses"] },
  { key: "brick", name: "Brick / stone veneer", phase: "Exterior", days: 10, after: ["windows"] },
  { key: "siding", name: "Siding, soffit & fascia", phase: "Exterior", days: 8, after: ["windows"] },
  { key: "extPaint", name: "Exterior paint", phase: "Exterior", days: 5, after: ["siding"] },
  { key: "gutters", name: "Gutters", phase: "Exterior", days: 1, after: ["extPaint", "roof"] },
  // Rough-Ins
  { key: "plumbRough", name: "Plumbing top-out", phase: "Rough-Ins", days: 4, after: ["roof"] },
  { key: "hvacRough", name: "HVAC rough-in", phase: "Rough-Ins", days: 4, after: ["roof"] },
  { key: "elecRough", name: "Electrical rough-in", phase: "Rough-Ins", days: 5, after: ["plumbRough", "hvacRough"] },
  { key: "lowVolt", name: "Low voltage pre-wire", phase: "Rough-Ins", days: 2, after: ["elecRough"] },
  { key: "roughInsp", name: "Framing & rough-in inspections", phase: "Rough-Ins", days: 1, milestone: true, after: ["lowVolt", "windows", "sheathing"] },
  // Insulation & Drywall
  { key: "insulation", name: "Insulation", phase: "Insulation & Drywall", days: 3, after: ["roughInsp"] },
  { key: "insulInsp", name: "Insulation inspection", phase: "Insulation & Drywall", days: 1, milestone: true, after: ["insulation"] },
  { key: "hang", name: "Hang drywall", phase: "Insulation & Drywall", days: 5, after: ["insulInsp"] },
  { key: "finish", name: "Tape, float & texture", phase: "Insulation & Drywall", days: 7, after: ["hang"] },
  // Interior Finishes
  { key: "trim", name: "Interior doors & trim", phase: "Interior Finishes", days: 8, after: [["finish", 1]] },
  { key: "cabinets", name: "Install cabinets", phase: "Interior Finishes", days: 4, after: [["finish", 1]] },
  { key: "showerTile", name: "Shower & floor tile", phase: "Interior Finishes", days: 8, after: [["finish", 1]] },
  { key: "intPaint", name: "Interior paint", phase: "Interior Finishes", days: 8, after: ["trim"] },
  { key: "ctTemplate", name: "Countertop template", phase: "Interior Finishes", days: 1, milestone: true, after: ["cabinets"] },
  { key: "ctInstall", name: "Install countertops", phase: "Interior Finishes", days: 2, after: [["ctTemplate", 8]] },
  { key: "backsplash", name: "Backsplash", phase: "Interior Finishes", days: 2, after: ["ctInstall"] },
  { key: "flooring", name: "Flooring (wood, vinyl plank, carpet)", phase: "Interior Finishes", days: 6, after: ["intPaint", "showerTile"] },
  { key: "plumbTrim", name: "Plumbing trim & fixtures", phase: "Interior Finishes", days: 3, after: ["backsplash", "showerTile"] },
  { key: "elecTrim", name: "Electrical trim & light fixtures", phase: "Interior Finishes", days: 3, after: ["intPaint"] },
  { key: "hvacTrim", name: "HVAC trim & startup", phase: "Interior Finishes", days: 2, after: ["intPaint"] },
  { key: "appliances", name: "Appliances", phase: "Interior Finishes", days: 1, after: ["ctInstall", "flooring"] },
  { key: "glass", name: "Mirrors, shower glass & hardware", phase: "Interior Finishes", days: 2, after: ["plumbTrim", "flooring"] },
  // Final
  { key: "flatwork", name: "Driveway & flatwork", phase: "Final", days: 4, after: ["brick", "siding"] },
  { key: "landscape", name: "Final grade, sod & landscaping", phase: "Final", days: 5, after: ["flatwork"] },
  { key: "clean", name: "Final clean", phase: "Final", days: 2, after: ["appliances", "glass", "elecTrim", "hvacTrim"] },
  { key: "finalInsp", name: "Final inspection", phase: "Final", days: 1, milestone: true, after: ["clean", "landscape", "gutters"] },
  { key: "punch", name: "Punch list", phase: "Final", days: 5, after: ["finalInsp"] },
  { key: "walkthrough", name: "Client walkthrough & closing", phase: "Final", days: 1, milestone: true, after: ["punch"] },
];
