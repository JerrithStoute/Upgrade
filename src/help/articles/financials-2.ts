import type { HelpArticle } from "../types";

/** Budget, spec homes, inventory and reports — the rest of the Financials chapter. */
export const FINANCIALS_2: HelpArticle[] = [
  {
    slug: "budget",
    title: "Budget",
    group: "Financials",
    area: "budget",
    pages: ["/projects/*/budget"],
    what: "A job's **Budget** tab is one spreadsheet by cost code: what each one was supposed to cost, what you've agreed to pay, what's been spent, and where it's heading — so you know mid-job whether you'll make money. Every number opens what makes it up. Nothing has to be set up for it to work: an estimate and your bills are enough. Bids you take, POs and the **Done** boxes only make it sharper.",
    how: [
      "Approve the estimate (or use it as the budget on a spec home). Its costs become the budget. No estimate? The budget is the contract price against everything spent.",
      "As bills are approved, crews clock time and receipts go in, **Spent** fills in by itself.",
      "Click any underlined number to see what's behind it, and click any of those to open the bill, invoice, PO or estimate itself.",
      "When a cost code is finished, check **Done** so its projected cost is what was really spent.",
      "Use **+ New** (or pick lines with the boxes on the left) to make a bill, expense, PO, change order, invoice or bid request without leaving the page.",
    ],
    sections: [
      {
        heading: "The top strip",
        items: [
          { name: "Budget", what: "The approved estimate's cost plus approved change orders." },
          { name: "Spent", what: "Everything spent on the job so far." },
          { name: "Projected cost", what: "Where the job's cost is heading (each line's projected, added up), and how far over (red) or under (green) the budget that is." },
          { name: "Invoiced", what: "What you've billed the client (sent invoices), out of the contract price." },
          { name: "Projected profit", what: "The contract price less the projected cost. Click it to compare with the profit you estimated." },
          { name: "Unpaid bills", what: "Costs not paid yet. Click it to see them and open one to pay it." },
        ],
      },
      {
        heading: "By cost code",
        items: [
          { name: "Budget", what: "That cost code's cost on the approved estimate (before markup), plus change orders. Click it for the estimate lines and change orders behind it." },
          { name: "Committed", what: "What you've agreed to pay: the bid you took for it (lumber or a sub), or a PO you sent. A dash means none — that's fine; most jobs run without POs." },
          { name: "Spent", what: "Every bill, receipt, crew week, inventory pull and credit on that cost code. Click it for the list; the panel also has **Add expense here** and **Add bill here**." },
          {
            name: "Done",
            what: "Check it when no more money should go to that cost code. Its projected cost becomes exactly what was spent, so a line that came in under budget shows the saving. It never locks anything: a punch-list bill that comes in later still lands on the line, and projected goes up with it — no need to uncheck it. Each division shows how many of its lines are done (2/5).",
          },
          {
            name: "Projected",
            what: "Where the cost code is heading. Done: what was spent. Otherwise the committed amount when there is one (over or under budget), else the budget — or what's been spent, once spending passes that. Click it for a one-line reason.",
          },
          { name: "Over / under", what: "Projected less budget: red is over, green is under." },
          { name: "Price / Invoiced", what: "What the client pays for that cost code (estimate and change orders), and what invoices have billed to it." },
          { name: "Not sorted", what: "Costs, estimate lines and invoice lines with no cost code, kept at the bottom so the totals are always complete. Click **Sort…** to see them; open each one to give it a cost code." },
          { name: "Divisions", what: "Each division has a total line. Click its name (or the arrow) to fold it up." },
        ],
      },
      {
        heading: "Doing things from the Budget",
        items: [
          { name: "+ New", what: "A bill, expense or receipt, purchase order, change order, invoice or bid request for this job. With a line's panel open, the bill, expense or PO starts on that cost code." },
          { name: "Picking lines", what: "Tick the boxes on the left of one or more lines. A bar appears: **Create bill** (one line per cost code, filled in with what's left of each), **Create purchase order** (from the budget's lines for them) or **Send for bids** (opens Bids with those cost codes ticked: their Material list items under What to send, any others under Send to subs, and the vendors who bid them)." },
          { name: "Print", what: "Prints the budget." },
        ],
      },
      {
        heading: "All expenses",
        items: [
          { name: "The list", what: "Folded at the bottom: every cost on the job — date, vendor, cost code, category, description, amount and status." },
          {
            name: "Timesheets / Open bill / Inventory / Spec sale",
            what: "Costs that come from somewhere else link back to it, and are changed there: crew time on Timesheets, a vendor bill in Purchasing, inventory on the Material list's inventory screen, carrying costs on the Spec sale tab.",
          },
          { name: "Mark paid / Edit / Delete", what: "For expenses you added by hand." },
        ],
      },
    ],
    tips: [
      "You don't need purchase orders or bids for the budget to work. Without them, projected is the budget until spending passes it.",
      "Crew time only costs something once each person has a pay rate in Settings → Time clock.",
    ],
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
      "When it's listed, click **Edit** on **Listing and selling costs**: list price, commissions, closing costs, prorations. **Save** keeps you on the tab.",
      "An offer comes in? Click **Work out an offer**, type the price and terms, and see your profit and a counter price.",
      "When it closes, click **Mark sold…**, check the numbers (filled in from the accepted offer), and click **Mark sold**. The selling costs go on the Budget, so the job's profit is real.",
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
          { name: "The house / Carrying so far / Break-even / Profit at list", what: "What the house costs (spent, plus the rest from the estimate, sales tax included — the same as the estimate's **Est. cost**), holding costs so far and per day, the lowest price that breaks even, and profit at list." },
          {
            name: "Carrying costs",
            what: "What the house costs to hold. Each month's charge goes on the Budget under its cost code.",
            how: "**+ Add a carrying cost** (under the table): name it, choose **Loan interest** (balance and rate) or **An amount** (a month, a year, or once), the dates, and the cost code. **Edit** on a line opens it right under that line.",
          },
          { name: "Draws, paydowns, rate changes", what: "On a loan: log each draw as the bank funds it, paydowns and rate changes; interest is worked out on each day's balance. Type the bank's interest for a month to match your statement." },
          { name: "Listing and selling costs", what: "Shows the list price and date, commissions, usual concessions, each closing cost (% or $) as a list with its total at the list price, and property tax and HOA prorations. **Edit** turns each line into its box, in the same order; tick the box at the bottom to use them on your next spec houses." },
          { name: "Offers", what: "Each offer as it was worked out, with its status: Open, Countered, Accepted, Rejected.", how: "**Update** on an offer: pick its status, and for a counter, your counter price." },
          { name: "Sold it? / Mark sold…", what: "Opens the sale price, closing date, buyer's agent, concessions, repairs and title, filled in from the accepted offer. Carrying costs stop and the selling costs go on the Budget. **Back on the market** undoes it." },
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
      "Click **Inventory** in the menu. Add what's on your shelves with **+ Add to inventory** (pick an Item List item so jobs find it).",
      "On a job's **Material list**, click **Pull from inventory**, type how many of each to pull, and click **Pull these to the job**.",
      "When a job has leftovers, use **Return leftovers to inventory** on the same screen.",
    ],
    sections: [
      {
        heading: "The Inventory page",
        items: [
          { name: "Worth / Items in stock / Moves", what: "What's on hand is worth (count × average cost), how many items, and every move." },
          { name: "Find box", what: "Type part of an item's name and the list narrows as you type." },
          { name: "+ Add to inventory", what: "Opens a small box at the top of the list: item, how many, unit if it's new, cost each (blank uses the Item List price) and a note. **Cancel** closes it." },
          { name: "Click an item's name", what: "Opens its last moves right under it: added, pulled to a job, returned, counted, with the job, who and the note. Click the name again to close it." },
          { name: "Count", what: "Opens a line under the item: type how many are on the shelf now and click **Set count**." },
          { name: "Remove from inventory…", what: "On the Count line. Takes an item out of inventory after asking. Jobs it was pulled to keep their cost." },
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
    how: ["Click **Reports** in the menu.", "Pick a report from the tabs.", "On Job profit, WIP and What clients owe, type in the find box to narrow the list to a job or client as you type.", "**Print / PDF** prints any of them."],
    sections: [
      {
        heading: "The reports",
        items: [
          { name: "Job profit", what: "Each job's contract, budget cost, bid profit, cost so far, what it's heading for (worked out line by line exactly like the job's Budget tab: bids you took, POs and **Done** count), and the **fade** (profit lost against the bid). Pink rows are fading. Show all sold jobs, active or finished." },
          { name: "WIP (over / under billing)", what: "For active jobs: % done (cost so far out of the projected cost, the same projected cost as the Budget tab), what's been earned, and whether you've billed ahead of the work (over-billed) or behind it (under-billed). **Bill it** starts an invoice. Pick an **As of** date." },
          { name: "Cash flow", what: "Money in and out by month or week: actual for the past, expected from now on (open invoices and unpaid bills by due date). Type your bank balance to see the lowest point ahead." },
          { name: "What clients owe", what: "Accounts receivable aging: every sent, unpaid invoice by client and how late it is: not due, 1–30, 31–60, 61–90 and over 90 days." },
          { name: "Sales and win rate", what: "Win rate, wins, days from first call to won, the pipeline now, why you lose, and results by lead source and by month." },
        ],
      },
    ],
    related: ["budget", "invoices", "leads", "dashboard"],
  },
];
