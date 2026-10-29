import type { HelpArticle } from "../types";

/** Budget, spec homes, inventory and reports — the rest of the Financials chapter. */
export const FINANCIALS_2: HelpArticle[] = [
  {
    slug: "budget",
    title: "Budget",
    group: "Financials",
    area: "budget",
    pages: ["/projects/*/budget"],
    what: "A job's **Budget** tab compares what the job was supposed to cost (the approved estimate plus approved change orders) with what it has actually cost, by cost code. Actual costs come in by themselves from approved bills, the time clock, inventory and spec carrying costs; you can also add expenses by hand.",
    how: [
      "Approve the estimate (or use it as the budget on a spec home). Its costs become the budget.",
      "As bills are approved and crews clock time, actual costs fill in.",
      "Watch **Variance** and **% used** on each cost code: red means over.",
      "For a cost with no bill, such as a store receipt, use **Add expense**.",
    ],
    sections: [
      {
        heading: "The top",
        items: [
          { name: "Budget", what: "The approved estimate plus approved change orders." },
          { name: "Actual costs", what: "Everything spent so far, and what share of the budget that is." },
          { name: "Projected margin", what: "Budget minus actual (red when negative)." },
          { name: "Unpaid bills", what: "Expenses not yet paid." },
        ],
      },
      {
        heading: "Budget vs actual by cost code",
        items: [
          { name: "Budget cost / Budget price", what: "Each cost code's cost on the estimate (before markup) and its price to the client." },
          { name: "Actual / Variance / % used", what: "What's been spent, how far under (green) or over (red) the budget cost, and a bar: amber past 90%, red past 100%." },
          { name: "Unassigned", what: "Costs with no cost code." },
        ],
      },
      {
        heading: "Expenses",
        items: [
          { name: "The list", what: "Every cost: date, vendor, cost code, category, description, amount and status." },
          {
            name: "Timesheets / Open bill / Inventory / Spec sale",
            what: "Costs that come from somewhere else link back to it, and are changed there: crew time on Timesheets, a vendor bill in Purchasing, inventory on the Material list's inventory screen, carrying costs on the Spec sale tab.",
          },
          { name: "Mark paid / Edit / Delete", what: "For expenses you added by hand." },
          { name: "Add expense", what: "Date, vendor, cost code, category (Material, Labor, Subcontractor, Equipment, Permit, Other), amount, description, reference (their invoice #) and paid or unpaid." },
        ],
      },
    ],
    tips: ["Crew time only costs something once each person has a pay rate in Settings → Time clock."],
    related: ["purchasing", "timesheets", "estimate", "reports"],
  },
  {
    slug: "spec-homes",
    title: "Spec homes",
    group: "Financials",
    area: "budget",
    pages: ["/spec", "/projects/*/spec", "/projects/*/spec/offer"],
    what: "Spec homes are houses you build to sell, with no client. The program tracks what each one costs to hold (loan interest, insurance, utilities) day by day, its break-even, and what it makes at list price, and works out any offer that comes in.",
    how: [
      "Start the job as a **Spec home** (or mark a job as one on the **Spec homes** page).",
      "On the job's **Spec sale** tab, add the carrying costs, such as the construction loan's interest and insurance.",
      "When it's listed, fill in **Listing & selling costs**: list price, commissions, closing costs, prorations.",
      "An offer comes in? Click **Work out an offer**, type the price and terms, and see your profit and a counter price.",
      "When it closes, fill in **Sold it?** and click **Mark sold**. The selling costs go on the Budget, so the job's profit is real.",
    ],
    sections: [
      {
        heading: "The Spec homes page",
        items: [
          { name: "On the market / Listed at / Carrying, all houses / Profit at list", what: "Houses for sale, their total list price, what they all cost to hold a day, and profit at list if they closed in 30 days." },
          { name: "The table", what: "Each house: list price, days listed, what the house cost, carrying so far, break-even and profit at list. **Offer** opens the offer calculator." },
          { name: "Mark a job as a spec house", what: "Turns an existing job into a spec house." },
        ],
      },
      {
        heading: "The Spec sale tab",
        items: [
          { name: "The house / Carrying so far / Break-even / Profit at list", what: "What the house costs: the estimate, its sales tax and approved change orders (or what's been spent, where that's more) — the line under it shows each piece, so it adds up to the estimate's **Est. cost**; holding costs so far and per day, the lowest price that breaks even, and profit at list." },
          {
            name: "Carrying costs",
            what: "What the house costs to hold. Each month's charge goes on the Budget under its cost code.",
            how: "**Add a carrying cost**: name it, choose **Loan interest** (balance and rate) or **An amount** (a month, a year, or once), the dates, and the cost code.",
          },
          { name: "Draws, paydowns, rate changes", what: "On a loan: log each draw as the bank funds it, paydowns and rate changes; interest is worked out on each day's balance. Type the bank's interest for a month to match your statement." },
          { name: "Listing & selling costs", what: "List price and date, listing and buyer's agent %, usual concessions, each closing cost (% or $), and property tax and HOA prorations. Tick the box to use them on your next spec houses." },
          { name: "Offers", what: "Each offer as it was worked out, with its status: Open, Countered, Accepted, Rejected." },
          { name: "Sold it? / Mark sold", what: "Sale price, closing date, buyer's agent, concessions, repairs and title. Carrying costs stop and the selling costs go on the Budget. **Back on the market** undoes it." },
        ],
      },
      {
        heading: "Work out an offer",
        items: [
          { name: "Offer price / Closing date / Buyer's agent / Concessions / Repairs", what: "The offer's terms. Everything updates as you type." },
          { name: "Count interest on the draws still to come", what: "Adds interest on money still to be drawn to finish the house, until closing." },
          { name: "Profit on this offer / The net sheet", what: "What you'd make, and every line from the price to your profit: closing costs, the house, carrying costs to closing." },
          { name: "What to counter at", what: "Type the profit you want and it gives the price to counter at." },
          { name: "Save offer", what: "Saves it to the house's offers." },
        ],
      },
    ],
    related: ["budget", "projects"],
  },
  {
    slug: "inventory",
    title: "Inventory",
    group: "Financials",
    area: "purchasing",
    pages: ["/inventory", "/projects/*/materials/inventory"],
    what: "**Inventory** tracks materials you keep on the shelf and what they're worth. Pulling stock to a job charges the job and lowers what its Material list orders; leftovers can go back on the shelf, crediting the job.",
    how: [
      "Click **Inventory** in the menu. Add what's on your shelves with **Add to inventory** (pick an Item List item so jobs find it).",
      "On a job's **Material list**, click **Pull from inventory**, type how many of each to pull, and click **Pull these to the job**.",
      "When a job has leftovers, use **Return leftovers to inventory** on the same screen.",
    ],
    sections: [
      {
        heading: "The Inventory page",
        items: [
          { name: "Worth / Items in stock / Moves", what: "What's on hand is worth (count × average cost), how many items, and every move." },
          { name: "Add to inventory", what: "Item, how many, unit if it's new, and cost each (blank uses the Item List price)." },
          { name: "History", what: "An item's last moves: added, pulled to a job, returned, recounted." },
          { name: "Recount / Set", what: "Records a physical count." },
          { name: "Remove", what: "Takes an item out of inventory. Jobs it was pulled to keep their cost." },
        ],
      },
      {
        heading: "Pulling to a job",
        items: [
          { name: "What this job needs that you have", what: "Filled in with what the job still needs, as much as you have. Change any number, or clear it." },
          { name: "Everything else in inventory", what: "Other stock you can pull to the job." },
          { name: "Pull these to the job", what: "Charges the job at inventory value; the Material list orders that much less." },
          { name: "Put back", what: "Undoes a pull: back on the shelf, off the job's cost, and ordered again." },
          { name: "Return leftovers to inventory", what: "Puts leftover material on the shelf and credits the job what it cost. **Undo** takes it back." },
        ],
      },
    ],
    related: ["material-list", "budget"],
  },
  {
    slug: "reports",
    title: "Reports",
    group: "Financials",
    area: "reports",
    pages: ["/reports", "/reports/*"],
    what: "**Reports** show how the company is doing, worked out from your estimates, change orders, costs, bills, invoices and payments: profit by job, work in progress, cash flow, what clients owe, and your sales.",
    how: ["Click **Reports** in the menu.", "Pick a report from the tabs.", "**Print / PDF** prints any of them."],
    sections: [
      {
        heading: "The reports",
        items: [
          { name: "Job profit", what: "Each job's contract, budget cost, bid profit, cost so far, what it's heading for, and the **fade** (profit lost against the bid). Pink rows are fading. Show all sold jobs, active or finished." },
          { name: "WIP (over / under billing)", what: "For active jobs: % done (by cost), what's been earned, and whether you've billed ahead of the work (over-billed) or behind it (under-billed). **Bill it** starts an invoice. Pick an **As of** date." },
          { name: "Cash flow", what: "Money in and out by month or week: actual for the past, expected from now on (open invoices and unpaid bills by due date). Type your bank balance to see the lowest point ahead." },
          { name: "What clients owe (AR aging)", what: "Every sent, unpaid invoice by client and how late it is: not due, 1–30, 31–60, 61–90 and over 90 days." },
          { name: "Sales & win rate", what: "Win rate, wins, days from first call to won, the pipeline now, why you lose, and results by lead source and by month." },
        ],
      },
    ],
    related: ["budget", "invoices", "leads", "dashboard"],
  },
];
