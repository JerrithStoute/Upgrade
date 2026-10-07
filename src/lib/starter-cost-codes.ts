/**
 * A starter list of residential cost codes laid out the NAHB way (its chart of accounts'
 * direct construction costs): 1000 Preparation, 2000 Excavation & Foundation, 3000 Rough
 * Structure, 4000 Full Enclosure, 5000 Finishing Trades, 6000 Completion & Inspection.
 * Common codes, not NAHB's own list — a place to start, renamed and added to as you go.
 * Groups ("3100 Framing") are what estimates file lines under.
 */

type Group = [division: string, codes: [code: string, name: string][]];

const GROUPS: Group[] = [
  // 1000 Preparation
  [
    "1000 Permits and Fees",
    [
      ["1001", "Legal fees"],
      ["1002", "Building permit"],
      ["1003", "Soil tests"],
      ["1004", "Inspections"],
      ["1005", "Impact fees"],
      ["1006", "Property taxes"],
      ["1007", "HOA fees"],
    ],
  ],
  [
    "1100 Architectural and Engineering",
    [
      ["1110", "Plans"],
      ["1111", "Plan reproduction"],
      ["1112", "Architect / designer"],
      ["1113", "Engineering"],
      ["1120", "Survey"],
      ["1121", "Form board survey"],
    ],
  ],
  [
    "1200 Site Work",
    [
      ["1210", "Lot clearing"],
      ["1220", "Fill dirt"],
      ["1230", "Rough grading"],
      ["1240", "Erosion control / silt fence"],
      ["1250", "Construction entrance / pad"],
    ],
  ],
  [
    "1300 Demolition",
    [
      ["1310", "Demolition"],
      ["1320", "Haul off"],
    ],
  ],
  [
    "1400 Utility Connections",
    [
      ["1410", "Temporary electric"],
      ["1420", "Water well"],
      ["1430", "Water tap / meter"],
      ["1440", "Septic system"],
      ["1445", "Sewer tap"],
      ["1450", "Gas / propane"],
      ["1460", "Electric service"],
    ],
  ],
  [
    "1500 Financing and Insurance",
    [
      ["1501", "Builder's risk insurance"],
      ["1502", "Loan closing costs"],
      ["1503", "Interim interest"],
      ["1504", "Home warranty"],
    ],
  ],
  ["1600 Land", [["1600", "Lot cost"]]],
  [
    "1700 General Conditions",
    [
      ["1710", "Project management / supervision"],
      ["1720", "Portable toilet"],
      ["1730", "Dumpsters"],
      ["1740", "Temporary fencing"],
      ["1750", "Equipment rental"],
      ["1760", "Job site utilities"],
    ],
  ],
  // 2000 Excavation and Foundation
  [
    "2000 Excavation",
    [
      ["2010", "Excavation"],
      ["2020", "Hauling"],
      ["2030", "Backfill"],
    ],
  ],
  [
    "2100 Footing and Foundation",
    [
      ["2101", "Foundation labor"],
      ["2102", "Foundation concrete"],
      ["2103", "Pump truck"],
      ["2104", "Piers / underreams"],
      ["2105", "Rebar and steel"],
      ["2106", "Vapor barrier"],
      ["2107", "Plumbing underground"],
    ],
  ],
  [
    "2200 Waterproofing and Drainage",
    [
      ["2210", "Foundation waterproofing"],
      ["2220", "French drains"],
    ],
  ],
  ["2300 Termite Treatment", [["2300", "Termite pretreat"]]],
  // 3000 Rough Structure
  [
    "3100 Framing",
    [
      ["3110", "Framing lumber package"],
      ["3120", "Trusses"],
      ["3130", "Engineered lumber (LVL, I-joists)"],
      ["3140", "Sheathing"],
      ["3150", "Nails and fasteners"],
      ["3160", "Framing labor"],
      ["3170", "Steel beams and columns"],
    ],
  ],
  [
    "3600 Plumbing",
    [
      ["3620", "Plumbing rough-in"],
      ["3621", "Plumbing top out"],
      ["3622", "Plumbing trim"],
      ["3630", "Water heater"],
    ],
  ],
  [
    "3700 Electrical",
    [
      ["3710", "Electrical rough-in"],
      ["3720", "Electrical trim"],
      ["3730", "Low voltage / data"],
      ["3740", "Generator"],
    ],
  ],
  [
    "3800 HVAC",
    [
      ["3810", "HVAC rough-in"],
      ["3820", "HVAC equipment and trim"],
      ["3830", "Ductwork"],
    ],
  ],
  // 4000 Full Enclosure
  [
    "4000 Roofing",
    [
      ["4010", "Roofing material"],
      ["4020", "Roofing labor"],
      ["4030", "Flashing and roof vents"],
    ],
  ],
  [
    "4100 Masonry",
    [
      ["4110", "Brick material"],
      ["4111", "Brick labor"],
      ["4114", "Stone material"],
      ["4115", "Stone labor"],
      ["4120", "Fireplace"],
      ["4126", "Stucco"],
    ],
  ],
  [
    "4500 Windows and Exterior Doors",
    [
      ["4510", "Windows"],
      ["4540", "Exterior doors"],
      ["4570", "Garage doors"],
    ],
  ],
  [
    "4700 Insulation",
    [
      ["4710", "Insulation"],
      ["4720", "House wrap and air sealing"],
    ],
  ],
  [
    "4800 Exterior Siding and Trim",
    [
      ["4810", "Porch columns"],
      ["4820", "Siding material"],
      ["4821", "Siding labor"],
      ["4830", "Soffit and fascia"],
      ["4840", "Shutters"],
    ],
  ],
  ["4900 Exterior Paint", [["4920", "Exterior paint"]]],
  // 5000 Finishing Trades
  ["5000 Drywall", [["5020", "Drywall (hang, finish, texture)"]]],
  [
    "5100 Flooring",
    [
      ["5110", "Wood flooring material"],
      ["5111", "Wood flooring labor"],
      ["5120", "Vinyl plank material"],
      ["5121", "Vinyl plank labor"],
      ["5130", "Carpet"],
      ["5140", "Floor prep"],
    ],
  ],
  [
    "5200 Interior Trim and Doors",
    [
      ["5201", "Trim material"],
      ["5210", "Interior doors"],
      ["5220", "Trim labor"],
      ["5230", "Stairs and railing"],
      ["5240", "Door hardware"],
      ["5250", "Mirrors and shower glass"],
      ["5260", "Closet shelving"],
    ],
  ],
  [
    "5300 Tile",
    [
      ["5300", "Tile material"],
      ["5320", "Tile labor"],
      ["5330", "Backsplash"],
    ],
  ],
  [
    "5400 Cabinets and Countertops",
    [
      ["5400", "Cabinets"],
      ["5410", "Cabinet install"],
      ["5420", "Countertops"],
    ],
  ],
  ["5500 Appliances", [["5500", "Appliances"]]],
  ["5600 Plumbing Fixtures", [["5610", "Plumbing fixtures"]]],
  ["5700 Lighting", [["5710", "Light fixtures"]]],
  ["5900 Interior Paint", [["5920", "Interior paint"]]],
  // 6000 Completion and Inspection
  [
    "6000 Cleaning",
    [
      ["6010", "Rough clean"],
      ["6020", "Final clean"],
      ["6030", "Window cleaning"],
    ],
  ],
  [
    "6100 Landscaping",
    [
      ["6110", "Final grade"],
      ["6150", "Sod"],
      ["6160", "Landscaping"],
      ["6170", "Irrigation"],
    ],
  ],
  [
    "6200 Driveway and Flatwork",
    [
      ["6200", "Driveway"],
      ["6210", "Sidewalks and patios"],
    ],
  ],
  [
    "6300 Exterior Extras",
    [
      ["6375", "Gutters"],
      ["6401", "Fencing"],
      ["6410", "Mailbox"],
    ],
  ],
  [
    "6500 Punch List and Warranty",
    [
      ["6500", "Punch list"],
      ["6510", "Warranty reserve"],
    ],
  ],
];

export type StarterCode = { code: string; name: string; division: string };

export const STARTER_COST_CODES: StarterCode[] = GROUPS.flatMap(([division, codes]) => codes.map(([code, name]) => ({ code, name, division })));
