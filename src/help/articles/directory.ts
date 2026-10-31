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
          { name: "Name, Position, Phone, Email", what: "Everyone on your team who's active. Click a phone number to call it, or an email to write to them." },
          {
            name: "Invite, positions & sign-ins",
            what: "Admins only: opens **Settings → Team & positions**, where you invite people and set what each position can see and change. Those are set once, so they stay in Settings.",
          },
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
      "Add one with **Add a vendor**, or paste or upload your whole list with **Have a list?**",
      "Open a vendor to see their paperwork and drop their files on it.",
      "Set up what paperwork you ask for in **Paperwork settings**.",
    ],
    sections: [
      {
        heading: "The vendor list",
        items: [
          { name: "Paperwork settings", what: "The kinds of paper you track (W-9, Insurance, your own), which ones new vendors start needing, and who on your team handles it." },
          { name: "Add a vendor", what: "Name, contact, phone, email, notes, and **Cost codes they bid**: picked for them when you send a list out for bids." },
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
          { name: "Edit", what: "Changes a vendor. A new name changes everywhere: Item List, bids, POs." },
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
    what: "A vendor's page shows who they are and their **Paperwork**: one line for each paper you need from them, with the file on it and where it stands. Their POs, bills and portal sign-ins are folded away underneath.",
    how: [
      "Open the vendor from **Directory → Subs & vendors**.",
      "Drag their W-9 (or any paper) from your computer onto its line — or click **Add file** on the line.",
      "For Insurance, type the date it expires in the box that shows up on the line.",
      "Not needing something from this vendor (a one-time small job)? Click **What they need** and untick it.",
    ],
    sections: [
      {
        heading: "Paperwork",
        items: [
          {
            name: "What they need",
            what: "Tick the papers you need from this vendor and click **Save**. A new vendor starts with your usual set (Paperwork settings). Nothing ticked means nothing about them is ever flagged.",
          },
          { name: "Add file / Add another", what: "Puts a file on that line. You can also drag a file from your computer onto the line." },
          {
            name: "When does it expire?",
            what: "On a paper that expires (Insurance): the date. Type it and click away. Insurance can hold more than one certificate (General liability and Workers' comp) and counts down to the first one to run out. An expired one is crossed out once a current one is there.",
          },
          {
            name: "On file / Good till / days left / Missing / Expired",
            what: "Where each line stands. **Missing** and **Expired** show how many days it's been. Amber means it runs out within 30 days.",
          },
          { name: "They sent it — look it over / It's good", what: "A paper they uploaded from their portal. It counts once you click **It's good**." },
          { name: "×", what: "Takes that file off the line." },
        ],
      },
      {
        heading: "Folded away",
        items: [
          { name: "POs · Bills", what: "Every purchase order to this vendor, with its job, status and total. Click a PO number to open it." },
          {
            name: "Portal sign-ins",
            what: "People at this vendor who sign in to the vendor portal: they see and accept their POs, see their schedule items, and send bills and paperwork. They never see your client prices or budgets.",
            how: "Type their email and click **Invite** (the link lasts 7 days). **Turn off** signs them out; **Send password reset** emails them a link.",
          },
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
    what: "The papers you want from subs and vendors. **W-9** and **Insurance** are built in; add your own, like a Contractor agreement or a Business license. Each vendor's page shows a line for each one they need.",
    how: [
      "Go to **Directory → Subs & vendors** and click **Paperwork settings**.",
      "To add one, type its name, tick **Has an expiry date** if it runs out, tick **New vendors need it** if most will, and click **Add**.",
      "Under **Who handles it**, tick the person or position who follows up on paperwork, and click **Save**.",
    ],
    sections: [
      {
        heading: "What you ask for",
        items: [
          { name: "Has an expiry date", what: "The paper runs out, so each file on it gets a date (Insurance always does; a W-9 never does)." },
          { name: "New vendors need it", what: "Ticked for every vendor you add from now on. Vendors you already have keep what they're set to; untick it on any vendor's page." },
          { name: "Remove", what: "Takes one of your own kinds off, with the files vendors had on it. W-9 and Insurance can't be removed — untick **New vendors need it** instead." },
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
