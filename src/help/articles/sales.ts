import type { HelpArticle } from "../types";

export const SALES: HelpArticle[] = [
  {
    slug: "dashboard",
    title: "Dashboard",
    group: "Getting started",
    area: null,
    pages: ["/dashboard"],
    what: "The **Dashboard** is your home screen: cards with your jobs, sales, money and to-dos at a glance. Each person picks and arranges their own cards.",
    how: [
      "Click **Dashboard** in the menu (or the logo).",
      "Click **Customize** to tick the cards you want, then **Save**.",
      "Drag a card by its grip (top right of the card) to move it: into a column, or into the wide band across the top. It saves when you let go.",
    ],
    sections: [
      {
        heading: "Arranging it",
        items: [
          { name: "Customize", what: "Your list of cards. Tick the ones you want and click **Save**. **Reset to default** puts back the starting cards and layout." },
          { name: "Grip", what: "Drag a card by it to move it. A blue line shows where it will land." },
          { name: "Show all N / Show fewer", what: "Lists inside a card show 4 at first." },
        ],
      },
      {
        heading: "The cards",
        items: [
          { name: "Key numbers", what: "Active projects, their contract value, receivables (invoiced, not paid), your to-dos, and client approvals waiting." },
          { name: "Active projects", what: "Each job being built, with its contract value and schedule progress." },
          { name: "Sales pipeline", what: "Open leads by stage, follow-ups due (red when some are), and your win rate over 12 months." },
          { name: "Subs & vendors", what: "Bills waiting for approval and vendor insurance running out. Shows if your position sees Purchasing." },
          { name: "Needs attention", what: "Overdue selections and to-dos, change orders waiting on the client, and late invoices. Each links to its job." },
          { name: "My to-dos", what: "Your open to-dos, soonest first.", how: "Click the round button to mark one done." },
          { name: "Upcoming schedule", what: "Tasks starting in the next 7 days." },
          { name: "Recent activity", what: "What's happened lately across your jobs." },
          { name: "Job profit / Over / under billing / Cash next 30 days / What clients owe", what: "Report cards for admins and anyone who sees Reports. Not on until you tick them in Customize. **Bill it** on an under-billed job starts an invoice." },
          { name: "Getting started", what: "Admins: the first steps for a new company: logo, team, first client, first job, plans, takeoff, cost codes, prices. It goes away when they're done, or with its X." },
        ],
      },
    ],
    related: ["getting-started", "leads", "reports"],
  },
  {
    slug: "leads",
    title: "Leads",
    group: "Jobs",
    area: "leads",
    pages: ["/leads", "/leads/new", "/leads/*"],
    what: "**Leads** tracks everyone who might hire you, from the first call to won or lost. Each lead moves through stages (Inquiry, Meeting, Estimate, Proposal sent, Won) with follow-ups so nobody falls through the cracks. At **Estimate**, a lead becomes a job so you can do the takeoff and estimate.",
    how: [
      "Click **Leads**, then **+ New lead**. Only a name is needed; fill in what you know, and keep the **First follow-up** so it lands in your To-Dos.",
      "When you call or meet them, open the lead and log it, and mark the follow-up **Done**. It asks when the next one is.",
      "Set a meeting under **Meeting**: it goes on the calendar and the lead moves to Meeting.",
      "Ready to price it? Drag the lead to **Estimate** (or click **3. Estimate**). It becomes a client and a job, and you estimate it there.",
      "If they say no, drop it on **Lost** and pick why. Your win rate and Reports use it.",
    ],
    sections: [
      {
        heading: "The Leads page",
        items: [
          { name: "Open leads / Follow-ups due / Win rate / Won", what: "What's in the pipeline, follow-ups due (and leads with none set), and your win rate and wins over 12 months." },
          { name: "Board / List", what: "**Board** shows a column per stage; drag a lead to move it. **List** is a table you can filter by stage and sort by newest, next follow-up, value or stage." },
          { name: "Everyone / Mine / a person", what: "Whose leads to show." },
          { name: "A lead's card", what: "Name, what they want, value, source, the job number once it's a job, and the next follow-up (\"No follow-up\" in amber when none is set). The number of days is how long it's been in this stage." },
          { name: "Lost", what: "Drop a lead here and pick the reason: Price, Went with another builder, Timing, Project cancelled, Stopped responding, Not a fit for us, or type your own." },
        ],
      },
      {
        heading: "A lead's page",
        items: [
          { name: "1. Inquiry … 5. Won", what: "Moves the lead to that stage. Once it's a job, it can't go back before Estimate, and the job moves it along (sending the estimate makes it Proposal sent)." },
          { name: "Lost…", what: "Marks it lost with a reason. Picking a stage again reopens it." },
          { name: "Follow-up", what: "A to-do for whoever's on it; it shows in To-Dos, on the Dashboard and the calendar.", how: "When it's done, pick how (Called, Emailed, Met, Other), note what happened, and click **Done**. Then set the next one with a date, a note and who." },
          { name: "Log", what: "Calls, emails, meetings and notes, plus every stage change.", how: "Pick the kind, type what happened, and click **Add**." },
          { name: "Contact", what: "Tap the phone to call, or the email to write." },
          { name: "Meeting", what: "Sets the meeting date and time. It goes on the calendar as a to-do for the lead's owner." },
          { name: "Edit details", what: "Name, phone, email, company, address, what they want, kind of job, rough budget, how they found you, whose lead it is, and notes." },
          { name: "Delete lead", what: "Removes a lead that isn't a job. To keep it in your win rate, mark it lost instead." },
        ],
      },
    ],
    tips: ["A job started directly in Projects (still being sold) gets a lead added by itself, so your pipeline stays complete."],
    related: ["clients", "projects", "reports", "lead-sources"],
  },
  {
    slug: "clients",
    title: "Clients",
    group: "Jobs",
    area: "leads",
    pages: ["/clients", "/clients/new", "/clients/*", "/clients/*/edit"],
    what: "**Clients** lists the people you build for: their contact details, their jobs, and their sign-in to the client portal, where they follow their job, make selections, approve change orders and pay invoices.",
    how: [
      "Click **Clients**, then **+ New client**. (A lead that becomes a job makes its client by itself.)",
      "Fill in their name, contact details and address, and click **Create client**.",
      "On the client's page, type their email under **Client portal access** and click **Invite to the client portal**. They get an email to choose their own password.",
    ],
    sections: [
      {
        heading: "The list",
        items: [
          { name: "Search", what: "Finds clients by name, company, email, phone or city." },
          { name: "Portal", what: "A badge on clients who have a portal sign-in." },
        ],
      },
      {
        heading: "A client's page",
        items: [
          { name: "Projects", what: "Their jobs, with status and contract value." },
          { name: "Edit", what: "Name, company, source, email, phone, address and notes (gate codes, preferences)." },
          { name: "Invite to the client portal", what: "Emails them a link to choose their own password. A waiting invite can be resent or cancelled." },
          { name: "Email a password reset link", what: "For a client who forgot their password." },
          { name: "Revoke access", what: "Deletes their portal sign-in." },
          { name: "Delete client", what: "On Edit. Only a client with no projects can be deleted." },
        ],
      },
    ],
    tips: ["When you send a proposal, change order or invoice to a client with no sign-in yet, the email includes a link to set one up."],
    related: ["leads", "projects"],
  },
];
