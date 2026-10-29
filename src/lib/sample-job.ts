import "server-only";
import { addDays, subDays } from "date-fns";
import { db } from "./db";
import { asWholeCompany } from "./tenant";
import { STARTER_COST_CODES } from "./starter-cost-codes";
import { SAMPLE_NEW_HOME, phaseColor } from "./sample-schedule";
import { loadWorkCal } from "./work-calendar";
import { planTemplate } from "./workdays";

/**
 * The sample job: a made-up new home a builder can click through — an approved estimate with
 * allowances, its budget, selections, a change order, the schedule under way, bills, invoices, a
 * daily log and to-dos — to see how the program fits together before putting their own work in.
 *
 * Marked isSample: labeled Sample, its client is never emailed (no email address), it's never sent to
 * QuickBooks or put in the morning email, and "Remove sample job" takes it out with everything in it.
 * Its numbers sit just below the company's own (job 1000, invoices 999 and 1000), so the builder's
 * first real job and invoice still get their usual first numbers.
 *
 * Cost codes: the standard list's numbers. A company that has them (the sign-up default) gets its own
 * used; one that started blank gets just the few the sample needs, marked fromSample — and those go
 * with the sample, unless they've been used on something else by then.
 */

const MARKUP = 15;
const SQFT = 1850;

/** The divisions a cost code's number files under (the standard list's first digit). */
const DIVISION: Record<string, string> = {
  "1": "Preparation",
  "2": "Excavation and Foundation",
  "3": "Rough Structure",
  "4": "Full Enclosure",
  "5": "Finishing Trades",
  "6": "Completion and Inspection",
};

type Line = { code: string; text: string; qty: number; unit: string; cost: number; type: string };
const L = (code: string, text: string, qty: number, unit: string, cost: number, type = "SUBCONTRACTOR"): Line => ({ code, text, qty, unit, cost, type });

// The estimate's lines, in order. Allowances are their own items (and each feeds a selection).
const LINES: Line[] = [
  L("1002", "Building permit", 1, "ls", 2400, "OTHER"),
  L("1004", "Inspections", 1, "ls", 750, "OTHER"),
  L("1230", "Rough grading & build the pad", 1, "ls", 6500),
  L("1410", "Temporary electric", 1, "ls", 1100),
  L("1501", "Builder's risk insurance", 1, "ls", 1450, "OTHER"),
  L("1710", "Project management / supervision", 20, "wk", 850, "LABOR"),
  L("1730", "Dumpsters", 4, "ea", 525, "OTHER"),
  L("2101", "Foundation labor", SQFT, "sf", 4.25),
  L("2102", "Foundation concrete", 62, "cy", 165, "MATERIAL"),
  L("2300", "Termite pretreat", 1, "ls", 750),
  L("3110", "Framing lumber package", 1, "ls", 36500, "MATERIAL"),
  L("3120", "Trusses", 1, "ls", 11800, "MATERIAL"),
  L("3160", "Framing labor", SQFT, "sf", 7.5),
  L("3620", "Plumbing rough-in", 1, "ls", 9800),
  L("3710", "Electrical rough-in", 1, "ls", 9200),
  L("3810", "HVAC rough-in & equipment", 1, "ls", 14500),
  L("4010", "Roofing material", 26, "sq", 145, "MATERIAL"),
  L("4020", "Roofing labor", 26, "sq", 95),
  L("4510", "Windows", 1, "ls", 9800, "MATERIAL"),
  L("4540", "Exterior doors", 1, "ls", 3200, "MATERIAL"),
  L("4710", "Insulation", 1, "ls", 5400),
  L("4820", "Siding material", 1, "ls", 8600, "MATERIAL"),
  L("4821", "Siding labor", 1, "ls", 6200),
  L("4920", "Exterior paint", 1, "ls", 4800),
  L("5020", "Drywall — hang, finish, texture", 1, "ls", 14200),
  L("5201", "Trim material", 1, "ls", 5200, "MATERIAL"),
  L("5220", "Trim labor", 1, "ls", 4600),
  L("5300", "Tile material", 1, "ls", 3800, "MATERIAL"),
  L("5320", "Tile labor", 1, "ls", 4200),
  L("5420", "Countertops", 1, "ls", 6800),
  L("5920", "Interior paint", 1, "ls", 7600),
  L("6020", "Final clean", 1, "ls", 950),
  L("6150", "Sod", 1, "ls", 3800),
  L("6200", "Driveway", 1, "ls", 6200),
  L("6500", "Punch list", 1, "ls", 1500, "LABOR"),
];

type Allowance = { key: string; name: string; text: string; lines: Line[]; selection: { title: string; category: string; location: string } };
const ALLOWANCES: Allowance[] = [
  {
    key: "flooring",
    name: "Flooring allowance",
    text: "Wood or vinyl plank in the living areas, carpet in the bedrooms — your pick, installed.",
    lines: [L("5110", "Flooring material", 1400, "sf", 4.5, "MATERIAL"), L("5111", "Flooring labor", 1400, "sf", 2.75)],
    selection: { title: "Flooring", category: "Flooring", location: "Whole house" },
  },
  {
    key: "cabinets",
    name: "Cabinet allowance",
    text: "Kitchen, baths and laundry cabinets, installed.",
    lines: [L("5400", "Cabinets", 1, "ls", 16500, "MATERIAL")],
    selection: { title: "Kitchen cabinets", category: "Cabinets", location: "Kitchen" },
  },
  {
    key: "plumbing",
    name: "Plumbing fixture allowance",
    text: "Faucets, sinks, toilets and tub/shower trim.",
    lines: [L("5610", "Plumbing fixtures", 1, "ls", 4200, "MATERIAL")],
    selection: { title: "Kitchen faucet & sink", category: "Plumbing Fixtures", location: "Kitchen" },
  },
  {
    key: "appliances",
    name: "Appliance allowance",
    text: "Range, hood, dishwasher and microwave.",
    lines: [L("5500", "Appliances", 1, "ls", 5500, "MATERIAL")],
    selection: { title: "Appliance package", category: "Appliances", location: "Kitchen" },
  },
  {
    key: "lighting",
    name: "Light fixture allowance",
    text: "Every light fixture and ceiling fan.",
    lines: [L("5710", "Light fixtures", 1, "ls", 2600, "MATERIAL")],
    selection: { title: "Light fixtures", category: "Lighting", location: "Whole house" },
  },
];

const CO_LINES = [L("6210", "Covered patio slab, 12' x 16'", 1, "ls", 3200), L("3160", "Patio cover framing & roof tie-in", 1, "ls", 2400)];

/** Every cost code number the sample uses. */
const CODES = [...new Set([...LINES, ...ALLOWANCES.flatMap((a) => a.lines), ...CO_LINES].map((l) => l.code))];

/** The company's sample job, if it has one. */
export function findSampleJob() {
  return db.project.findFirst({ where: { isSample: true }, select: { id: true, name: true } });
}

/** The cost codes the sample uses: the company's own where it has the number, the rest added (fromSample). */
async function sampleCodes() {
  const have = await db.costCode.findMany({ where: { code: { in: CODES } }, select: { id: true, code: true } });
  const ids = new Map(have.map((c) => [c.code!, c.id]));
  const missing = STARTER_COST_CODES.filter((c) => CODES.includes(c.code) && !ids.has(c.code));
  if (missing.length) {
    const last = await db.costCode.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    await db.costCode.createMany({ data: missing.map((c, i) => ({ code: c.code, name: c.name, division: c.division, sortOrder: (last?.sortOrder ?? 0) + 1 + i, fromSample: true })) });
    for (const c of await db.costCode.findMany({ where: { code: { in: missing.map((m) => m.code) } }, select: { id: true, code: true } })) ids.set(c.code!, c.id);
  }
  const groupOf = new Map(STARTER_COST_CODES.map((c) => [c.code, c.division]));
  return { id: (code: string) => ids.get(code) ?? null, group: (code: string) => groupOf.get(code) ?? "General" };
}

/** Just below the lowest number in use (or the first one), so the company's own numbering doesn't move. */
const below = (lowest: number | null | undefined, first: number) => Math.min(lowest ?? first, first) - 1;

/** Adds the sample job (once — a second call returns the one there). Its id. */
export async function addSampleJob(userId: string): Promise<string> {
  const existing = await findSampleJob();
  if (existing) return existing.id;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const codes = await sampleCodes();
  const [lowJob, lowInvoice, company] = await asWholeCompany(() =>
    Promise.all([
      db.project.findFirst({ orderBy: { number: "asc" }, select: { number: true } }),
      db.invoice.findFirst({ orderBy: { number: "asc" }, select: { number: true } }),
      db.company.findFirst({ select: { invoiceNextNumber: true } }),
    ]),
  );
  const firstInvoice = company?.invoiceNextNumber ?? 1001;

  const client = await db.client.create({
    data: { firstName: "Sample", lastName: "Client (example)", address: "123 Sample Lane", city: "Anytown", state: "TX", zip: "75000", notes: "Made up, for the sample job — no email, so nothing is ever sent.", isSample: true },
  });
  const start = subDays(today, 84);
  const project = await db.project.create({
    data: {
      number: below(lowJob?.number, 1001),
      name: "Sample Home — 123 Sample Lane",
      status: "IN_PROGRESS",
      type: "NEW_HOME",
      description: "A made-up 1,850 sq. ft. new home to explore. Click anything — change it, try things. When you're done, Remove sample job takes it all out.",
      address: "123 Sample Lane",
      city: "Anytown",
      state: "TX",
      zip: "75000",
      squareFeet: SQFT,
      startDate: start,
      targetEndDate: addDays(today, 120),
      clientId: client.id,
      managerId: userId,
      isSample: true,
    },
  });
  const projectId = project.id;

  // The estimate: approved, so the budget, selections and invoices all have something to work from.
  const estimate = await db.estimate.create({
    data: {
      projectId,
      name: "Sample Home",
      status: "APPROVED",
      defaultMarkup: MARKUP,
      totalSqFt: SQFT,
      sentAt: subDays(today, 100),
      approvedAt: subDays(today, 95),
      decidedAt: subDays(today, 95),
      signedBy: "Sample Client",
      notes: "Allowances are adjusted to what you pick, on a change order.",
      terms: "10% deposit at signing; draws at slab, dry-in, drywall and completion.",
    },
  });
  // Each cost code category is an item (its lines under it), filed in its division.
  let order = 0;
  const byGroup = new Map<string, Line[]>();
  for (const l of LINES) byGroup.set(codes.group(l.code), [...(byGroup.get(codes.group(l.code)) ?? []), l]);
  const itemData = (l: Line, extra: { specId: string; isAllowance?: boolean }) => ({
    estimateId: estimate.id,
    costCodeId: codes.id(l.code),
    group: DIVISION[l.code[0]],
    description: l.text,
    quantity: l.qty,
    unit: l.unit,
    unitCost: l.cost,
    markupPct: MARKUP,
    costType: l.type,
    isAllowance: !!extra.isAllowance,
    specId: extra.specId,
    sortOrder: order++,
  });
  for (const [group, lines] of byGroup) {
    const spec = await db.estimateSpec.create({ data: { estimateId: estimate.id, name: group, category: DIVISION[lines[0].code[0]], sortOrder: order++ } });
    await db.estimateItem.createMany({ data: lines.map((l) => itemData(l, { specId: spec.id })) });
  }

  // Allowances, each with its selection: one approved, one picked, the rest waiting on the client.
  const allowanceSpecs = new Map<string, { specId: string; price: number }>();
  for (const a of ALLOWANCES) {
    const spec = await db.estimateSpec.create({ data: { estimateId: estimate.id, name: a.name, category: DIVISION[a.lines[0].code[0]], specText: a.text, isAllowance: true, sortOrder: order++ } });
    await db.estimateItem.createMany({ data: a.lines.map((l) => itemData(l, { specId: spec.id, isAllowance: true })) });
    const price = Math.round(a.lines.reduce((n, l) => n + l.qty * l.cost, 0) * (1 + MARKUP / 100));
    allowanceSpecs.set(a.key, { specId: spec.id, price });
  }
  const options: Record<string, { name: string; vendor: string; at: number; recommended?: boolean }[]> = {
    flooring: [
      { name: "Engineered oak, natural — living areas; carpet in bedrooms", vendor: "Floor Store", at: 1.08, recommended: true },
      { name: "Luxury vinyl plank throughout", vendor: "Floor Store", at: 0.86 },
      { name: "Site-finished hardwood throughout", vendor: "Floor Store", at: 1.42 },
    ],
    cabinets: [
      { name: "Shaker, painted white, soft-close", vendor: "Cabinet Shop", at: 1.06, recommended: true },
      { name: "Flat panel, stained walnut", vendor: "Cabinet Shop", at: 1.24 },
    ],
    plumbing: [
      { name: "Pull-down faucet, matte black, single-bowl sink", vendor: "Plumbing Supply", at: 1.0, recommended: true },
      { name: "Bridge faucet, brushed brass, farmhouse sink", vendor: "Plumbing Supply", at: 1.35 },
    ],
    appliances: [
      { name: "Stainless package — gas range", vendor: "Appliance Center", at: 0.95, recommended: true },
      { name: "Pro-style package — 36\" range", vendor: "Appliance Center", at: 1.6 },
    ],
    lighting: [{ name: "Builder package — black & brass", vendor: "Lighting Gallery", at: 1.0, recommended: true }],
  };
  const how: Record<string, { status: string; pick?: number; due: number }> = {
    cabinets: { status: "APPROVED", pick: 0, due: -20 },
    plumbing: { status: "CHOSEN", pick: 1, due: 5 },
    flooring: { status: "PENDING", due: 12 },
    appliances: { status: "PENDING", due: 30 },
    lighting: { status: "PENDING", due: 40 },
  };
  for (const a of ALLOWANCES) {
    const { specId, price } = allowanceSpecs.get(a.key)!;
    const h = how[a.key];
    const sel = await db.selection.create({
      data: {
        projectId,
        costCodeId: codes.id(a.lines[0].code),
        title: a.selection.title,
        category: a.selection.category,
        location: a.selection.location,
        description: a.text,
        allowance: price,
        dueDate: addDays(today, h.due),
        status: h.status,
        chosenAt: h.pick !== undefined ? subDays(today, h.status === "APPROVED" ? 24 : 1) : null,
        approvedAt: h.status === "APPROVED" ? subDays(today, 22) : null,
      },
    });
    const made = [];
    for (const [i, o] of options[a.key].entries())
      made.push(await db.selectionOption.create({ data: { selectionId: sel.id, name: o.name, vendor: o.vendor, price: Math.round(price * o.at), isRecommended: !!o.recommended, sortOrder: i } }));
    if (h.pick !== undefined) await db.selection.update({ where: { id: sel.id }, data: { chosenOptionId: made[h.pick].id } });
    await db.estimateSpec.update({ where: { id: specId }, data: { selectionId: sel.id } });
  }

  // A change order the client approved.
  const co = await db.changeOrder.create({
    data: {
      projectId,
      number: 1,
      title: "Add a covered patio",
      description: "A 12' x 16' covered patio off the living room, tied into the main roof.",
      reason: "Client request",
      status: "APPROVED",
      scheduleImpactDays: 4,
      sentAt: subDays(today, 30),
      decidedAt: subDays(today, 28),
      decidedBy: "Sample Client",
      clientApprovedAt: subDays(today, 28),
    },
  });
  await db.changeOrderItem.createMany({
    data: CO_LINES.map((l, i) => ({ changeOrderId: co.id, costCodeId: codes.id(l.code), description: l.text, quantity: l.qty, unit: l.unit, unitCost: l.cost, markupPct: MARKUP + 5, sortOrder: i })),
  });

  // The schedule: the sample new-home schedule, started 12 weeks ago — done up to today, under way, then to come.
  const cal = await loadWorkCal();
  const plan = planTemplate(
    cal,
    SAMPLE_NEW_HOME.map((t) => ({
      key: t.key,
      duration: t.milestone ? 1 : t.days,
      isMilestone: !!t.milestone,
      links: (t.after ?? []).map((a) => (typeof a === "string" ? { key: a, lag: 0 } : { key: a[0], lag: a[1] })),
    })),
    start,
  );
  const ids = new Map<string, string>();
  for (const [i, t] of SAMPLE_NEW_HOME.entries()) {
    const p = plan.get(t.key)!;
    const pct = p.endDate < today ? 100 : p.startDate <= today ? 50 : 0;
    const made = await db.scheduleTask.create({
      data: { projectId, name: t.name, phase: t.phase, startDate: p.startDate, endDate: p.endDate, isMilestone: !!t.milestone, color: phaseColor(t.phase, t.milestone), percentComplete: pct, sortOrder: i },
    });
    ids.set(t.key, made.id);
  }
  // The job finishes when its schedule does.
  const lastDay = Math.max(...[...plan.values()].map((p) => p.endDate.getTime()));
  await db.project.update({ where: { id: projectId }, data: { targetEndDate: new Date(lastDay) } });
  for (const t of SAMPLE_NEW_HOME)
    for (const a of t.after ?? []) {
      const [key, lag] = typeof a === "string" ? [a, 0] : a;
      if (ids.has(key)) await db.taskLink.create({ data: { taskId: ids.get(t.key)!, predecessorId: ids.get(key)!, lagDays: lag } });
    }

  // What's been spent so far (bills entered), against the estimate's cost codes.
  const bills: [code: string, vendor: string, category: string, amount: number, daysAgo: number, status: string, text: string][] = [
    ["1002", "City Building Department", "PERMIT", 2400, 80, "PAID", "Building permit"],
    ["1230", "Dirt Works Excavating", "SUBCONTRACTOR", 6350, 62, "PAID", "Lot clearing, pad and grading"],
    ["2101", "Solid Slab Concrete", "SUBCONTRACTOR", 7862.5, 45, "PAID", "Foundation labor"],
    ["2102", "Ready Mix Supply", "MATERIAL", 10480, 46, "PAID", "Slab concrete, 64 cy"],
    ["3110", "Lumber Yard", "MATERIAL", 35720.4, 40, "PAID", "Framing lumber package"],
    ["3160", "Straight Line Framing", "SUBCONTRACTOR", 7000, 14, "UNPAID", "Framing labor — first draw"],
  ];
  await db.expense.createMany({
    data: bills.map(([code, vendor, category, amount, daysAgo, status, text]) => ({ projectId, costCodeId: codes.id(code), vendor, category, amount, date: subDays(today, daysAgo), status, description: text, enteredById: userId })),
  });

  // Invoices: the deposit, paid; the next draw, still a draft — shares of the estimate's price.
  const contract = [...LINES, ...ALLOWANCES.flatMap((x) => x.lines)].reduce((n, l) => n + l.qty * l.cost, 0) * (1 + MARKUP / 100);
  const depositAmount = Math.round(contract * 0.1);
  const deposit = await db.invoice.create({
    data: {
      projectId,
      number: below(lowInvoice?.number, firstInvoice) - 1,
      title: "Deposit — 10%",
      status: "PAID",
      issueDate: subDays(today, 95),
      dueDate: subDays(today, 88),
      items: { create: [{ description: "Contract deposit (10%)", quantity: 1, unitPrice: depositAmount }] },
    },
  });
  await db.payment.create({ data: { invoiceId: deposit.id, amount: depositAmount, date: subDays(today, 90), method: "CHECK", reference: "Sample check #1001" } });
  await db.invoice.create({
    data: {
      projectId,
      number: below(lowInvoice?.number, firstInvoice),
      title: "Draw 2 — Slab complete",
      status: "DRAFT",
      issueDate: today,
      dueDate: addDays(today, 10),
      items: {
        create: [
          { description: "Progress draw at slab complete (25%)", quantity: 1, unitPrice: Math.round(contract * 0.25), sortOrder: 0 },
          { description: "Change Order #1 — covered patio", quantity: 1, unitPrice: CO_LINES.reduce((n, l) => n + l.qty * l.cost, 0) * (1 + (MARKUP + 5) / 100), sortOrder: 1, changeOrderId: co.id },
        ],
      },
    },
  });

  await db.dailyLog.create({
    data: {
      projectId,
      authorId: userId,
      date: subDays(today, 1),
      weather: "Sunny",
      tempHigh: 84,
      tempLow: 63,
      crewCount: 5,
      hoursWorked: 40,
      workCompleted: "Framers finished the interior walls and started setting trusses. Lumber count checked against the takeoff — two bundles of 2x6 short, reordered.",
      issues: "Truss delivery came a day late — no change to the finish date.",
    },
  });
  await db.todo.createMany({
    data: [
      { projectId, title: "Remind the client to pick flooring", priority: "HIGH", dueDate: addDays(today, 3), assigneeId: userId, createdById: userId },
      { projectId, title: "Send Draw 2 once the slab inspection is signed off", priority: "NORMAL", dueDate: addDays(today, 2), assigneeId: userId, createdById: userId },
      { projectId, title: "Book the roofer for after trusses", priority: "NORMAL", dueDate: addDays(today, 7), assigneeId: userId, createdById: userId },
    ],
  });
  return projectId;
}

/**
 * Takes the sample job out: the job and everything in it, its client, and the cost codes it added
 * that nothing else uses.
 */
export async function removeSampleJob() {
  const jobs = await db.project.findMany({ where: { isSample: true }, select: { id: true } });
  for (const j of jobs) await db.project.delete({ where: { id: j.id } });
  await db.client.deleteMany({ where: { isSample: true, projects: { none: {} }, leads: { none: {} }, userId: null } });
  const added = await db.costCode.findMany({
    where: { fromSample: true },
    select: {
      id: true,
      _count: {
        select: {
          estimateItems: true,
          templateItems: true,
          changeOrderItems: true,
          expenses: true,
          selections: true,
          takeoffConditions: true,
          takeoffItems: true,
          materialItems: true,
          takeoffTemplateConditions: true,
          takeoffTemplateItems: true,
          itemCodeRules: true,
          poLines: true,
          billLines: true,
          carryingCosts: true,
          timeEntries: true,
        },
      },
    },
  });
  const unused = added.filter((c) => Object.values(c._count).every((n) => n === 0)).map((c) => c.id);
  if (unused.length) await db.costCode.deleteMany({ where: { id: { in: unused } } });
  // Kept because they're in use now: they're the company's own from here on.
  await db.costCode.updateMany({ where: { fromSample: true }, data: { fromSample: false } });
  return jobs.length;
}
