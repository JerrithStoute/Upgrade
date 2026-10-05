/**
 * Saving an estimate as a template keeps how you price things and drops this job's
 * numbers:
 * - a formula (quantity or unit cost, from your parameters) stays;
 * - a unit cost you typed stays — except on lines the takeoff filled (those are this
 *   job's takeoff totals; the next takeoff refills them) and on allowances (zeroed);
 * - quantities go to 0 — except a formula's, and the quantity on a line whose unit
 *   cost is a formula (a share of it, like Plumbing Rough In 0.2 × your plumbing price).
 */
export function clearJobNumbers(line: {
  quantity: number;
  unitCost: number;
  qtyFormula?: string | null;
  costFormula?: string | null;
  isAllowance?: boolean;
  /** Filled by the takeoff on the job (its total), not typed by you. */
  fromTakeoff?: boolean;
}): { quantity: number; unitCost: number } {
  const keepQty = !!line.qtyFormula || !!line.costFormula;
  const keepCost = !!line.costFormula || (!line.fromTakeoff && !line.isAllowance);
  return { quantity: keepQty ? line.quantity : 0, unitCost: keepCost ? line.unitCost : 0 };
}
