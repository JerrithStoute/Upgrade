import { NextResponse } from "next/server";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildMaterialList } from "@/lib/takeoff-materials";
import { boardPatternText } from "@/lib/takeoff";

function cell(v: string | number) {
  const s = String(v);
  // Quote everything; neutralise leading characters spreadsheets treat as formulas.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Material list as CSV (same contents as the page; ?prices=0 leaves prices out). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await params;
  const project = await db.project.findUnique({ where: { id }, select: { id: true, number: true, name: true } });
  if (!project) return new NextResponse("Not found", { status: 404 });

  const url = new URL(req.url);
  const planParam = url.searchParams.get("plan");
  const plan = planParam ? await db.takeoffPlan.findFirst({ where: { id: planParam, projectId: id }, select: { id: true } }) : null;
  const showPrices = url.searchParams.get("prices") !== "0";
  const { lines, total, cutLists } = await buildMaterialList(id, plan?.id ?? null);

  const header = ["Category", "Item", "SKU", "Vendor", "Qty", "Unit", "Used in", ...(showPrices ? ["Unit cost", "Extended"] : [])];
  const rows = lines.map((l) => [
    l.category,
    l.pieces ? `${l.name} (${l.pieces} ${l.pieces === 1 ? "pc" : "pcs"})` : l.name,
    l.sku ?? "",
    l.vendor ?? "",
    Math.round(l.quantity * 100) / 100,
    l.unit,
    l.usedIn.join("; "),
    ...(showPrices ? [l.unitCost.toFixed(2), l.extended.toFixed(2)] : []),
  ]);
  if (showPrices) rows.push(["", "Total", "", "", "", "", "", "", total.toFixed(2)]);
  // Framing cut sheet: what each stock board is cut into.
  const sheet = cutLists.filter((c) => c.boards.length);
  if (sheet.length) {
    rows.push([], ["Framing cut sheet"], ["Condition", "Size", "Boards", "Cut into"]);
    for (const c of sheet) for (const b of c.boards) rows.push([c.condition, c.size ?? "", b.count, boardPatternText(b)]);
  }
  const csv = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const filename = `material-list-${project.number}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
