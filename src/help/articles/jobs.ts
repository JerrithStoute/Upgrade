import type { HelpArticle } from "../types";

export const JOBS: HelpArticle[] = [
  {
    slug: "getting-started",
    title: "How the program fits together",
    group: "Getting started",
    area: null,
    pages: ["/help"],
    what: "The Builder Station runs a building job from start to finish in one place. Plans come in, you measure them (the **takeoff**), the takeoff prices your **estimate**, the estimate becomes the client's **proposal**, and once they sign it becomes the job's **budget**. From there you order with **purchase orders**, track **bills**, bill the client with **invoices**, and run the job with the **schedule**, **daily logs**, **selections**, **change orders** and the **time clock**.",
    how: [
      "Start a job: **Projects → + New project**.",
      "Upload the plans on the job's **Plans** tab and measure them on the **Takeoff** tab.",
      "Open the **Estimate** tab: the takeoff's costs are already there. Add the rest, set your markup, and send the proposal.",
      "When the client approves, order with **Purchasing**, bill with **Invoices**, and track costs on the **Budget**.",
      "Anywhere you're unsure, click the **?** at the top of the page.",
    ],
    sections: [
      {
        heading: "Finding your way",
        items: [
          { name: "The menu (left)", what: "The main parts of the program: Dashboard, Leads, Projects, Spec homes, Clients, Schedule, To-Dos, Time clock, Invoices, Bills, Inventory, Reports and Settings. You only see the parts your position allows." },
          { name: "A job's tabs", what: "Inside a job: Overview, Plans, Material list, Takeoff, Estimate, Selections, Change Orders, Schedule, Purchasing, Budget, Invoices, Daily Logs, To-Dos, Files and Messages." },
          { name: "? (Help)", what: "This manual. It opens to the part about the page you're on, with a search box. Press ? on the keyboard too." },
          { name: "Bell", what: "Your to-dos." },
          { name: "Your name", what: "Your account: password and two-step sign-in." },
        ],
      },
      {
        heading: "Words used in this manual",
        items: [
          { name: "Takeoff", what: "Measuring the plans to find out how much of everything you need. Also the name of one thing you measure (\"2x6 Ext Walls\")." },
          { name: "Item List", what: "Your price list of materials and labor (Settings → Item List)." },
          { name: "Recheck prices", what: "On each cost code, how often its prices go out of date (lumber every few weeks, windows every 6 months). You set them all; blank means never. Older prices get flagged **Recheck price** before you bid with them." },
          { name: "Cost code", what: "A code for a kind of work or material (like 3120 Framing Package). Costs are added up by cost code on the estimate and the Budget." },
          { name: "Division → Category → Item", what: "How an estimate is organized: big groups (divisions), then what the client sees and picks (categories), then your cost lines (items)." },
          { name: "Markup / Margin / Profit", what: "**Markup %** is a percent added on top of cost. **Margin** is profit as a share of the selling price. **Profit $** is the dollars." },
          { name: "Locked prices", what: "Once an estimate is sent, the job keeps its prices even if your Item List changes." },
        ],
      },
    ],
    related: ["projects", "takeoff-screen", "estimate"],
  },
  {
    slug: "projects",
    title: "Projects",
    group: "Jobs",
    area: null,
    pages: ["/projects", "/projects/new"],
    what: "**Projects** lists every job, grouped into Spec homes, Custom homes, Remodels, All projects, and a map of your jobs. From here you find a job, filter by status or manager, and start new ones.",
    how: [
      "Click **Projects** in the menu.",
      "To find a job, type in the search box or click a status chip.",
      "To start one, click **+ New project**, pick the kind of job (Spec home, Custom home or Remodel), fill in the name, client and address, and click **Create project**.",
    ],
    sections: [
      {
        heading: "The list",
        items: [
          { name: "Status chips", what: "All, Lead, Estimating, Proposal Sent, Contracted, In Progress, On Hold, Completed, Cancelled, with how many jobs are in each.", how: "Click one to show only those jobs." },
          { name: "Search / All statuses / Any manager / Filter / Clear", what: "Find jobs by name, number or address, and narrow by status or project manager. **Clear** resets." },
          { name: "Widgets (Spec homes, Custom homes, Remodels, All projects, Map)", what: "Groups of jobs, each with its count and total value.", how: "Click a title to tuck it away or open it; drag the grip to reorder. **+ New** in a widget starts a job of that kind. The program remembers your layout." },
          { name: "Map", what: "Every open job as a pin, colored by status. Click a pin for **Directions**, **Open the job** or **Move pin**. Switch **Map** / **Satellite** at the top right; the program remembers your pick. Jobs not on the map are listed under it; set their spot on their Edit page." },
          { name: "Move pin", what: "For a pin in the wrong spot. Click the pin, then **Move pin**, then drag it (or tap the map) where the job really is. It saves at once and the time clock uses the new spot. **Undo** puts it back; **Done** stops moving.", how: "Satellite makes it easy to find the lot." },
          { name: "Plan templates", what: "Houses you build over and over, kept to start new jobs from. They're off every list of jobs, the map, the schedule and QuickBooks.", how: "Click the purple **Plan templates** chip to see them." },
        ],
      },
      {
        heading: "New project",
        items: [
          { name: "What kind of job?", what: "**Spec home** (built to sell, no client), **Custom home** (a new home for a client) or **Remodel** (work on a client's home). Required." },
          { name: "Project name / Status", what: "What you call the job, and where it stands. New jobs usually start as Lead." },
          { name: "Client", what: "Who it's for. A spec home needs none. **Add a client** if they're new." },
          { name: "Project manager / Team on this job", what: "Who runs it, and who else works on it. People whose position shows only their jobs see the jobs they manage or are on the team of." },
          { name: "Address / City / State / ZIP", what: "The job site. The program finds it on the map from the address after you save." },
          { name: "Start date", what: "When work starts." },
          { name: "Estimate template", what: "Starts the job's estimate from one of your templates. You can change every line after." },
          { name: "Start from a plan template", what: "Shows when you have plan templates: click one to start the new job from it (its plans, takeoff, estimate and schedule), on **Copy this job**." },
        ],
      },
    ],
    related: ["project-page", "estimate", "getting-started"],
  },
  {
    slug: "project-page",
    title: "A job's Overview and Edit pages",
    group: "Jobs",
    area: null,
    pages: ["/projects/*", "/projects/*/edit"],
    what: "Each job opens on its **Overview**: the money, the schedule, what's waiting on the client, to-dos, the job site map and recent activity, on one page. **Edit** changes the job's details, its map spot, and which subs and vendors see where it is.",
    how: [
      "Click a job in **Projects**.",
      "Use the tabs across the top to move around the job.",
      "Click **Edit** (pencil) to change its details or status.",
    ],
    sections: [
      {
        heading: "The top of every job page",
        items: [
          { name: "Status badge", what: "Where the job stands. Change it on **Edit**. Some steps change it for you: marking the proposal sent sets Proposal Sent, approval sets Contracted." },
          { name: "Client view", what: "Shows the page you're on exactly as your client sees it in their portal (look only). Shows when the job has a client." },
          { name: "Copy / Use this plan", what: "Starts a new job from this one: its plans, takeoff, estimate and schedule. Also where you make the job a plan template. See **Copy a job and plan templates**." },
          { name: "Edit", what: "Opens the job's details." },
          { name: "Tabs", what: "Overview, Plans, Material list, Takeoff, Estimate, Selections, Change Orders, Schedule, Spec sale (spec homes), Purchasing, Budget, Invoices, Daily Logs, To-Dos, Files, Messages. You only see the tabs your position allows." },
        ],
      },
      {
        heading: "Overview",
        items: [
          { name: "Contract value / Costs to date", what: "What the job is sold for, and what it has cost so far (red if over)." },
          { name: "Invoiced / Paid / Balance due", what: "What you've billed the client, what they've paid, and what's owed." },
          { name: "Schedule", what: "How far along the schedule is." },
          { name: "Upcoming tasks / Recent daily logs / Open to-dos", what: "What's next on the schedule, the latest logs, and open to-dos, with links to each tab." },
          { name: "Job site", what: "A map of the job, as a street map or **Satellite**. **Directions** opens your maps app with directions from where you are. **Move pin** fixes a pin in the wrong spot: drag it (or tap the map) where the job is; it saves at once, and **Undo** puts it back." },
          { name: "Client approvals", what: "Selections and change orders waiting on the client. Red means overdue." },
          { name: "Recent activity", what: "The latest things done on the job, and by whom." },
        ],
      },
      {
        heading: "Edit",
        items: [
          { name: "Project details", what: "The same boxes as a new job, plus **Actual end date**. Click **Save changes**." },
          { name: "Use where I'm standing", what: "Sets the job's map spot from your phone's location while you're at the site. The time clock uses it to flag punches made away from the job." },
          { name: "Look up the address again", what: "Finds the map spot from the address again." },
          { name: "Job site map / Move pin", what: "The job's spot on a map (street or **Satellite**). If it's wrong, click **Move pin** and drag it where the job is. A moved pin stays put until the address changes." },
          { name: "Subs & vendors who see where this job is", what: "Tick the subs and vendors who should see this job's address, a map and directions in their portal. Click **Save**." },
          { name: "Delete project", what: "Admins only: removes the job and everything on it (estimates, selections, change orders, schedule, invoices, logs, files, messages). It can't be undone." },
        ],
      },
    ],
    related: ["projects", "time-clock"],
  },
  {
    slug: "copy-job",
    title: "Copy a job and plan templates",
    group: "Jobs",
    area: null,
    pages: ["/projects/*/copy"],
    what: "Build the same house again on another lot without starting over. **Copy** makes a new job from this one: its plans, takeoff, estimate and schedule, as you pick. Keep a house you build often as a **plan template**: it's off the job lists, ready to copy.",
    how: [
      "Open the job and click **Copy** at the top (on a plan template it says **Use this plan**). Or on **New project**, click a plan under **Start from a plan template**.",
      "Type the new job's name, and pick the client and address if you know them.",
      "Tick what to bring along. If you bring the schedule, pick its start date.",
      "Click **Copy job**. The new job opens.",
    ],
    sections: [
      {
        heading: "What comes along",
        items: [
          { name: "Plans & takeoff", what: "The current plan sets, each sheet with its scale, every takeoff with its items, and every shape where it was drawn. The door and window lists and substitutions come too. Lines are worked out again at today's Item List prices." },
          { name: "Estimate", what: "The newest version, as a new draft. Its lines stay tied to the copied takeoffs, so they follow them." },
          { name: "Schedule", what: "Every task and what waits on what, laid out again from the start date on your workdays. Progress doesn't come along." },
          { name: "Never copied", what: "Selections (left blank for the new client), bids, POs, bills, invoices, change orders, daily logs, time, messages, photos and other files. They belong to the first job." },
        ],
      },
      {
        heading: "Plan templates",
        items: [
          { name: "Keep this job as a plan template", what: "Turns the job into a plan template: it leaves the job lists, the schedule, the map and QuickBooks, and shows under **Projects → Plan templates**.", how: "Click **Make it a regular job again** to undo." },
          { name: "Keep the copy as a plan template", what: "Makes the copy a plan template instead of a real job, with no client or address. Use it to save a clean version of a house from a job you built." },
        ],
      },
    ],
    tips: [
      "The copy is its own job. Changing it never changes the job it came from, and changing a plan template never changes jobs already copied from it.",
    ],
    related: ["projects", "project-page", "takeoff-screen", "estimate"],
  },
  {
    slug: "selections",
    title: "Selections",
    group: "Jobs",
    area: "selections",
    pages: ["/projects/*/selections", "/projects/*/selections/new", "/projects/*/selections/*"],
    what: "Selections are the things your client picks: flooring, cabinets, fixtures, paint. Each one comes from the estimate (a category marked **Selection**, or with an **Allowance**). Here you add the choices, set deadlines, share files, and see whether what they picked is over or under the allowance. The client picks in their portal.",
    how: [
      "On the estimate, open a category and set its **Type** to **Selection** (or tick **Allowance**). It shows up on the **Selections** tab.",
      "On its card, click **Add choice** for each option: name, client price, your cost, description, vendor, a picture or spec sheet.",
      "Set a deadline: a date, or so many days before a schedule item.",
      "The client chooses in their portal, or you tick a choice and click **Make choice** for them.",
      "When the choice is over or under the allowance, put it on a change order to bill or credit the difference.",
    ],
    sections: [
      {
        heading: "The top of the tab",
        items: [
          { name: "Selections / Still to choose / Allowances / Over / under", what: "How many selections there are, how many are still waiting (and how many overdue), the allowance total, and how far the choices made are over (red) or under (green)." },
          { name: "The list (left)", what: "Every selection, by division, with its cost codes, where it stands (amber dot: waiting, red: overdue, green: chosen) and when it's due. **NEW** means someone else changed it since you looked.", how: "Click one to open it on the right. Only one is open at a time, so a choice always goes on the selection you meant." },
          { name: "Deadlines", what: "Sets deadlines for many selections at once: tick them, set the deadline, **Apply to N ticked**, then **Save deadlines**." },
        ],
      },
      {
        heading: "A selection card",
        items: [
          { name: "Tags", what: "**Selection** or **Allowance**, and where it stands: Waiting on a choice, Chosen, Not wanted, Approved, Ordered, Installed. **Updated** means someone else changed it since you looked. **Overdue** turns the card red." },
          { name: "Set a deadline / Change", what: "**No deadline**, **A date**, or **A schedule item** with how many days before it. A schedule-based deadline moves when the schedule moves." },
          { name: "Edit in the estimate", what: "The name, spec text and allowance come from the estimate; change them there." },
          { name: "Files", what: "Drawings, spec sheets, photos for the client. **✓ Client viewed** shows when they've opened one.", how: "Click **Add files** or drop files on the box. Photos show first: tap one to mark it up (draw, arrows, circles, notes, crop), then **Add**." },
          { name: "Original budget", what: "What the estimate has for it: cost lines, profit, total. Only your team sees it." },
          { name: "Comments", what: "A conversation with the client about this selection.", how: "Write a comment and click **Post**. Tick **Team only** to keep it from the client." },
          { name: "Allowance", what: "The amount the client's choice is measured against for over / under. Pick how it's figured from the estimate, in dollars: **your cost, no markup**, or **with your markup**, or the company default." },
          { name: "Choices", what: "Each option: picture, name, description, vendor, model, your cost, the client price, and how it compares to the allowance. The last row, **I do not want this selection**, is the client saying no." },
          { name: "Add choice", what: "A new option: name, client price, your cost, description, vendor, model, and a file or picture. The form says which selection it's for." },
          { name: "Move to another selection (arrows)", what: "Moves a choice, with its picture and files, to another selection, for when it went on the wrong one. If it was the choice made, the first selection goes back to waiting." },
          { name: "Make choice / Clear choice", what: "Saves the ticked choice for the client, or clears it back to waiting." },
        ],
      },
      {
        heading: "Other selections",
        text: [
          "Things the client picks that **aren't on your estimate**, like house numbers, a mailbox or a doorbell. Use them when you don't want to add a line to the estimate for it.",
          "Add one with **+ New selection**: a title, category, location, cost code, allowance, due date and description. Then add its choices on its page, and walk it through **Approve**, **Mark ordered** and **Mark installed**.",
          "When you delete a category from the estimate, its selection goes too — unless the client already made choices, or there are comments, files or change orders on it. Then it lands here, so nothing is lost.",
          "One with no choices on it has a **Remove** button right in this list.",
        ],
      },
    ],
    tips: [
      "The client never sees your cost, the original budget, or team-only comments.",
      "Settings → Invoices can put selection overages and credits on a change order for you.",
    ],
    related: ["estimate", "change-orders"],
  },
  {
    slug: "change-orders",
    title: "Change orders",
    group: "Jobs",
    area: "selections",
    pages: ["/projects/*/change-orders", "/projects/*/change-orders/new", "/projects/*/change-orders/*", "/projects/*/change-orders/*/print", "/settings/change-orders"],
    what: "A change order is a priced change to the job after the contract: something the client asked for, something you found, a design or code change. You list what's changing and its price, send it for approval, and once it's approved it's added to the contract.",
    how: [
      "On the job's **Change Orders** tab, click **+ New change order**.",
      "Give it a title, a description, the reason and the days it adds, and click **Create change order**.",
      "Add lines: client choices from selections (**Add items**), **+ New item**, or **+ Extra charge** (like a change order fee).",
      "Set your profit and tax, choose what the client sees, and pick who needs to approve.",
      "Click **Send for approval**. The client approves in their portal by typing their name, or you record their answer.",
    ],
    sections: [
      {
        heading: "The tab",
        items: [
          { name: "Approved / Pending approval / Schedule impact / Total", what: "Approved dollars, dollars waiting on a decision, days added by approved change orders, and how many there are." },
          { name: "The table", what: "Each change order: title, reason, status (Draft, Pending Approval, Approved, Declined, Void), price, days, when it was sent and decided." },
        ],
      },
      {
        heading: "A change order",
        items: [
          { name: "Print / PDF", what: "The change order document with signature lines." },
          { name: "Send for approval", what: "Sends a draft: emails the client and shows it in their portal. If no one has to approve it, it's approved right away." },
          { name: "Delete / Void", what: "Delete removes a draft. Void cancels an approved or declined one; it stops counting toward the contract." },
          { name: "Record the client's decision", what: "When the client approved or declined outside the portal (on paper, by email).", how: "Fill in who decided and a note, then **Record approval** or **Record decline**." },
          { name: "Details / Intro text", what: "The title, a description for you, and the text the client reads first. **Use as default** saves the text for new change orders." },
          { name: "Line items", what: "Each line: cost code (yours; the client never sees it), what's being added, the price, the allowance and difference for client choices, and its profit and tax.", how: "**Add items** brings in client choices not yet on a change order. **+ New item** adds a line. **+ Extra charge** adds a fee." },
          { name: "What the client sees", what: "**Itemized with prices**, **Items, no prices** (only the total), or **Total only** (title, intro and total)." },
          { name: "Profit & tax", what: "**No profit**, **Markup %** or **Profit $**, shown as its own line or folded into the prices. Any line can have its own. Sales tax you pay can be its own line or built in." },
          { name: "Effect on contract", what: "The contract before, approved change orders so far, this one, and the new total; terms; days added; and the old and new completion dates." },
          { name: "Files / Closing text", what: "Files the client sees with it, and the text at the end." },
          { name: "Approvals", what: "Who has to approve it: team members (a green check when they have) and the client. **If declined** sets what happens to the selections on it." },
        ],
      },
      {
        heading: "Settings: Change order defaults",
        text: ["Admins can set what new change orders start with: the introduction, closing and terms wording, your profit and how it shows, and what happens when the client declines. Change orders already started keep what they have."],
      },
    ],
    tips: [
      "Once every approver has approved, its selections are marked approved, and (if Settings → Invoices says so) it's added to the job's next invoice. A change order is never billed twice.",
      "People whose position doesn't see costs can open change orders only as the client's document.",
    ],
    related: ["selections", "invoices", "estimate"],
  },
];
