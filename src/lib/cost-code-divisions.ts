export type SheetCostCode = { id: string; code: string | null; name: string; division: string };

/**
 * Cost codes grouped by division, in your list's order. Leaves out a stray
 * spreadsheet header row ("CostCode" in "CostCategory") if an import brought one in.
 */
export function codeDivisions(codes: SheetCostCode[]) {
  const map = new Map<string, SheetCostCode[]>();
  for (const c of codes) {
    if (c.name.trim().toLowerCase() === "costcode" && c.division.trim().toLowerCase() === "costcategory") continue;
    const list = map.get(c.division);
    if (list) list.push(c);
    else map.set(c.division, [c]);
  }
  return Array.from(map.entries());
}
