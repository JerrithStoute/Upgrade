import type { HelpArticle } from "../types";

/** The Directory: the people you work with — clients, subs & vendors (with their paperwork), and your team. */
export const DIRECTORY: HelpArticle[] = [
  {
    slug: "directory",
    title: "Directory",
    group: "Directory",
    area: null,
    pages: ["/directory", "/team"],
    what: "The **Directory** is everyone you work with, in three tabs: **Clients**, **Subs & vendors** (with the paperwork you need from each), and your own **Team** with their phone numbers and emails.",
    how: [
      "Click **Directory** in the menu. It opens on the first tab your position can see.",
      "Click a tab to switch between Clients, Subs & vendors and Team.",
    ],
    sections: [
      {
        heading: "Team",
        items: [
          { name: "A name", what: "Opens that person's page: their info, what they can see and change, their jobs, and their sign-in. Click a phone number to call it, or an email to write to them." },
          { name: "Invite someone / Positions", what: "Admins: invite people at the bottom of the list, and set what each position sees with **Positions** at the top — without leaving the Directory." },
        ],
      },
    ],
    tips: ["Adding a client or vendor while you're doing something else? Pick **+ New client…** or **+ New vendor…** at the bottom of the list you're in — you never leave the page."],
    related: ["clients", "vendors", "team"],
  },
  {
    slug: "vendors",
    title: "Directory: Subs & vendors",
    group: "Directory",
    area: "lists",
    pages: ["/vendors"],
    what: "**Subs & vendors** is your list of suppliers and subcontractors: who you ask for prices and send purchase orders to, the cost codes they bid, and whether their paperwork is all in. You don't have to set them up first: a vendor is added the first time you type one, or with **+ New vendor…** in any vendor list.",
    how: [
      "Go to **Directory → Subs & vendors**.",
      "Add one with **Add a vendor**: type the name and click **Add and open** — their page opens to fill in the rest. Or paste or upload your whole list with **Have a list?**",
      "Click a vendor (or **Edit** on their row) to open their page: their info, paperwork and insurance.",
      "Set up what paperwork you ask for in **Paperwork settings**.",
    ],
    sections: [
      {
        heading: "The vendor list",
        items: [
          { name: "Paperwork settings", what: "The kinds of paper and the insurance coverages you track, which ones new subs start needing, and who on your team handles it." },
          { name: "Add a vendor", what: "Type the name and click **Add and open**. Their page opens, where you fill in the rest." },
          {
            name: "Have a list? Paste or upload it",
            what: "Paste rows from Excel or upload a CSV or Excel file (QuickBooks and CoConstruct exports work), one vendor per line, name first. Vendors you have are kept; only their blank details are filled in.",
          },
          {
            name: "Your bid email message",
            what: "Your own words in the middle of every bid email. The greeting, the bid's note, the job, the delivery address and your signature are filled in around them for each bid. Blank uses the built-in message.",
            how: "Type it and click **Save**, or tick **Use as my standard message** under the message in any bid's email.",
          },
          {
            name: "Paperwork (column)",
            what: "**All in**, **Nothing needed**, or what's missing or running out (W-9 missing · Insurance expires Nov 18). Also papers they sent from their portal for you to look over, and how many portal sign-ins they have.",
          },
          { name: "Edit", what: "Opens the vendor's page with their info ready to change. A new name changes everywhere: Item List, bids, POs." },
          { name: "Delete", what: "Removes the vendor and their paperwork files. Their bids stay on your jobs." },
        ],
      },
    ],
    related: ["vendor-page", "paperwork-settings", "purchasing", "bids"],
  },
  {
    slug: "vendor-page",
    title: "A sub's or vendor's page and their paperwork",
    group: "Directory",
    area: "lists",
    pages: ["/vendors/*"],
    what: "Everything about one sub or vendor on one page: their **Company info** (edited right here), their **Paperwork** and **Insurance** — what you need from this sub, what's on file and when it runs out — the **Jobs and POs** you have with them, and their **Portal sign-ins**.",
    how: [
      "Open the vendor from **Directory → Subs & vendors** (or click **Edit** on their row).",
      "Tick **Need it** on each line you need from this sub. Every sub is different: your framer may need only a W-9, your HVAC sub insurance too.",
      "Drop their W-9 (or any paper) on its line, or click **Add file**.",
      "For insurance, click **Add the policy** on a coverage, type the carrier, policy # and expiry date, and add the certificate — or pick one already on this sub.",
    ],
    sections: [
      {
        heading: "Company info",
        items: [
          { name: "Edit", what: "Turns the box into fields: name, contact, phone, email, address, license #, tax ID, the cost codes they bid, and notes. **Save** keeps you on this page." },
          { name: "Tax ID", what: "For 1099s. Shown with all but the last 4 digits hidden; Edit shows it whole." },
          { name: "Bids on", what: "The cost codes they bid — picked for them when you send to vendors or subs. Their trades show as tags under their name." },
        ],
      },
      {
        heading: "Paperwork and Insurance",
        items: [
          { name: "Need it", what: "Whether you need this paper from this sub. Unticked lines stay greyed and are never flagged. New subs start with what your Paperwork settings ask every new sub for." },
          {
            name: "On file / Good till / days left / Missing / Expired",
            what: "Where each line stands. **Missing** and **Expired** show how many days it's been. Amber means it runs out within 30 days.",
          },
          { name: "Add file / Add another", what: "Puts a file on a paper that doesn't expire (a W-9). You can also drop a file on the line." },
          {
            name: "Add the policy / Add a renewal",
            what: "On a coverage (General liability, Workers' comp…): the carrier, policy # and expiry date, and the certificate — a new file, or **a file already here** (one certificate usually covers several policies). Dropping a file on the line opens the same boxes.",
          },
          { name: "Pencil", what: "Fixes what's typed on a paper: its carrier, number or date." },
          { name: "×", what: "Takes a paper off the line. Its file goes too, unless another line uses the same certificate." },
          { name: "They sent it — look it over / It's good", what: "A paper they sent from their portal. It counts once you click **It's good**." },
          { name: "Add paperwork / Add a coverage", what: "A new kind (Contractor agreement, Lien waiver…) or coverage (Builder's risk…), added to your list and needed from this sub. **Ask every new sub** also ticks it for subs you add from now on." },
        ],
      },
      {
        heading: "Jobs and POs, sign-ins",
        items: [
          { name: "Jobs and POs", what: "Every PO to this vendor: the job, the PO, what it's for, its status, its total, what they've billed, and what's left." },
          {
            name: "Portal sign-ins",
            what: "People at this vendor who sign in to the vendor portal: they see and accept their POs, see their schedule, and send bills and paperwork. They never see your client prices or budgets.",
            how: "Type their email and click **Invite** (the link lasts 7 days). **Turn off** signs them out; **Send password reset** emails them a link.",
          },
          { name: "Delete", what: "Removes the vendor and their paperwork files. Their bids and POs stay on your jobs." },
        ],
      },
    ],
    tips: [
      "You're reminded where you hand out work: over their bid when you take it, on their POs and bills, when you pick them for a schedule task or warranty request, and on the job's subs list. It's a note, never a stop.",
      "The dashboard's **Subs & vendors** card lists everyone with paperwork to follow up, longest first, and who handles it.",
      "Nothing is emailed to a sub about their paperwork by the program — you decide when to ask.",
    ],
    related: ["vendors", "paperwork-settings", "notifications"],
  },
  {
    slug: "paperwork-settings",
    title: "Paperwork settings",
    group: "Directory",
    area: "lists",
    pages: ["/vendors/paperwork"],
    what: "Your own lists of what you ask subs for: **paperwork** (the W-9 is built in; add a Contractor agreement, a Business license…) and the **insurance coverages** you track (General liability, Workers' comp, Auto and Umbrella to start — rename, add or remove any). Each is a line on every sub's page, where **Need it** says what you need from that sub.",
    how: [
      "Go to **Directory → Subs & vendors** and click **Paperwork settings**.",
      "To add one, type its name, tick **New subs need it** if most of your subs will, and click **Add**. (A paper that runs out: tick **Has an expiry date** — it gets a number and a date, typed in.)",
      "Under **Who handles it**, tick the person or position who follows up on paperwork, and click **Save**.",
    ],
    sections: [
      {
        heading: "Your lists",
        items: [
          { name: "New subs need it", what: "Ticked for every sub you add from now on. Subs you already have keep what they're set to; change it on any sub with **Need it**." },
          { name: "Has an expiry date", what: "The paper runs out, so each one gets its number and date typed in (insurance coverages always do; a W-9 never does)." },
          { name: "Remove", what: "Takes a kind or coverage off your list, with the papers subs had on it. The W-9 can't be removed — untick **New subs need it** instead." },
        ],
      },
      {
        heading: "Who handles it",
        items: [
          {
            name: "Positions / People",
            what: "Who follows up on subs' paperwork. They're named beside each sub on the dashboard's list, so when one sits there you know who to ask. The weekly paperwork email is in Settings → Email notifications (off until you turn it on).",
          },
        ],
      },
    ],
    related: ["vendor-page", "notifications"],
  },
];
