/**
 * Seed the database with a demo company, users, cost codes and sample projects.
 * Run with: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { addDays, subDays } from "date-fns";

const db = new PrismaClient();

const COST_CODES: [string, string, string][] = [
  // code, name, division
  ["01-100", "Permits & Fees", "01 General Conditions"],
  ["01-200", "Supervision & Project Management", "01 General Conditions"],
  ["01-300", "Temporary Facilities & Dumpsters", "01 General Conditions"],
  ["01-400", "Cleanup", "01 General Conditions"],
  ["02-100", "Demolition", "02 Site Work"],
  ["02-200", "Excavation & Grading", "02 Site Work"],
  ["02-300", "Utilities", "02 Site Work"],
  ["03-100", "Concrete Foundation", "03 Concrete"],
  ["03-200", "Flatwork", "03 Concrete"],
  ["04-100", "Masonry", "04 Masonry"],
  ["06-100", "Framing Labor", "06 Wood & Plastics"],
  ["06-200", "Framing Materials", "06 Wood & Plastics"],
  ["06-300", "Finish Carpentry & Trim", "06 Wood & Plastics"],
  ["06-400", "Cabinets", "06 Wood & Plastics"],
  ["06-500", "Countertops", "06 Wood & Plastics"],
  ["07-100", "Roofing", "07 Thermal & Moisture"],
  ["07-200", "Insulation", "07 Thermal & Moisture"],
  ["07-300", "Siding & Exterior Trim", "07 Thermal & Moisture"],
  ["08-100", "Windows", "08 Doors & Windows"],
  ["08-200", "Exterior Doors", "08 Doors & Windows"],
  ["08-300", "Interior Doors & Hardware", "08 Doors & Windows"],
  ["09-100", "Drywall", "09 Finishes"],
  ["09-200", "Paint", "09 Finishes"],
  ["09-300", "Flooring", "09 Finishes"],
  ["09-310", "Flooring Material", "09 Finishes"],
  ["09-320", "Flooring Installation", "09 Finishes"],
  ["09-400", "Tile", "09 Finishes"],
  ["09-410", "Tile Material", "09 Finishes"],
  ["09-420", "Tile Installation", "09 Finishes"],
  ["10-100", "Specialties & Accessories", "10 Specialties"],
  ["11-100", "Appliances", "11 Equipment"],
  ["15-100", "Plumbing Rough", "15 Mechanical"],
  ["15-200", "Plumbing Fixtures & Trim", "15 Mechanical"],
  ["15-300", "HVAC", "15 Mechanical"],
  ["16-100", "Electrical Rough", "16 Electrical"],
  ["16-200", "Electrical Fixtures & Trim", "16 Electrical"],
  ["17-100", "Landscaping", "17 Exterior"],
  ["17-200", "Decks & Porches", "17 Exterior"],
];

/** Creates an estimate allowance whose amount is built from the given cost-code lines. */
async function createBuiltAllowance(
  estimateId: string,
  name: string,
  group: string,
  description: string,
  sortOrder: number,
  codes: Record<string, string>,
  lines: Array<[string, string, number, string, number, number]>,
) {
  const last = await db.estimateItem.aggregate({ where: { estimateId }, _max: { sortOrder: true } });
  const base = (last._max.sortOrder ?? 0) + 1;
  // Slot the allowance right after the last line of its group.
  const lastInGroup = await db.estimateItem.findFirst({ where: { estimateId, group }, orderBy: { sortOrder: "desc" } });
  await db.estimateSpec.create({
    data: {
      estimateId,
      name,
      category: group,
      specText: description,
      isAllowance: true,
      sortOrder: lastInGroup ? lastInGroup.sortOrder + 5 : sortOrder,
      items: {
        create: lines.map(([code, desc, quantity, unit, unitCost, markupPct], i) => ({
          estimateId,
          costCodeId: codes[code],
          group,
          description: desc,
          quantity,
          unit,
          unitCost,
          markupPct,
          isAllowance: true,
          sortOrder: base + i,
        })),
      },
    },
  });
}

async function main() {
  console.log("Seeding…");

  // Wipe in dependency order (SQLite: cascade handles most).
  await db.activity.deleteMany();
  await db.message.deleteMany();
  await db.messageThread.deleteMany();
  await db.fileAsset.deleteMany();
  await db.todo.deleteMany();
  await db.dailyLog.deleteMany();
  await db.payment.deleteMany();
  await db.invoiceItem.deleteMany();
  await db.invoice.deleteMany();
  await db.expense.deleteMany();
  await db.scheduleTask.deleteMany();
  await db.changeOrderItem.deleteMany();
  await db.changeOrder.deleteMany();
  await db.selectionOption.deleteMany();
  await db.selection.deleteMany();
  await db.estimateItem.deleteMany();
  await db.estimate.deleteMany();
  await db.project.deleteMany();
  await db.client.deleteMany();
  await db.user.deleteMany();
  await db.estimateTemplate.deleteMany();
  await db.costCode.deleteMany();
  await db.company.deleteMany();

  await db.company.create({
    data: {
      name: "Upgrade Builders",
      address: "1200 Industrial Pkwy",
      city: "Austin",
      state: "TX",
      zip: "78701",
      phone: "(512) 555-0142",
      email: "office@upgradebuilders.com",
      website: "upgradebuilders.com",
      licenseNumber: "TX-RB-204817",
      defaultMarkup: 20,
    },
  });

  const passwordHash = await bcrypt.hash("password", 10);
  const owner = await db.user.create({
    data: { email: "owner@upgradebuilders.com", passwordHash, name: "Jordan Viator", role: "ADMIN", title: "Owner", phone: "(512) 555-0101" },
  });
  const pm = await db.user.create({
    data: { email: "pm@upgradebuilders.com", passwordHash, name: "Maria Lopez", role: "STAFF", title: "Project Manager", phone: "(512) 555-0102" },
  });
  const superintendent = await db.user.create({
    data: { email: "super@upgradebuilders.com", passwordHash, name: "Dave Nguyen", role: "STAFF", title: "Superintendent", phone: "(512) 555-0103" },
  });
  const clientUser = await db.user.create({
    data: { email: "client@example.com", passwordHash, name: "Sarah & Tom Whitfield", role: "CLIENT" },
  });

  const codes: Record<string, string> = {};
  for (const [i, [code, name, division]] of COST_CODES.entries()) {
    const c = await db.costCode.create({ data: { code, name, division, sortOrder: i } });
    codes[code] = c.id;
  }

  // Estimate template: picked when creating a new project, or added to a draft estimate.
  const kitchenTemplate = await db.estimateTemplate.create({
    data: {
      name: "Kitchen Remodel",
      description: "Standard mid-range kitchen, ~200 sf",
      defaultMarkup: 20,
      notes: "Pricing valid for 30 days. Allowances are credited/debited at cost on final invoice.",
      terms: "10% deposit at signing, 40% at demo complete, 40% at cabinets installed, 10% at substantial completion.",
    },
  });
  const kitchenTemplateItems: Array<[string, string, string, number, string, number, number]> = [
    // group, costCode, description, qty, unit, unitCost, markup
    ["General Conditions", "01-100", "Building permit & inspections", 1, "ls", 1500, 10],
    ["General Conditions", "01-300", "Dumpster & site protection", 1, "ls", 1200, 15],
    ["Demolition", "02-100", "Demo kitchen to studs, haul off", 1, "ls", 4500, 20],
    ["Plumbing", "15-100", "Plumbing rough — sink, dishwasher, ice maker", 1, "ls", 3800, 20],
    ["Electrical", "16-100", "Electrical rough — circuits, under-cabinet, recessed cans", 1, "ls", 5200, 20],
    ["Drywall & Paint", "09-100", "Drywall patch, hang & finish", 1, "ls", 2800, 20],
    ["Drywall & Paint", "09-200", "Paint walls, ceiling & trim", 1, "ls", 2200, 20],
    ["Tile & Flooring", "09-420", "Tile installation — backsplash", 40, "sf", 18, 20],
    ["Tile & Flooring", "09-320", "Flooring installation", 200, "sf", 5.5, 20],
  ];
  for (const [i, [group, code, description, quantity, unit, unitCost, markupPct]] of kitchenTemplateItems.entries()) {
    await db.estimateTemplateItem.create({
      data: { templateId: kitchenTemplate.id, costCodeId: codes[code], group, description, quantity, unit, unitCost, markupPct, sortOrder: i * 10 },
    });
  }
  await db.estimateTemplateSpec.create({
    data: {
      templateId: kitchenTemplate.id,
      name: "Flooring",
      category: "Tile & Flooring",
      specText: "Tile and flooring material",
      isAllowance: true,
      sortOrder: kitchenTemplateItems.length * 10,
      items: {
        create: [
          {
            templateId: kitchenTemplate.id,
            costCodeId: codes["09-410"],
            group: "Tile & Flooring",
            description: "Tile material — backsplash",
            quantity: 40,
            unit: "sf",
            unitCost: 12,
            markupPct: 15,
            isAllowance: true,
            sortOrder: kitchenTemplateItems.length * 10 + 1,
          },
          {
            templateId: kitchenTemplate.id,
            costCodeId: codes["09-310"],
            group: "Tile & Flooring",
            description: "Flooring material",
            quantity: 200,
            unit: "sf",
            unitCost: 7,
            markupPct: 15,
            isAllowance: true,
            sortOrder: kitchenTemplateItems.length * 10 + 2,
          },
        ],
      },
    },
  });

  const whitfield = await db.client.create({
    data: {
      firstName: "Sarah",
      lastName: "Whitfield",
      email: "client@example.com",
      phone: "(512) 555-0199",
      address: "418 Barton Creek Blvd",
      city: "Austin",
      state: "TX",
      zip: "78746",
      source: "Referral",
      notes: "Husband Tom handles the budget conversations; Sarah drives design decisions.",
      userId: clientUser.id,
    },
  });
  const patel = await db.client.create({
    data: {
      firstName: "Raj",
      lastName: "Patel",
      email: "raj.patel@example.com",
      phone: "(512) 555-0177",
      address: "9 Lakeview Dr",
      city: "Lakeway",
      state: "TX",
      zip: "78734",
      source: "Website",
    },
  });
  const greenleaf = await db.client.create({
    data: {
      firstName: "Elena",
      lastName: "Ruiz",
      company: "Greenleaf Dental",
      email: "elena@greenleafdental.com",
      phone: "(512) 555-0155",
      address: "2201 S Lamar Blvd",
      city: "Austin",
      state: "TX",
      zip: "78704",
      source: "Repeat client",
    },
  });

  const today = new Date();

  // -------------------------------------------------------------------------
  // Project 1: Whitfield kitchen & master bath remodel (in progress)
  // -------------------------------------------------------------------------
  const p1 = await db.project.create({
    data: {
      number: 1001,
      name: "Whitfield Kitchen & Master Bath Remodel",
      status: "IN_PROGRESS",
      type: "REMODEL",
      description: "Full gut kitchen remodel with new island, plus master bath reconfiguration with curbless shower.",
      address: "418 Barton Creek Blvd",
      city: "Austin",
      state: "TX",
      zip: "78746",
      squareFeet: 620,
      startDate: subDays(today, 35),
      targetEndDate: addDays(today, 55),
      contractAmount: 0,
      clientId: whitfield.id,
      managerId: pm.id,
    },
  });

  const est1 = await db.estimate.create({
    data: {
      projectId: p1.id,
      name: "Kitchen & Bath Remodel",
      status: "APPROVED",
      defaultMarkup: 20,
      sentAt: subDays(today, 60),
      approvedAt: subDays(today, 52),
      notes: "Pricing valid for 30 days. Allowances are credited/debited at cost on final invoice.",
      terms: "10% deposit at signing, 40% at demo complete, 40% at cabinets installed, 10% at substantial completion.",
    },
  });
  const est1Items: Array<[string, string, string, number, string, number, number, boolean?]> = [
    // group, costCode, description, qty, unit, unitCost, markup, isAllowance
    ["General Conditions", "01-100", "Building permit & inspections", 1, "ls", 1850, 10],
    ["General Conditions", "01-200", "Project management & supervision", 10, "wk", 950, 20],
    ["General Conditions", "01-300", "Dumpster (3 pulls) & site protection", 1, "ls", 1650, 15],
    ["Demolition", "02-100", "Demo kitchen & master bath to studs, haul off", 1, "ls", 6400, 20],
    ["Framing", "06-100", "Remove wall between kitchen/dining, install LVL header", 1, "ls", 4200, 20],
    ["Framing", "06-200", "Framing materials", 1, "ls", 1350, 20],
    ["Plumbing", "15-100", "Plumbing rough — relocate sink, add pot filler, shower valve", 1, "ls", 6800, 20],
    ["Plumbing", "15-200", "Plumbing fixtures allowance", 1, "ls", 4500, 15, true],
    ["Electrical", "16-100", "Electrical rough — new circuits, under-cabinet, recessed cans (14)", 1, "ls", 7200, 20],
    ["Electrical", "16-200", "Light fixture allowance", 1, "ls", 1800, 15, true],
    ["Drywall & Paint", "09-100", "Drywall patch, hang & finish", 1, "ls", 3900, 20],
    ["Drywall & Paint", "09-200", "Paint kitchen, bath, ceilings & trim", 1, "ls", 3400, 20],
    ["Cabinets & Counters", "06-400", "Custom cabinetry — kitchen & vanity (allowance)", 1, "ls", 24000, 15, true],
    ["Cabinets & Counters", "06-500", "Quartz countertops allowance", 85, "sf", 95, 15, true],
    ["Tile & Flooring", "09-420", "Tile labor — shower, bath floor, backsplash", 1, "ls", 7800, 20],
    ["Tile & Flooring", "09-320", "Engineered hardwood install — kitchen", 320, "sf", 5.5, 20],
    ["Finish", "06-300", "Finish carpentry — trim, casing, floating shelves", 1, "ls", 2900, 20],
    ["Finish", "11-100", "Appliance allowance", 1, "ls", 9500, 10, true],
    ["Finish", "10-100", "Bath accessories & glass shower enclosure", 1, "ls", 2650, 20],
  ];
  for (const [i, [group, code, description, quantity, unit, unitCost, markupPct, isAllowance]] of est1Items.entries()) {
    await db.estimateItem.create({
      data: { estimateId: est1.id, costCodeId: codes[code], group, description, quantity, unit, unitCost, markupPct, isAllowance: !!isAllowance, sortOrder: i * 10 },
    });
  }
  // A built-up allowance: the client sees one "Flooring" amount, built from separate material cost codes.
  await createBuiltAllowance(est1.id, "Flooring", "Tile & Flooring", "Tile and hardwood material for kitchen and master bath", 15, codes, [
    ["09-410", "Tile material — shower, bath floor, backsplash", 1, "ls", 3200, 15],
    ["09-310", "Engineered hardwood material — kitchen", 320, "sf", 9, 15],
  ]);

  // Selections
  const selFaucet = await db.selection.create({
    data: {
      projectId: p1.id,
      costCodeId: codes["15-200"],
      title: "Kitchen Faucet",
      category: "Plumbing Fixtures",
      location: "Kitchen",
      description: "Pull-down faucet to match hardware finish.",
      allowance: 650,
      dueDate: subDays(today, 10),
      status: "APPROVED",
      chosenAt: subDays(today, 14),
      approvedAt: subDays(today, 12),
    },
  });
  const faucetOpts = await Promise.all([
    db.selectionOption.create({
      data: { selectionId: selFaucet.id, name: "Kohler Simplice — Matte Black", vendor: "Ferguson", modelNumber: "K-596-BL", price: 620, isRecommended: true, sortOrder: 0 },
    }),
    db.selectionOption.create({
      data: { selectionId: selFaucet.id, name: "Delta Trinsic Pro — Black Stainless", vendor: "Ferguson", modelNumber: "9659T-KS", price: 880, sortOrder: 1 },
    }),
    db.selectionOption.create({ data: { selectionId: selFaucet.id, name: "Moen Align — Chrome", vendor: "Home Depot", modelNumber: "5923", price: 410, sortOrder: 2 } }),
  ]);
  await db.selection.update({ where: { id: selFaucet.id }, data: { chosenOptionId: faucetOpts[1].id } });

  const selCounter = await db.selection.create({
    data: {
      projectId: p1.id,
      costCodeId: codes["06-500"],
      title: "Kitchen Countertops",
      category: "Countertops",
      location: "Kitchen",
      description: "85 sf including island waterfall edge. Price per sf installed.",
      allowance: 8075,
      dueDate: addDays(today, 4),
      status: "PENDING",
    },
  });
  await db.selectionOption.create({
    data: {
      selectionId: selCounter.id,
      name: "Caesarstone Calacatta Nuvo",
      vendor: "Austin Stone Works",
      price: 9350,
      isRecommended: true,
      description: "Soft grey veining, matches cabinet sample #2.",
      sortOrder: 0,
    },
  });
  await db.selectionOption.create({ data: { selectionId: selCounter.id, name: "Silestone Eternal Statuario", vendor: "Austin Stone Works", price: 8800, sortOrder: 1 } });
  await db.selectionOption.create({
    data: {
      selectionId: selCounter.id,
      name: "MSI Q Carrara Marmi",
      vendor: "Austin Stone Works",
      price: 7650,
      description: "Budget-friendly option; slightly less veining.",
      sortOrder: 2,
    },
  });

  const selTile = await db.selection.create({
    data: {
      projectId: p1.id,
      costCodeId: codes["09-400"],
      title: "Master Shower Tile",
      category: "Tile",
      location: "Master Bath",
      allowance: 1900,
      dueDate: addDays(today, 9),
      status: "CHOSEN",
      chosenAt: subDays(today, 1),
    },
  });
  const tileOpts = await Promise.all([
    db.selectionOption.create({
      data: { selectionId: selTile.id, name: "12x24 Porcelain — Bianco Dolomite look", vendor: "Floor & Decor", price: 1720, isRecommended: true, sortOrder: 0 },
    }),
    db.selectionOption.create({ data: { selectionId: selTile.id, name: "Zellige 4x4 — Weathered White", vendor: "Clé Tile", price: 2980, sortOrder: 1 } }),
  ]);
  await db.selection.update({ where: { id: selTile.id }, data: { chosenOptionId: tileOpts[1].id } });

  const selAppliance = await db.selection.create({
    data: {
      projectId: p1.id,
      costCodeId: codes["11-100"],
      title: "Appliance Package",
      category: "Appliances",
      location: "Kitchen",
      allowance: 9500,
      dueDate: addDays(today, 14),
      status: "PENDING",
      description: "Range, hood, dishwasher, refrigerator. Panel-ready fridge requires cabinet confirmation by due date.",
    },
  });
  await db.selectionOption.create({
    data: { selectionId: selAppliance.id, name: "Bosch 800 Series package", vendor: "Ferguson Appliance", price: 9200, isRecommended: true, sortOrder: 0 },
  });
  await db.selectionOption.create({
    data: { selectionId: selAppliance.id, name: "Thermador Pro package (panel-ready fridge)", vendor: "Ferguson Appliance", price: 16400, sortOrder: 1 },
  });

  // Change orders
  const co1 = await db.changeOrder.create({
    data: {
      projectId: p1.id,
      number: 1,
      title: "Add pot filler & relocate range",
      description: "Client requested range moved to island wall; requires additional gas line run and pot filler rough-in.",
      reason: "Client request",
      status: "APPROVED",
      scheduleImpactDays: 3,
      sentAt: subDays(today, 20),
      decidedAt: subDays(today, 18),
      decidedBy: "Sarah Whitfield",
    },
  });
  await db.changeOrderItem.create({
    data: {
      changeOrderId: co1.id,
      costCodeId: codes["15-100"],
      description: "Gas line extension & pot filler rough-in",
      quantity: 1,
      unit: "ls",
      unitCost: 1450,
      markupPct: 20,
      sortOrder: 0,
    },
  });
  await db.changeOrderItem.create({
    data: { changeOrderId: co1.id, costCodeId: codes["16-100"], description: "Relocate range circuit", quantity: 1, unit: "ls", unitCost: 380, markupPct: 20, sortOrder: 1 },
  });

  const co2 = await db.changeOrder.create({
    data: {
      projectId: p1.id,
      number: 2,
      title: "Unforeseen: replace rotted subfloor at bath",
      description: "Discovered water damage under old shower pan. Approximately 40 sf of subfloor and one joist sister required.",
      reason: "Unforeseen condition",
      status: "PENDING_APPROVAL",
      scheduleImpactDays: 2,
      sentAt: subDays(today, 1),
    },
  });
  await db.changeOrderItem.create({
    data: {
      changeOrderId: co2.id,
      costCodeId: codes["06-100"],
      description: "Remove & replace subfloor, sister joist",
      quantity: 1,
      unit: "ls",
      unitCost: 1650,
      markupPct: 20,
      sortOrder: 0,
    },
  });
  await db.changeOrderItem.create({
    data: { changeOrderId: co2.id, costCodeId: codes["06-200"], description: "Lumber & fasteners", quantity: 1, unit: "ls", unitCost: 320, markupPct: 20, sortOrder: 1 },
  });

  // Schedule
  const sched1: Array<[string, string, number, number, number, boolean?, string?]> = [
    // name, phase, startOffset, durationDays, pct, milestone?, assignee
    ["Permit approval", "Pre-Construction", -40, 1, 100, true],
    ["Order cabinets (lead time)", "Pre-Construction", -38, 1, 100, true],
    ["Demolition", "Site Work", -35, 4, 100, false, "super"],
    ["Framing & header", "Framing", -30, 4, 100, false, "super"],
    ["Plumbing rough-in", "Rough-Ins", -25, 4, 100],
    ["Electrical rough-in", "Rough-Ins", -22, 4, 100],
    ["Rough inspections", "Rough-Ins", -17, 1, 100, true],
    ["Subfloor repair (CO #2)", "Framing", -2, 2, 30, false, "super"],
    ["Insulation & drywall", "Insulation & Drywall", -14, 7, 85],
    ["Prime & first coat paint", "Interior Finishes", -6, 3, 40],
    ["Hardwood flooring", "Interior Finishes", 0, 4, 0],
    ["Cabinet install", "Interior Finishes", 5, 5, 0, false, "super"],
    ["Countertop template", "Interior Finishes", 11, 1, 0, true],
    ["Shower & backsplash tile", "Interior Finishes", 12, 8, 0],
    ["Countertop install", "Interior Finishes", 24, 1, 0],
    ["Plumbing & electrical trim", "Interior Finishes", 26, 4, 0],
    ["Finish carpentry", "Interior Finishes", 30, 4, 0],
    ["Final paint", "Final", 35, 3, 0],
    ["Appliance delivery & install", "Final", 39, 2, 0],
    ["Punch list", "Final", 42, 5, 0, false, "pm"],
    ["Final inspection & walkthrough", "Final", 50, 1, 0, true, "pm"],
  ];
  let prevTaskId: string | null = null;
  for (const [i, [name, phase, startOffset, duration, pct, milestone, who]] of sched1.entries()) {
    const start = addDays(today, startOffset);
    const t: { id: string } = await db.scheduleTask.create({
      data: {
        projectId: p1.id,
        name,
        phase,
        startDate: start,
        endDate: addDays(start, Math.max(0, duration - 1)),
        percentComplete: pct,
        isMilestone: !!milestone,
        assigneeId: who === "super" ? superintendent.id : who === "pm" ? pm.id : null,
        sortOrder: i,
        color: milestone ? "#7c3aed" : pct === 100 ? "#059669" : "#2563eb",
      },
    });
    // Each task waits on the one before it.
    if (i > 0 && !milestone && prevTaskId) await db.taskLink.create({ data: { taskId: t.id, predecessorId: prevTaskId } });
    prevTaskId = t.id;
  }

  // Expenses (actuals)
  const exp1: Array<[string, string, string, number, number, string, string?]> = [
    // code, vendor, category, amount, daysAgo, status, description
    ["01-100", "City of Austin", "PERMIT", 1790, 42, "PAID", "Building permit"],
    ["01-300", "Texas Disposal", "OTHER", 1150, 33, "PAID", "Dumpster 1 & 2"],
    ["02-100", "Reyes Demo Crew", "SUBCONTRACTOR", 6100, 30, "PAID", "Demo labor"],
    ["06-100", "Crew payroll", "LABOR", 3980, 27, "PAID", "Framing labor week 1"],
    ["06-200", "McCoy's Building Supply", "MATERIAL", 1412.77, 28, "PAID", "LVL, studs, hangers"],
    ["15-100", "Hill Country Plumbing", "SUBCONTRACTOR", 7250, 20, "PAID", "Rough plumbing incl. CO#1 gas line"],
    ["16-100", "Bright Electric LLC", "SUBCONTRACTOR", 7580, 18, "UNPAID", "Rough electrical"],
    ["09-100", "ATX Drywall", "SUBCONTRACTOR", 2100, 6, "UNPAID", "Drywall progress draw 1"],
    ["07-200", "Insulate Texas", "SUBCONTRACTOR", 940, 12, "PAID", "Batt insulation"],
    ["06-400", "Heritage Custom Cabinets", "MATERIAL", 12000, 36, "PAID", "Cabinet deposit 50%"],
    ["01-200", "Crew payroll", "LABOR", 4750, 7, "PAID", "PM/super time weeks 1-5"],
    ["09-200", "Sherwin-Williams", "MATERIAL", 612.4, 4, "UNPAID", "Primer & paint"],
  ];
  for (const [code, vendor, category, amount, daysAgo, status, description] of exp1) {
    await db.expense.create({
      data: { projectId: p1.id, costCodeId: codes[code], vendor, category, amount, date: subDays(today, daysAgo), status, description, enteredById: pm.id },
    });
  }

  // Invoices
  const inv1 = await db.invoice.create({
    data: {
      projectId: p1.id,
      number: 1001,
      title: "Deposit — 10%",
      status: "PAID",
      issueDate: subDays(today, 52),
      dueDate: subDays(today, 45),
      items: { create: [{ description: "Contract deposit (10%)", quantity: 1, unitPrice: 13687.5 }] },
    },
  });
  await db.payment.create({ data: { invoiceId: inv1.id, amount: 13687.5, date: subDays(today, 50), method: "CHECK", reference: "#4471" } });
  const inv2 = await db.invoice.create({
    data: {
      projectId: p1.id,
      number: 1002,
      title: "Draw 2 — Demo complete (40%)",
      status: "PAID",
      issueDate: subDays(today, 30),
      dueDate: subDays(today, 23),
      items: {
        create: [
          { description: "Progress draw at demolition complete (40%)", quantity: 1, unitPrice: 54750 },
          { description: "Change Order #1 — pot filler & range relocation", quantity: 1, unitPrice: 2196 },
        ],
      },
    },
  });
  await db.payment.create({ data: { invoiceId: inv2.id, amount: 56946, date: subDays(today, 26), method: "ACH", reference: "ACH-88213" } });
  await db.invoice.create({
    data: {
      projectId: p1.id,
      number: 1003,
      title: "Draw 3 — Rough-ins complete",
      status: "SENT",
      issueDate: subDays(today, 3),
      dueDate: addDays(today, 11),
      items: { create: [{ description: "Progress draw at rough inspections passed (20%)", quantity: 1, unitPrice: 27375 }] },
    },
  });

  // Daily logs
  const logs: Array<[number, string, number, number, number, number, string, string?]> = [
    [
      1,
      "Sunny",
      91,
      72,
      4,
      32,
      "Drywall crew finished taping master bath. Painter primed kitchen ceiling. Super met with tile installer to confirm shower niche layout.",
      "Discovered soft subfloor at old shower pan — photos taken, CO #2 drafted.",
    ],
    [2, "Partly Cloudy", 88, 70, 3, 24, "Hung remaining drywall in kitchen. Delivered hardwood flooring to acclimate (12 boxes)."],
    [3, "Rain", 79, 68, 2, 12, "Rain delay — no exterior work. Interior drywall mud coat 2."],
    [6, "Sunny", 94, 74, 5, 40, "Insulation inspection passed. Drywall hang started kitchen."],
    [8, "Sunny", 95, 75, 3, 24, "Batt insulation installed in all exterior walls and bath ceiling."],
  ];
  for (const [daysAgo, weather, hi, lo, crew, hours, work, issues] of logs) {
    await db.dailyLog.create({
      data: {
        projectId: p1.id,
        authorId: superintendent.id,
        date: subDays(today, daysAgo),
        weather,
        tempHigh: hi,
        tempLow: lo,
        crewCount: crew,
        hoursWorked: hours,
        workCompleted: work,
        issues: issues ?? null,
      },
    });
  }

  // To-dos
  await db.todo.createMany({
    data: [
      { projectId: p1.id, title: "Get client approval on CO #2 (subfloor)", priority: "HIGH", dueDate: addDays(today, 1), assigneeId: pm.id, createdById: pm.id },
      { projectId: p1.id, title: "Confirm countertop selection before template", priority: "HIGH", dueDate: addDays(today, 4), assigneeId: pm.id, createdById: pm.id },
      {
        projectId: p1.id,
        title: "Schedule countertop template with Austin Stone Works",
        priority: "NORMAL",
        dueDate: addDays(today, 8),
        assigneeId: superintendent.id,
        createdById: pm.id,
      },
      {
        projectId: p1.id,
        title: "Order shower glass — need field measure after tile",
        priority: "NORMAL",
        dueDate: addDays(today, 20),
        assigneeId: superintendent.id,
        createdById: pm.id,
      },
      { projectId: p1.id, title: "Pay Bright Electric rough invoice", priority: "NORMAL", dueDate: addDays(today, 3), assigneeId: owner.id, createdById: pm.id },
      { projectId: p1.id, title: "Send draw 2 receipt to client", priority: "LOW", status: "DONE", completedAt: subDays(today, 25), assigneeId: pm.id, createdById: pm.id },
    ],
  });

  // Messages
  const thread1 = await db.messageThread.create({
    data: { projectId: p1.id, subject: "Countertop decision", lastMessageAt: subDays(today, 1) },
  });
  await db.message.create({
    data: {
      threadId: thread1.id,
      authorId: pm.id,
      body: "Hi Sarah & Tom — countertop template is scheduled for the 11th. We need your final selection by Friday so the fabricator can hold the slab. The Calacatta Nuvo is my recommendation; it matches your cabinet sample really well.",
      createdAt: subDays(today, 3),
    },
  });
  await db.message.create({
    data: {
      threadId: thread1.id,
      authorId: clientUser.id,
      body: "Thanks Maria. We're leaning Calacatta Nuvo but want to see it against the backsplash tile in person. Can we stop by the showroom Thursday?",
      createdAt: subDays(today, 2),
    },
  });
  await db.message.create({
    data: { threadId: thread1.id, authorId: pm.id, body: "Absolutely — I'll set it up for 10am Thursday and bring the tile sample.", createdAt: subDays(today, 1) },
  });
  const thread2 = await db.messageThread.create({
    data: { projectId: p1.id, subject: "Subfloor damage found under shower", lastMessageAt: subDays(today, 1) },
  });
  await db.message.create({
    data: {
      threadId: thread2.id,
      authorId: superintendent.id,
      body: "When we pulled the old pan we found about 40 sf of rotted subfloor and one joist that needs sistering. Photos are in the daily log. Maria is sending over a change order — it's a safety item so we'd like to get it fixed this week.",
      createdAt: subDays(today, 1),
    },
  });
  const thread3 = await db.messageThread.create({
    data: { projectId: p1.id, subject: "Weekly update — Week 5", clientVisible: true, lastMessageAt: subDays(today, 5) },
  });
  await db.message.create({
    data: {
      threadId: thread3.id,
      authorId: pm.id,
      body: "Rough inspections passed on all three trades. Insulation is complete and drywall starts Monday. We're tracking about 3 days behind the original schedule due to the range relocation but still on target for completion within the contract window.",
      createdAt: subDays(today, 5),
    },
  });

  // Activity
  await db.activity.createMany({
    data: [
      { projectId: p1.id, userId: pm.id, type: "estimate.approved", description: "Estimate approved by client", createdAt: subDays(today, 52) },
      { projectId: p1.id, userId: pm.id, type: "change_order.approved", description: "Change Order #1 approved by Sarah Whitfield", createdAt: subDays(today, 18) },
      { projectId: p1.id, userId: superintendent.id, type: "daily_log.created", description: "Daily log added", createdAt: subDays(today, 1) },
      { projectId: p1.id, userId: pm.id, type: "change_order.sent", description: "Change Order #2 sent for approval", createdAt: subDays(today, 1) },
      { projectId: p1.id, userId: pm.id, type: "invoice.sent", description: "Invoice #1003 sent", createdAt: subDays(today, 3) },
      {
        projectId: p1.id,
        userId: clientUser.id,
        type: "selection.chosen",
        description: "Client chose 'Zellige 4x4 — Weathered White' for Master Shower Tile",
        createdAt: subDays(today, 1),
      },
    ],
  });

  // -------------------------------------------------------------------------
  // Project 2: Patel new construction (contracted, starting soon)
  // -------------------------------------------------------------------------
  const p2 = await db.project.create({
    data: {
      number: 1002,
      name: "Patel Lakeview Custom Home",
      status: "CONTRACTED",
      type: "NEW_HOME",
      description: "3,400 sf two-story custom home with detached garage on lake lot.",
      address: "9 Lakeview Dr",
      city: "Lakeway",
      state: "TX",
      zip: "78734",
      squareFeet: 3400,
      startDate: addDays(today, 12),
      targetEndDate: addDays(today, 300),
      contractAmount: 985000,
      clientId: patel.id,
      managerId: pm.id,
    },
  });
  const est2 = await db.estimate.create({
    data: { projectId: p2.id, name: "Custom Home — Base Contract", status: "APPROVED", approvedAt: subDays(today, 10), sentAt: subDays(today, 15), defaultMarkup: 18 },
  });
  const est2Items: Array<[string, string, string, number, string, number, number, boolean?]> = [
    ["General Conditions", "01-100", "Permits, impact fees, surveys", 1, "ls", 14500, 10],
    ["General Conditions", "01-200", "Supervision (40 weeks)", 40, "wk", 1400, 18],
    ["Site", "02-200", "Excavation, grading, pad prep", 1, "ls", 28000, 18],
    ["Site", "02-300", "Septic, water & electrical service", 1, "ls", 32000, 18],
    ["Foundation", "03-100", "Engineered slab foundation", 3400, "sf", 14, 18],
    ["Framing", "06-100", "Framing labor", 3400, "sf", 16, 18],
    ["Framing", "06-200", "Framing package (lumber, trusses, sheathing)", 1, "ls", 96000, 18],
    ["Exterior", "07-100", "Standing seam metal roof", 42, "sq", 1150, 18],
    ["Exterior", "08-100", "Window & door package", 1, "ls", 58000, 15, true],
    ["Exterior", "07-300", "Stucco & stone veneer", 1, "ls", 64000, 18],
    ["Mechanical", "15-100", "Plumbing complete", 1, "ls", 42000, 18],
    ["Mechanical", "15-300", "HVAC — 2 zones", 1, "ls", 36500, 18],
    ["Mechanical", "16-100", "Electrical complete", 1, "ls", 48000, 18],
    ["Interior", "09-100", "Drywall", 3400, "sf", 5.25, 18],
    ["Interior", "06-400", "Cabinetry allowance", 1, "ls", 62000, 15, true],
    ["Interior", "09-200", "Interior & exterior paint", 1, "ls", 27000, 18],
    ["Interior", "11-100", "Appliance allowance", 1, "ls", 22000, 10, true],
    ["Exterior", "17-100", "Landscaping & irrigation allowance", 1, "ls", 30000, 15, true],
  ];
  for (const [i, [group, code, description, quantity, unit, unitCost, markupPct, isAllowance]] of est2Items.entries()) {
    await db.estimateItem.create({
      data: { estimateId: est2.id, costCodeId: codes[code], group, description, quantity, unit, unitCost, markupPct, isAllowance: !!isAllowance, sortOrder: i * 10 },
    });
  }
  await createBuiltAllowance(est2.id, "Flooring", "Interior", "Hardwood, tile and carpet — material and installation", 15, codes, [
    ["09-310", "Wide-plank hardwood material", 2400, "sf", 6.5, 15],
    ["09-410", "Tile material — baths & laundry", 800, "sf", 5, 15],
    ["09-320", "Hardwood installation", 2400, "sf", 3.25, 15],
    ["09-420", "Tile installation", 800, "sf", 6, 15],
  ]);
  const sched2: Array<[string, string, number, number, boolean?]> = [
    ["Pre-construction meeting", "Pre-Construction", 10, 1, true],
    ["Site clearing & grading", "Site Work", 12, 8],
    ["Form & pour foundation", "Foundation", 22, 12],
    ["Framing", "Framing", 36, 30],
    ["Dry-in (roof & windows)", "Exterior", 66, 15],
    ["Rough MEP", "Rough-Ins", 82, 20],
    ["Insulation & drywall", "Insulation & Drywall", 104, 25],
    ["Exterior finishes", "Exterior", 104, 40],
    ["Interior finishes", "Interior Finishes", 130, 90],
    ["Final & CO", "Final", 225, 15],
    ["Certificate of occupancy", "Final", 240, 1, true],
  ];
  for (const [i, [name, phase, startOffset, duration, milestone]] of sched2.entries()) {
    const start = addDays(today, startOffset);
    await db.scheduleTask.create({
      data: {
        projectId: p2.id,
        name,
        phase,
        startDate: start,
        endDate: addDays(start, Math.max(0, duration - 1)),
        isMilestone: !!milestone,
        sortOrder: i,
        color: milestone ? "#7c3aed" : "#2563eb",
        assigneeId: superintendent.id,
      },
    });
  }
  await db.selection.create({
    data: {
      projectId: p2.id,
      costCodeId: codes["08-100"],
      title: "Window Package",
      category: "Windows & Doors",
      allowance: 58000,
      dueDate: addDays(today, 20),
      status: "PENDING",
      description: "Must be ordered before framing starts — 8-10 week lead time.",
      options: {
        create: [
          { name: "Andersen 100 Series — Black", vendor: "BMC", price: 54200, isRecommended: true },
          { name: "Marvin Elevate — Ebony", vendor: "BMC", price: 71800 },
        ],
      },
    },
  });
  await db.todo.createMany({
    data: [
      { projectId: p2.id, title: "Submit septic permit application", priority: "HIGH", dueDate: addDays(today, 2), assigneeId: pm.id, createdById: owner.id },
      { projectId: p2.id, title: "Confirm window selection with Raj", priority: "HIGH", dueDate: addDays(today, 7), assigneeId: pm.id, createdById: pm.id },
      { projectId: p2.id, title: "Line up excavation sub for the 12th", priority: "NORMAL", dueDate: addDays(today, 5), assigneeId: superintendent.id, createdById: pm.id },
    ],
  });
  const inv4 = await db.invoice.create({
    data: {
      projectId: p2.id,
      number: 1004,
      title: "Contract deposit",
      status: "PAID",
      issueDate: subDays(today, 9),
      dueDate: subDays(today, 2),
      items: { create: [{ description: "Deposit (10%)", quantity: 1, unitPrice: 98500 }] },
    },
  });
  await db.payment.create({ data: { invoiceId: inv4.id, amount: 98500, date: subDays(today, 4), method: "ACH", reference: "WIRE-2291" } });
  await db.expense.create({
    data: {
      projectId: p2.id,
      costCodeId: codes["01-100"],
      vendor: "Travis County",
      category: "PERMIT",
      amount: 9800,
      date: subDays(today, 3),
      status: "PAID",
      description: "Building permit & impact fees",
      enteredById: pm.id,
    },
  });

  // -------------------------------------------------------------------------
  // Project 3: Greenleaf Dental tenant finish-out (estimating)
  // -------------------------------------------------------------------------
  const p3 = await db.project.create({
    data: {
      number: 1003,
      name: "Greenleaf Dental Suite Finish-Out",
      status: "ESTIMATING",
      type: "COMMERCIAL",
      description: "2,100 sf tenant improvement — 4 operatories, sterilization, reception.",
      address: "2201 S Lamar Blvd, Suite 200",
      city: "Austin",
      state: "TX",
      zip: "78704",
      squareFeet: 2100,
      clientId: greenleaf.id,
      managerId: owner.id,
    },
  });
  const est3 = await db.estimate.create({ data: { projectId: p3.id, name: "TI Finish-Out", status: "DRAFT", defaultMarkup: 15 } });
  const est3Items: Array<[string, string, string, number, string, number, number]> = [
    ["General", "01-100", "Commercial permit & plan review", 1, "ls", 3200, 10],
    ["General", "02-100", "Selective demo of existing partitions", 1, "ls", 4800, 15],
    ["Build-out", "06-100", "Metal stud partitions & blocking", 1, "ls", 18500, 15],
    ["Build-out", "15-100", "Plumbing — 4 ops, sterilization, restrooms", 1, "ls", 34000, 15],
    ["Build-out", "16-100", "Electrical & low voltage", 1, "ls", 29000, 15],
    ["Build-out", "15-300", "HVAC modifications & medical gas coordination", 1, "ls", 21000, 15],
    ["Finishes", "09-100", "Drywall & ACT ceiling", 2100, "sf", 9.5, 15],
    ["Finishes", "09-300", "LVT flooring", 2100, "sf", 8.75, 15],
    ["Finishes", "06-400", "Casework — operatories & sterilization", 1, "ls", 41000, 15],
    ["Finishes", "09-200", "Paint", 1, "ls", 7800, 15],
  ];
  for (const [i, [group, code, description, quantity, unit, unitCost, markupPct]] of est3Items.entries()) {
    await db.estimateItem.create({ data: { estimateId: est3.id, costCodeId: codes[code], group, description, quantity, unit, unitCost, markupPct, sortOrder: i } });
  }
  await db.todo.create({
    data: { projectId: p3.id, title: "Get sub bids for med-gas and casework", priority: "NORMAL", dueDate: addDays(today, 6), assigneeId: owner.id, createdById: owner.id },
  });

  // A lead with no estimate yet
  await db.project.create({
    data: {
      number: 1004,
      name: "Hernandez Garage Apartment",
      status: "LEAD",
      type: "ADDITION",
      description: "Inquiry via website — 600 sf ADU over existing garage.",
      city: "Austin",
      state: "TX",
      managerId: owner.id,
    },
  });

  // A completed project for history
  const p5 = await db.project.create({
    data: {
      number: 1000,
      name: "Okafor Screened Porch & Deck",
      status: "COMPLETED",
      type: "ADDITION",
      address: "77 Cedar Hollow",
      city: "Austin",
      state: "TX",
      zip: "78731",
      startDate: subDays(today, 120),
      targetEndDate: subDays(today, 70),
      actualEndDate: subDays(today, 66),
      contractAmount: 68400,
      managerId: pm.id,
    },
  });
  const inv5 = await db.invoice.create({
    data: {
      projectId: p5.id,
      number: 1000,
      title: "Final invoice",
      status: "PAID",
      issueDate: subDays(today, 66),
      dueDate: subDays(today, 52),
      items: { create: [{ description: "Screened porch & composite deck — final balance", quantity: 1, unitPrice: 68400 }] },
    },
  });
  await db.payment.create({ data: { invoiceId: inv5.id, amount: 68400, date: subDays(today, 58), method: "CHECK", reference: "#2210" } });
  await db.expense.createMany({
    data: [
      { projectId: p5.id, costCodeId: codes["17-200"], vendor: "Lone Star Decking", category: "SUBCONTRACTOR", amount: 31200, date: subDays(today, 80), status: "PAID" },
      { projectId: p5.id, costCodeId: codes["17-200"], vendor: "Trex / BMC", category: "MATERIAL", amount: 14750, date: subDays(today, 95), status: "PAID" },
      { projectId: p5.id, costCodeId: codes["16-200"], vendor: "Bright Electric LLC", category: "SUBCONTRACTOR", amount: 3400, date: subDays(today, 72), status: "PAID" },
      { projectId: p5.id, costCodeId: codes["01-100"], vendor: "City of Austin", category: "PERMIT", amount: 640, date: subDays(today, 118), status: "PAID" },
    ],
  });

  console.log("Seed complete.");
  console.log("Sign in with owner@upgradebuilders.com / password");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
