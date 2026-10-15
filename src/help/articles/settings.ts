import type { HelpArticle } from "../types";

export const SETTINGS: HelpArticle[] = [
  {
    slug: "team",
    title: "Settings: Team and positions",
    group: "Settings",
    area: "admin",
    pages: ["/settings/team"],
    what: "**Team & positions** is where you add the people who work for you and decide what each of them sees and changes. A **position** (Project manager, Office / Bookkeeper, Estimator, Field crew…) sets what everyone in it can do; you can also change single things for one person. Only admins open this page.",
    how: [
      "Go to **Settings → Team & positions**.",
      "Look over the **Positions**: the starter ones are ready to use, and you can change them or add your own.",
      "Under **Invite a team member**, type their email, pick their position, and click **Send invitation**. They get an email to choose their own password.",
      "Need one person to see a little more or less than their position? Click **Access** on their row.",
    ],
    sections: [
      {
        heading: "Inviting people",
        items: [
          { name: "Email / Name / Position", what: "Who to invite and what position they'll have. **Admin** gets everything, including Settings." },
          { name: "Send invitation", what: "Emails them a link to choose their own password. It works for 7 days. You never set anyone's password." },
          { name: "Add someone who doesn't sign in", what: "Adds a person who never signs in, such as a crew member you put on the schedule or the time clock: name, title (Framer) and phone." },
          { name: "Invitations waiting", what: "Invites not yet accepted, and when each runs out. **Resend** sends a fresh 7-day link; **Cancel** stops the old link working." },
        ],
      },
      {
        heading: "Team members",
        items: [
          { name: "Position", what: "Each person's position. \"changed for this person\" means they have their own Access changes." },
          { name: "Time off", what: "Vacation days a year, if you set them." },
          { name: "Active / Inactive", what: "Click to switch. Turning someone inactive signs them out everywhere right away. You can't turn yourself off." },
          { name: "Edit", what: "Change their name, title, phone, position and vacation days. Picking a new position clears changes made just for them. **Send password reset** emails them a link (good for 1 hour) to choose a new password." },
          { name: "Access", what: "What just this person sees and changes, starting from their position. Anything set differently shows an amber **changed** tag.", how: "Change the boxes and click **Save access**. **Use the position's access** clears their changes." },
          { name: "Delete / Deactivate", what: "Removes the person. Someone who wrote daily logs or messages is deactivated instead, so their work keeps their name." },
        ],
      },
      {
        heading: "Positions",
        text: [
          "Each position has a one-line summary of what it allows. Change a position and everyone in it changes. Admins always have everything, and only admins change Settings → Company, Team and billing.",
        ],
        items: [
          { name: "Edit", what: "Opens the position's name and its access, below the table. Click **Save position**." },
          { name: "New position / Start as a copy of", what: "Adds your own position, such as Superintendent, starting from a copy of another one." },
          { name: "Remove", what: "Removes a position nobody is in. Move its people to another position first." },
        ],
      },
      {
        heading: "What a position can do",
        text: ["Each part of the program is **Hidden**, **Can view** or **Can edit**:"],
        items: [
          { name: "Leads & clients", what: "Leads and clients." },
          { name: "Estimates, proposals & bids", what: "The estimate, proposal and vendor bids." },
          { name: "Takeoffs & Material List", what: "The takeoff and Material list." },
          { name: "Selections & change orders", what: "Selections and change orders." },
          { name: "Schedule, daily logs & to-dos", what: "The schedule, daily logs and to-dos." },
          { name: "Files, plans & messages", what: "Files, plans and client messages." },
          { name: "Purchasing, bills & inventory", what: "Purchase orders, bills and inventory." },
          { name: "Budget & spec sales", what: "The Budget, spec homes and spec sales." },
          { name: "Invoices", what: "Client invoices and payments." },
          { name: "Reports", what: "Reports, and the money cards on the dashboard." },
          { name: "Everyone's time", what: "Everyone else's hours and timesheets. Their own time clock always works." },
          { name: "Settings: lists & templates", what: "Item List, cost codes, vendors, member sizes, span tables and templates." },
          { name: "Settings: QuickBooks", what: "The QuickBooks connection and matching." },
          { name: "Which jobs", what: "**Every job**, or **Only their jobs**: the jobs they manage or are on the team of." },
          { name: "Can delay a job's schedule", what: "May push the schedule's dates back." },
          { name: "Can approve & pay bills", what: "May approve bills (so they count as the job's cost) and mark them paid." },
          {
            name: "Sees costs and profit",
            what: "Off: Takeoffs, Budget, Purchasing, Reports and the Settings lists are hidden; estimates and change orders open as the client sees them; Selections and Timesheets leave out cost and profit.",
          },
        ],
      },
      {
        heading: "Starter positions",
        items: [
          { name: "Staff", what: "Edits leads, estimates, takeoffs, selections, schedule, files, purchasing, budget and invoices on every job, and sees costs." },
          { name: "Project manager", what: "Like Staff, on only their jobs; views invoices and everyone's time, and can delay the schedule." },
          { name: "Office / Bookkeeper", what: "Edits purchasing, budget, invoices, reports, everyone's time and QuickBooks; approves bills; views the rest. No takeoffs." },
          { name: "Estimator", what: "Edits leads, estimates, takeoffs, files and the Settings lists; views selections, schedule, purchasing and budget." },
          { name: "Field crew", what: "Edits the schedule, daily logs and to-dos and views files. No costs." },
        ],
      },
      {
        heading: "More on the page",
        items: [
          { name: "Two-step sign-in for the team", what: "**Require it** makes everyone sign in with a code from an authenticator app too. Turn it on for yourself first (Your account)." },
          { name: "Client logins", what: "Your clients' portal sign-ins. They're made from each client's page." },
          { name: "Security log", what: "The latest 100 sign-ins, wrong passwords and codes, and changes to logins. Failed tries show in amber." },
        ],
      },
    ],
    tips: [
      "Everyone always has the dashboard, their own to-dos and their own time clock.",
      "The menu only shows what a person's position opens, and so does this manual.",
    ],
    related: ["vendors", "account", "time-clock"],
  },
  {
    slug: "vendors",
    title: "Settings: Vendors",
    group: "Settings",
    area: "lists",
    pages: ["/settings/vendors", "/settings/vendors/*"],
    what: "**Vendors** is your list of suppliers and subs: who you ask for prices and send purchase orders to, the cost codes they bid, their insurance certificates, and their portal sign-ins. You don't have to set them up first: a vendor is added the first time you type one.",
    how: [
      "Go to **Settings → Vendors**.",
      "Add one with **Add a vendor**, or paste or upload your whole list with **Have a list?**",
      "Tick the insurance every sub needs and click **Save**.",
      "Open a vendor to add their insurance certificates and invite them to the vendor portal.",
    ],
    sections: [
      {
        heading: "The vendor list",
        items: [
          { name: "Add a vendor", what: "Name, contact, phone, email, notes, and **Cost codes they bid**: picked for them when you send a list out for bids." },
          { name: "Have a list? Paste or upload it", what: "Paste rows from Excel or upload a CSV or Excel file (QuickBooks and CoConstruct exports work), one vendor per line, name first. Vendors you have are kept; only their blank details are filled in." },
          { name: "Insurance every sub needs", what: "General liability, Workers' comp, Auto, Umbrella. Applies to every vendor whose insurance you track." },
          { name: "Insurance (column)", what: "**Covered**, **Not tracked**, a warning (expired, missing, expiring), certificates they uploaded for you to confirm, and how many portal sign-ins they have." },
          { name: "Edit", what: "Changes a vendor. A new name changes everywhere: Item List, bids, POs." },
          { name: "Delete", what: "Removes the vendor and their certificate files. Their bids stay on your jobs." },
        ],
      },
      {
        heading: "A vendor's page",
        items: [
          { name: "Need their insurance?", what: "**Automatic** (yes once they're on a purchase order for work), **Yes**, or **No (a supplier)**." },
          { name: "Certificates", what: "Their certificates of insurance with coverage, carrier, policy and expiry. Red is expired; amber runs out within 30 days. You're warned 30 days ahead here, on their POs, on bills and on the dashboard." },
          { name: "Confirm", what: "A certificate they uploaded from their portal shows in blue. Check the coverage and date, then click **Confirm** so it counts." },
          { name: "Add a certificate", what: "Coverage, carrier, policy number, expiry date (required) and the file. Ones you add count right away." },
          { name: "Portal logins", what: "People at this vendor who sign in to the vendor portal: they see and accept their POs, see their schedule items, and upload bills and insurance. They never see your client prices or budgets.", how: "Type their email and click **Invite to the vendor portal** (the link lasts 7 days). **Turn off** signs them out; **Send password reset** emails them a link." },
          { name: "Their POs", what: "Every purchase order to this vendor, with its job, status and total." },
        ],
      },
    ],
    related: ["purchasing", "bids", "team"],
  },
  {
    slug: "settings-home",
    title: "Settings",
    group: "Settings",
    area: null,
    pages: ["/settings"],
    what: "**Settings** is where you set the program up the way your company works. It's grouped: Your company, Sales, Estimates & proposals, Takeoff, Jobs, Financials and Connections. You see only the pages your position allows; admins see them all.",
    how: ["Click **Settings** in the menu.", "Pick the page you want to change. Each one has its own article in this manual."],
    sections: [
      {
        heading: "The pages",
        items: [
          { name: "Your company", what: "**Company profile** (name, address, logo and colors, time zone, backups) and **Team & positions**." },
          { name: "Sales", what: "**Lead sources**." },
          { name: "Estimates & proposals", what: "Cost codes, Estimate divisions, Estimate parameters, Estimate templates, Markup, margin & tax, Proposal defaults." },
          { name: "Takeoff", what: "Item List, Member sizes, Span tables, Takeoff templates." },
          { name: "Jobs", what: "Work week & delays, Schedule templates, Change order defaults, Time clock." },
          { name: "Financials", what: "Invoices, Vendors." },
          { name: "Connections", what: "QuickBooks." },
        ],
      },
    ],
    tips: ["Company profile, Team, Markup, Proposals, Change orders, Time clock, Work week and Invoices are for admins only."],
    related: ["company-settings", "team"],
  },
  {
    slug: "company-settings",
    title: "Settings: Company profile, branding and backups",
    group: "Settings",
    area: "admin",
    pages: ["/settings/company"],
    what: "The **Company profile** page holds your company's name, address and license number (they go on proposals, invoices and the client portal), your logo and main color, your time zone, your backups, and a download of all your data.",
    how: ["Go to **Settings → Company profile**.", "Fill in your details and click **Save company**.", "Add your logo and pick a color, then click **Save branding**."],
    sections: [
      {
        heading: "Company profile",
        items: [
          { name: "Name / address / phone / email / website / license", what: "Shown on proposals, invoices and the client portal." },
          { name: "Time zone", what: "The time clock, the times shown, and the 6 am morning email follow it." },
        ],
      },
      {
        heading: "Branding",
        items: [
          { name: "Logo", what: "Drag your logo onto the box, or click to choose one. PNG, JPG or WebP." },
          { name: "Crop / stretch", what: "Trims the logo, cuts empty edges, and stretches it wider or taller. **Use this** keeps it." },
          { name: "Main color", what: "The color used across the program, the client portal and printouts. Pick a swatch or **Any color**. The preview shows how it looks." },
          { name: "Save branding", what: "Saves the logo and color. Nothing changes until you do." },
        ],
      },
      {
        heading: "Backups and your data",
        items: [
          { name: "Back up now", what: "Copies everything right away. Backups also happen by themselves once a day, and the last 30 are kept." },
          { name: "Restore", what: "Puts every job, setting and file back the way it was at that backup. A backup of right now is taken first, so a restore can be undone." },
          { name: "Download all our data", what: "Everything your company has in the program, every list as a spreadsheet plus all uploaded files, in one ZIP. It's yours to keep, any time." },
        ],
      },
    ],
    related: ["settings-home", "team"],
  },
  {
    slug: "invoice-settings",
    title: "Settings: Invoices",
    group: "Settings",
    area: "admin",
    pages: ["/settings/invoices"],
    what: "Admins choose what moves onto change orders and invoices by itself, and how invoices are numbered.",
    how: ["Go to **Settings → Invoices**.", "Tick what should happen by itself, choose how invoices are numbered, and click **Save**."],
    sections: [
      {
        heading: "On the page",
        items: [
          { name: "Selection overages and credits go on a change order", what: "When a client's choice is over or under its allowance, the difference goes on the job's draft \"Selections\" change order (started if needed)." },
          { name: "Approved change orders go on the next invoice", what: "An approved change order is added to the job's draft invoice (started if needed). It's never billed twice." },
          { name: "Number them for me / Start at", what: "The program numbers invoices across all jobs. To carry on from QuickBooks, type its next number." },
          { name: "I'll type them", what: "Each new invoice asks for its number, with the next unused one filled in." },
        ],
      },
    ],
    related: ["invoices", "change-orders"],
  },
  {
    slug: "quickbooks",
    title: "Settings: QuickBooks",
    group: "Settings",
    area: "quickbooks",
    pages: ["/settings/quickbooks"],
    what: "Links the program to your **QuickBooks Desktop** company file through QuickBooks' free Web Connector. Vendors come into your vendor list, jobs link to the QuickBooks Customer:Job with the same name, and cost codes link to the item named with their code. For now it only reads QuickBooks; nothing in your books is changed.",
    how: [
      "Go to **Settings → QuickBooks** and click **Set up the connection**.",
      "Click **Connection file** and save it on the computer that runs QuickBooks.",
      "Open QuickBooks with your company, signed in as Admin, in single-user mode. Choose **File → Update Web Services → Add an application**, pick the file, and allow access even when QuickBooks isn't running.",
      "Click **Make the password** here, and paste it into the Web Connector's Password box (it's shown only once).",
      "Tick The Builder Station in the Web Connector and click **Update Selected**. It then updates every 15 minutes while running.",
      "Link any job or cost code that didn't match by name.",
    ],
    sections: [
      {
        heading: "On the page",
        items: [
          { name: "Connected to … · last update", what: "The QuickBooks company it reads and when it last did. Problems show in red." },
          { name: "Make the password / New password", what: "The Web Connector's password, shown once. A new one makes the old one stop working. Don't share it or take a picture of it." },
          { name: "Link by name again", what: "Matches jobs, cost codes and vendors by name again, using the last read from QuickBooks." },
          { name: "Jobs", what: "A job links when its name matches a QuickBooks Customer:Job exactly, or pick one from the list." },
          { name: "Cost codes", what: "Each cost code links to the QuickBooks item named with its code; pick any that didn't match." },
          { name: "Vendors", what: "How many of your vendors are linked. Vendors added or renamed in QuickBooks show up after the next update." },
          { name: "Disconnect", what: "Stops the Web Connector signing in and clears every link. Your QuickBooks file isn't touched." },
        ],
      },
    ],
    related: ["vendors", "invoices"],
  },
  {
    slug: "lead-sources",
    title: "Settings: Lead sources",
    group: "Settings",
    area: "lists",
    pages: ["/settings/lead-sources"],
    what: "Your list of where leads come from: Referral, Website, Parade of Homes. You pick one on each lead, and Reports shows your win rate by source.",
    how: ["Go to **Settings → Lead sources**.", "Click a common source to add it, or type your own and click **Add**."],
    sections: [
      {
        heading: "On the page",
        items: [
          { name: "Rename", what: "Renames a source, and every lead and client using it." },
          { name: "Trash", what: "Removes a source from the list. Leads keep the name they had." },
          { name: "Always offered", what: "Common sources (Referral, Past client, Website, Facebook, Google, Yard sign, Home show, Realtor, Other) are offered on every lead anyway. Click one to put it in your list." },
        ],
      },
    ],
    related: ["leads", "reports"],
  },
  {
    slug: "account",
    title: "Your account",
    group: "Getting started",
    area: null,
    pages: [],
    what: "**Your account** (click your name at the top right) is where you change your password, turn on two-step sign-in, choose the morning email, and sign out everywhere.",
    how: ["Click your name at the top right.", "Change what you need. Each part has its own button."],
    sections: [
      {
        heading: "On the page",
        items: [
          { name: "Password", what: "Type your current password and the new one twice (at least 10 characters). Changing it signs out your other devices." },
          {
            name: "Two-step sign-in",
            what: "Signing in also asks for a 6-digit code from an app on your phone, so a stolen password alone can't get in.",
            how: "Click **Set up two-step sign-in**, scan the code with an authenticator app (Google Authenticator, Microsoft Authenticator…), type the code it shows, and save your backup codes somewhere safe. Each backup code works once, for when you don't have your phone.",
          },
          { name: "Morning email", what: "One email each morning with what's yours that day: to-dos and reminders due, tasks starting, selections waiting on a choice. None on a day with nothing due." },
          { name: "Sign out everywhere", what: "Signs you out on every phone and computer, including this one, for a lost phone or a shared computer." },
        ],
      },
    ],
    tips: ["If your company requires two-step sign-in (Settings → Team), you can't turn it off."],
    related: ["team"],
  },
];
